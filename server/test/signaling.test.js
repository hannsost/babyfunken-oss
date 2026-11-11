import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioClient } from 'socket.io-client';
import { createServer } from '../index.js';
import { loadConfig } from '../lib/config.js';
import * as P from '@babyfunken/shared/protocol';

let server, url, sockets;

/** Opens a client and resolves once the server has said hello. */
function connect() {
  return new Promise((resolve, reject) => {
    const socket = ioClient(url, { transports: ['websocket'], forceNew: true });
    sockets.push(socket);
    const timer = setTimeout(() => reject(new Error('connect timeout')), 4000);
    socket.on(P.HELLO_ACK, (hello) => {
      clearTimeout(timer);
      socket.hello = hello;
      resolve(socket);
    });
    socket.on('connect_error', (e) => { clearTimeout(timer); reject(e); });
  });
}

/** Resolves with the next `event` payload, or rejects on timeout. */
function next(socket, event, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
  });
}

/** Resolves true if `event` does NOT arrive within the window. */
async function silentFor(socket, event, ms = 400) {
  try {
    await next(socket, event, ms);
    return false;
  } catch {
    return true;
  }
}

async function createGroup(name = 'Kamera') {
  const owner = await connect();
  const created = next(owner, P.GROUP_CREATED);
  owner.emit(P.GROUP_CREATE, { displayName: name });
  return { owner, ...(await created) };
}

before(async () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    PORT: '0',
    ALLOWED_ORIGINS: '*',
    SERVE_WEBAPP: 'false',
    TURN_SECRET: 'test-secret',
    TURN_URLS: 'turn:turn.example.test:3478',
    RATE_LIMIT_JOIN_ATTEMPTS: '3',
    RATE_LIMIT_JOIN_WINDOW_MS: '60000',
    RATE_LIMIT_BLOCK_MS: '60000',
  });
  server = createServer(config);
  await new Promise(resolve => server.httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.httpServer.address().port}`;
});

after(async () => {
  server.dispose();
  await new Promise(resolve => server.httpServer.close(resolve));
});

beforeEach(() => { sockets = []; });

// Disconnect every socket a test opened.
test.afterEach?.(() => sockets.forEach(s => s.disconnect()));

describe('handshake', () => {
  test('greets with protocol version, device id and ICE servers', async () => {
    const socket = await connect();
    assert.equal(socket.hello.protocol, P.PROTOCOL_VERSION);
    assert.ok(socket.hello.deviceId);
    assert.ok(Array.isArray(socket.hello.lullabies) && socket.hello.lullabies.length > 0);

    const turn = socket.hello.iceServers.find(s => String(s.urls).includes('turn:'));
    assert.ok(turn, 'a TURN server should be offered');
    assert.match(turn.username, /^\d+:/, 'TURN username should be <expiry>:<id>');
    assert.ok(turn.credential.length > 0);
    socket.disconnect();
  });

  test('TURN credentials differ per connection', async () => {
    const a = await connect();
    const b = await connect();
    const credOf = (s) => s.hello.iceServers.find(x => String(x.urls).includes('turn:')).credential;
    assert.notEqual(credOf(a), credOf(b));
    a.disconnect(); b.disconnect();
  });

  test('never leaks the TURN shared secret', async () => {
    const socket = await connect();
    assert.equal(JSON.stringify(socket.hello).includes('test-secret'), false);
    socket.disconnect();
  });
});

describe('group creation and joining', () => {
  test('creates a group and returns credentials once', async () => {
    const { owner, groupId, secret, deviceToken } = await createGroup();
    assert.equal(groupId.length, 8);
    assert.ok(secret && deviceToken);
    owner.disconnect();
  });

  test('a second device joins with code plus secret', async () => {
    const { owner, groupId, secret } = await createGroup();
    const guest = await connect();

    const joined = next(guest, P.GROUP_JOINED);
    guest.emit(P.GROUP_JOIN, { groupId, secret, displayName: 'Mamas Handy' });
    const payload = await joined;

    assert.equal(payload.groupId, groupId);
    assert.equal(payload.devices.length, 2);
    assert.ok(payload.deviceToken);
    owner.disconnect(); guest.disconnect();
  });

  test('the code alone is not enough', async () => {
    const { owner, groupId } = await createGroup();
    const attacker = await connect();

    const failed = next(attacker, P.GROUP_ERROR);
    attacker.emit(P.GROUP_JOIN, { groupId, displayName: 'nicht eingeladen' });
    assert.equal((await failed).code, P.ERR_GROUP_NOT_FOUND);
    owner.disconnect(); attacker.disconnect();
  });

  test('never discloses the device token of another member', async () => {
    const { owner, groupId, secret } = await createGroup();
    const guest = await connect();
    const joined = next(guest, P.GROUP_JOINED);
    guest.emit(P.GROUP_JOIN, { groupId, secret, displayName: 'Gast' });

    for (const device of (await joined).devices) {
      assert.equal('token' in device, false, 'device tokens must not be broadcast');
    }
    owner.disconnect(); guest.disconnect();
  });

  test('rejects a malformed code without consuming a join attempt', async () => {
    const attacker = await connect();
    const failed = next(attacker, P.GROUP_ERROR);
    attacker.emit(P.GROUP_JOIN, { groupId: 'nope', displayName: 'x' });
    assert.equal((await failed).code, P.ERR_BAD_REQUEST);
    attacker.disconnect();
  });
});

describe('pairing window', () => {
  test('closing it locks out new devices even with the secret', async () => {
    const { owner, groupId, secret } = await createGroup();
    owner.emit(P.PAIRING_CLOSE);
    await next(owner, P.PAIRING_STATE);

    const guest = await connect();
    const failed = next(guest, P.GROUP_ERROR);
    guest.emit(P.GROUP_JOIN, { groupId, secret, displayName: 'zu spät' });
    assert.equal((await failed).code, P.ERR_PAIRING_CLOSED);
    owner.disconnect(); guest.disconnect();
  });

  test('reopening lets them in again', async () => {
    const { owner, groupId, secret } = await createGroup();
    owner.emit(P.PAIRING_CLOSE);
    await next(owner, P.PAIRING_STATE);
    owner.emit(P.PAIRING_OPEN);
    await next(owner, P.PAIRING_STATE);

    const guest = await connect();
    const joined = next(guest, P.GROUP_JOINED);
    guest.emit(P.GROUP_JOIN, { groupId, secret, displayName: 'jetzt schon' });
    assert.equal((await joined).groupId, groupId);
    owner.disconnect(); guest.disconnect();
  });
});

describe('rate limiting', () => {
  test('blocks after repeated failed joins', async () => {
    const attacker = await connect();
    let lastCode = null;
    for (let i = 0; i < 6; i++) {
      const failed = next(attacker, P.GROUP_ERROR);
      attacker.emit(P.GROUP_JOIN, { groupId: 'ZZZZZZZZ', secret: 'guess', displayName: 'x' });
      lastCode = (await failed).code;
    }
    assert.equal(lastCode, P.ERR_RATE_LIMITED);
    attacker.disconnect();
  });
});

describe('signaling isolation', () => {
  test('an offer aimed at another group is dropped', async () => {
    const groupA = await createGroup('A');
    const groupB = await createGroup('B');

    const leaked = silentFor(groupB.owner, P.SIGNAL_OFFER, 500);
    groupA.owner.emit(P.SIGNAL_OFFER, {
      targetDeviceId: groupB.owner.id,
      sdp: { type: 'offer', sdp: 'malicious' },
    });

    assert.equal(await leaked, true, 'cross-group offer must not be delivered');
    groupA.owner.disconnect(); groupB.owner.disconnect();
  });

  test('an offer inside the group is delivered with the sender id', async () => {
    const { owner, groupId, secret } = await createGroup();
    const guest = await connect();
    guest.emit(P.GROUP_JOIN, { groupId, secret, displayName: 'Gast' });
    await next(guest, P.GROUP_JOINED);

    const incoming = next(guest, P.SIGNAL_OFFER);
    owner.emit(P.SIGNAL_OFFER, { targetDeviceId: guest.id, sdp: { type: 'offer', sdp: 'v=0' } });
    const offer = await incoming;

    assert.equal(offer.fromDeviceId, owner.id);
    assert.equal(offer.sdp.sdp, 'v=0');
    owner.disconnect(); guest.disconnect();
  });

  test('a camera is told to offer when a monitor joins', async () => {
    const { owner, groupId, secret } = await createGroup();
    owner.emit(P.ROLE_SET, { role: P.ROLE_SERVER });

    const initiate = next(owner, P.SIGNAL_INITIATE);
    const guest = await connect();
    guest.emit(P.GROUP_JOIN, { groupId, secret, displayName: 'Monitor' });

    assert.equal((await initiate).peerDeviceId, guest.id);
    owner.disconnect(); guest.disconnect();
  });
});

describe('alerts', () => {
  test('a cry alert reaches the other device, tagged with its origin', async () => {
    const { owner, groupId, secret } = await createGroup('Kinderzimmer');
    const guest = await connect();
    guest.emit(P.GROUP_JOIN, { groupId, secret, displayName: 'Monitor' });
    await next(guest, P.GROUP_JOINED);

    const alert = next(guest, P.ALERT_CRY);
    owner.emit(P.ALERT_CRY, {});
    const payload = await alert;

    assert.equal(payload.fromDeviceName, 'Kinderzimmer');
    assert.ok(payload.at > 0);
    owner.disconnect(); guest.disconnect();
  });

  test('alerts do not escape the group', async () => {
    const groupA = await createGroup('A');
    const groupB = await createGroup('B');

    const leaked = silentFor(groupB.owner, P.ALERT_CRY, 500);
    groupA.owner.emit(P.ALERT_CRY, {});
    assert.equal(await leaked, true);
    groupA.owner.disconnect(); groupB.owner.disconnect();
  });
});

describe('lullabies', () => {
  test('a known id is relayed to the group', async () => {
    const { owner, groupId, secret } = await createGroup();
    const guest = await connect();
    guest.emit(P.GROUP_JOIN, { groupId, secret, displayName: 'Monitor' });
    await next(guest, P.GROUP_JOINED);

    const play = next(owner, P.LULLABY_PLAY);
    guest.emit(P.LULLABY_PLAY, { id: 'rain' });
    assert.equal((await play).id, 'rain');
    owner.disconnect(); guest.disconnect();
  });

  test('an unknown id is ignored', async () => {
    const { owner, groupId, secret } = await createGroup();
    const guest = await connect();
    guest.emit(P.GROUP_JOIN, { groupId, secret, displayName: 'Monitor' });
    await next(guest, P.GROUP_JOINED);

    const leaked = silentFor(owner, P.LULLABY_PLAY, 500);
    guest.emit(P.LULLABY_PLAY, { id: '../../etc/passwd' });
    assert.equal(await leaked, true);
    owner.disconnect(); guest.disconnect();
  });
});

describe('presence', () => {
  test('the group is told when a device drops', async () => {
    const { owner, groupId, secret } = await createGroup();
    const guest = await connect();
    guest.emit(P.GROUP_JOIN, { groupId, secret, displayName: 'Monitor' });
    await next(guest, P.GROUP_JOINED);

    const left = next(owner, P.GROUP_DEVICE_LEFT);
    const guestId = guest.id;
    guest.disconnect();

    assert.equal((await left).deviceId, guestId);
    owner.disconnect();
  });
});

describe('health endpoint', () => {
  test('reports status and protocol version', async () => {
    const res = await fetch(`${url}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.protocol, P.PROTOCOL_VERSION);
  });
});
