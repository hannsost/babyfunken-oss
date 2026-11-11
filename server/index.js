import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import * as P from '@babyfunken/shared/protocol';
import { isValidGroupCode, normaliseGroupCode, LULLABIES } from '@babyfunken/shared/constants';
import { loadConfig } from './lib/config.js';
import GroupManager, { publicDevice } from './lib/GroupManager.js';
import RateLimiter from './lib/rateLimit.js';
import { iceServersFor } from './lib/turn.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LULLABY_IDS = new Set(LULLABIES.map(l => l.id));

/** Trims and length-caps free text before it is echoed to other devices. */
function cleanName(value, fallback = 'Gerät') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.replace(/[\p{C}]/gu, '').trim().slice(0, 40);
  return trimmed || fallback;
}

export function createServer(config = loadConfig()) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);

  const httpServer = http.createServer(app);
  const corsOrigin = config.allowedOrigins.includes('*') ? true : config.allowedOrigins;

  const io = new Server(httpServer, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
    // Keeps sockets alive through the doze cycles an Android phone goes
    // into while it is sitting in a crib-side dock overnight.
    pingInterval: 20_000,
    pingTimeout: 40_000,
    maxHttpBufferSize: 256 * 1024,
  });

  const gm = new GroupManager();
  const joinLimiter = new RateLimiter({
    limit: config.rateLimit.joinAttempts,
    windowMs: config.rateLimit.joinWindowMs,
    blockMs: config.rateLimit.blockMs,
  });
  const createLimiter = new RateLimiter({
    limit: config.rateLimit.createPerHour,
    windowMs: 3_600_000,
    blockMs: config.rateLimit.blockMs,
  });

  const sweeper = setInterval(() => {
    joinLimiter.sweep();
    createLimiter.sweep();
  }, 60_000);
  sweeper.unref?.();

  // ── HTTP ────────────────────────────────────────────────────

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', protocol: P.PROTOCOL_VERSION, ...gm.stats() });
  });

  if (config.serveWebapp) {
    const dist = path.join(__dirname, '..', 'webapp', 'dist');
    app.use(express.static(dist, { maxAge: '1h', index: 'index.html' }));
    app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // ── Signaling ───────────────────────────────────────────────

  io.on('connection', (socket) => {
    const ip = socket.handshake.address;

    /** Emits a protocol error without leaking which part was wrong. */
    const fail = (code, message) => socket.emit(P.GROUP_ERROR, { code, message });

    const broadcast = (groupId, event, payload) =>
      socket.to(`group:${groupId}`).emit(event, payload);

    // Hand out ICE servers immediately: TURN credentials are short-lived,
    // so they are minted per connection rather than baked into the app.
    socket.emit(P.HELLO_ACK, {
      protocol: P.PROTOCOL_VERSION,
      deviceId: socket.id,
      iceServers: iceServersFor(config, socket.id),
      lullabies: LULLABIES,
    });

    socket.on(P.GROUP_CREATE, (payload = {}) => {
      const { allowed, retryAfterMs } = createLimiter.hit(ip);
      if (!allowed) return fail(P.ERR_RATE_LIMITED, `Zu viele Gruppen. Bitte in ${Math.ceil(retryAfterMs / 60000)} Minuten erneut versuchen.`);

      const displayName = cleanName(payload.displayName);
      const { groupId, secret, deviceToken, device } = gm.createGroup(socket.id, displayName);
      socket.join(`group:${groupId}`);

      socket.emit(P.GROUP_CREATED, { groupId, secret, deviceToken });
      socket.emit(P.GROUP_JOINED, {
        groupId,
        deviceToken,
        devices: [publicDevice(device)],
        pairing: gm.pairingState(groupId),
      });
      console.log(`[group] created ${groupId}`);
    });

    socket.on(P.GROUP_JOIN, (payload = {}) => {
      const groupId = normaliseGroupCode(payload.groupId);
      if (!isValidGroupCode(groupId)) return fail(P.ERR_BAD_REQUEST, 'Ungültiger Code.');

      const result = gm.joinGroup(socket.id, {
        groupId,
        secret: payload.secret,
        deviceToken: payload.deviceToken,
        displayName: cleanName(payload.displayName),
      });

      if (!result.ok) {
        // Only failures count against the limiter, so a household that
        // reconnects often is never locked out of its own nursery.
        const { allowed, retryAfterMs } = joinLimiter.hit(ip);
        if (!allowed) {
          return fail(P.ERR_RATE_LIMITED, `Zu viele Versuche. Bitte in ${Math.ceil(retryAfterMs / 60000)} Minuten erneut versuchen.`);
        }
        const messages = {
          group_not_found: 'Gruppe nicht gefunden oder Code ungültig.',
          pairing_closed:  'Diese Gruppe nimmt gerade keine neuen Geräte auf. Bitte im Kamera-Gerät die Kopplung öffnen.',
          group_full:      'Diese Gruppe ist voll.',
        };
        return fail(result.code, messages[result.code] ?? 'Beitritt nicht möglich.');
      }

      joinLimiter.reset(ip);
      socket.join(`group:${groupId}`);
      socket.emit(P.GROUP_JOINED, {
        groupId,
        deviceToken: result.deviceToken,
        devices: result.devices.map(publicDevice),
        pairing: gm.pairingState(groupId),
      });
      broadcast(groupId, P.GROUP_DEVICE_JOINED, { device: publicDevice(result.device) });
      console.log(`[group] join ${groupId} (${result.devices.length} devices)`);

      initiateSignaling(groupId, result.device);
    });

    socket.on(P.GROUP_LEAVE, () => handleLeave());

    socket.on(P.PAIRING_OPEN, () => {
      const state = gm.openPairing(socket.id);
      if (!state) return;
      io.to(`group:${state.groupId}`).emit(P.PAIRING_STATE, gm.pairingState(state.groupId));
    });

    socket.on(P.PAIRING_CLOSE, () => {
      const state = gm.closePairing(socket.id);
      if (!state) return;
      io.to(`group:${state.groupId}`).emit(P.PAIRING_STATE, gm.pairingState(state.groupId));
    });

    socket.on(P.ROLE_SET, ({ role } = {}) => {
      if (role !== P.ROLE_SERVER && role !== P.ROLE_CLIENT) return;
      const updated = gm.setRole(socket.id, role);
      if (!updated) return;
      broadcast(updated.groupId, P.GROUP_DEVICE_UPDATED, { device: publicDevice(updated.device) });
      if (role === P.ROLE_SERVER) {
        // A new camera needs to offer to everyone already watching.
        for (const device of gm.devicesOf(updated.groupId)) {
          if (device.deviceId !== socket.id && device.role === P.ROLE_CLIENT) {
            socket.emit(P.SIGNAL_INITIATE, { peerDeviceId: device.deviceId });
          }
        }
      }
    });

    socket.on(P.SETTINGS_UPDATE, ({ settings } = {}) => {
      if (!settings || typeof settings !== 'object') return;
      const updated = gm.updateSettings(socket.id, settings);
      if (!updated) return;
      broadcast(updated.groupId, P.GROUP_DEVICE_UPDATED, { device: publicDevice(updated.device) });
    });

    socket.on(P.DEVICE_STATUS, ({ status } = {}) => {
      if (!status || typeof status !== 'object') return;
      const updated = gm.updateStatus(socket.id, status);
      if (!updated) return;
      broadcast(updated.groupId, P.GROUP_DEVICE_UPDATED, { device: publicDevice(updated.device) });
    });

    // ── WebRTC relay ──
    // Every frame is checked against group membership. Without this a
    // connected socket could push an offer into a stranger's session.
    for (const event of [P.SIGNAL_OFFER, P.SIGNAL_ANSWER, P.SIGNAL_ICE, P.SIGNAL_RESTART]) {
      socket.on(event, (payload = {}) => {
        const { targetDeviceId, ...rest } = payload;
        if (!targetDeviceId || !gm.sameGroup(socket.id, targetDeviceId)) return;
        io.to(targetDeviceId).emit(event, { ...rest, fromDeviceId: socket.id });
      });
    }

    // ── Alerts ──
    for (const event of [P.ALERT_MOTION, P.ALERT_CRY]) {
      socket.on(event, () => {
        const entry = gm.getEntry(socket.id);
        if (!entry) return;
        broadcast(entry.groupId, event, {
          fromDeviceId: socket.id,
          fromDeviceName: entry.device.displayName,
          at: Date.now(),
        });
      });
    }

    // ── Lullabies ──
    // Pure relay: the audio file is bundled in the app and plays on the
    // camera device. Nothing is fetched, decoded or streamed here.
    socket.on(P.LULLABY_PLAY, ({ id } = {}) => {
      const entry = gm.getEntry(socket.id);
      if (!entry || !LULLABY_IDS.has(id)) return;
      io.to(`group:${entry.groupId}`).emit(P.LULLABY_PLAY, { id, requestedBy: socket.id });
    });

    socket.on(P.LULLABY_STOP, () => {
      const entry = gm.getEntry(socket.id);
      if (!entry) return;
      io.to(`group:${entry.groupId}`).emit(P.LULLABY_STOP, {});
    });

    socket.on(P.LULLABY_VOLUME, ({ volume } = {}) => {
      const entry = gm.getEntry(socket.id);
      if (!entry || typeof volume !== 'number') return;
      const clamped = Math.min(1, Math.max(0, volume));
      io.to(`group:${entry.groupId}`).emit(P.LULLABY_VOLUME, { volume: clamped });
    });

    socket.on(P.LULLABY_STATUS, (status = {}) => {
      const entry = gm.getEntry(socket.id);
      if (!entry) return;
      broadcast(entry.groupId, P.LULLABY_STATUS, status);
    });

    socket.on('disconnect', () => handleLeave());

    function handleLeave() {
      const left = gm.leaveGroup(socket.id);
      if (!left) return;
      socket.leave(`group:${left.groupId}`);
      broadcast(left.groupId, P.GROUP_DEVICE_LEFT, { deviceId: left.deviceId });
    }

    /** Tells the group's cameras to offer to a device that just joined. */
    function initiateSignaling(groupId, joiner) {
      for (const device of gm.devicesOf(groupId)) {
        if (device.role !== P.ROLE_SERVER || device.deviceId === joiner.deviceId) continue;
        io.to(device.deviceId).emit(P.SIGNAL_INITIATE, { peerDeviceId: joiner.deviceId });
      }
    }
  });

  /** Releases timers so tests and SIGTERM shut down cleanly. */
  const dispose = () => {
    clearInterval(sweeper);
    gm.dispose();
    io.close();
  };

  return { app, httpServer, io, gm, config, dispose };
}

// ── Entrypoint ──────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;

if (isMain) {
  let server;
  try {
    server = createServer();
  } catch (error) {
    console.error(`[config] ${error.message}`);
    process.exit(1);
  }

  const { httpServer, config, dispose } = server;
  httpServer.listen(config.port, config.host, () => {
    console.log(`[babyfunken] signaling v${P.PROTOCOL_VERSION} on ${config.host}:${config.port}`);
    console.log(`[babyfunken] TURN relay: ${config.turn.urls.length ? config.turn.urls.join(', ') : 'none (P2P/STUN only)'}`);
  });

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      console.log(`[babyfunken] ${signal}, shutting down`);
      dispose();
      httpServer.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    });
  }
}
