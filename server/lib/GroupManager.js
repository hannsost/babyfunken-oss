import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  PAIRING_WINDOW_MS,
  GROUP_TTL_MS,
  MAX_DEVICES_PER_GROUP,
  DEFAULT_SETTINGS,
} from '@babyfunken/shared/constants';
import { ROLE_CLIENT } from '@babyfunken/shared/protocol';

/** Cryptographically uniform pick from CODE_ALPHABET (no modulo bias). */
function secureCode(length = CODE_LENGTH) {
  const n = CODE_ALPHABET.length;           // 32 — divides 256 evenly
  const max = Math.floor(256 / n) * n;      // guard anyway, so the code
  let out = '';                             // survives an alphabet change
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= max) continue;
      out += CODE_ALPHABET[byte % n];
      if (out.length === length) break;
    }
  }
  return out;
}

const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest();

/** Constant-time comparison that tolerates differing lengths. */
function secretMatches(candidate, expectedHash) {
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  return timingSafeEqual(sha256(candidate), expectedHash);
}

/**
 * Owns all group state. Everything here is in-memory and deliberately
 * small: the server relays signaling and holds no media, no recordings
 * and no account data.
 */
export default class GroupManager {
  constructor({ now = () => Date.now() } = {}) {
    this._now = now;
    /** @type {Map<string, Group>} */
    this.groups = new Map();
    /** @type {Map<string, {groupId: string, device: object}>} */
    this.entries = new Map();
    /** @type {Map<string, NodeJS.Timeout>} */
    this._reapTimers = new Map();
  }

  /** Creates a group and returns the credentials its owner needs. */
  createGroup(socketId, displayName) {
    let groupId = secureCode();
    while (this.groups.has(groupId)) groupId = secureCode();

    const secret = randomBytes(24).toString('base64url');
    const deviceToken = randomBytes(24).toString('base64url');
    const device = this._makeDevice(socketId, displayName, deviceToken);

    this.groups.set(groupId, {
      groupId,
      secretHash: sha256(secret),
      createdAt: this._now(),
      pairingOpenUntil: this._now() + PAIRING_WINDOW_MS,
      devices: new Map([[socketId, device]]),
      tokens: new Map([[deviceToken, { displayName, role: device.role }]]),
    });
    this.entries.set(socketId, { groupId, device });
    this._cancelReap(groupId);

    return { groupId, secret, deviceToken, device };
  }

  /**
   * Joins an existing group. Either a valid `deviceToken` from a previous
   * session or the group `secret` plus an open pairing window is required.
   * Returns `{ ok: false, code }` rather than throwing so the caller can
   * map failures onto protocol error codes.
   */
  joinGroup(socketId, { groupId, secret, deviceToken, displayName }) {
    const group = this.groups.get(groupId);
    if (!group) return { ok: false, code: 'group_not_found' };

    this._cancelReap(groupId);

    // Already in this group on this socket — idempotent rejoin.
    const existing = this.entries.get(socketId);
    if (existing?.groupId === groupId) {
      return { ok: true, device: existing.device, devices: this.devicesOf(groupId), deviceToken: existing.device.token };
    }

    const known = deviceToken ? group.tokens.get(deviceToken) : null;
    if (!known) {
      if (!secretMatches(secret, group.secretHash)) {
        return { ok: false, code: 'group_not_found' };  // same answer as a bad code: no oracle
      }
      if (this._now() > group.pairingOpenUntil) {
        return { ok: false, code: 'pairing_closed' };
      }
    }

    if (group.devices.size >= MAX_DEVICES_PER_GROUP) {
      return { ok: false, code: 'group_full' };
    }

    const token = known ? deviceToken : randomBytes(24).toString('base64url');
    const name = displayName || known?.displayName || 'Gerät';
    const device = this._makeDevice(socketId, name, token);
    if (known?.role) device.role = known.role;

    group.devices.set(socketId, device);
    group.tokens.set(token, { displayName: name, role: device.role });
    this.entries.set(socketId, { groupId, device });

    return { ok: true, device, devices: this.devicesOf(groupId), deviceToken: token };
  }

  leaveGroup(socketId) {
    const entry = this.entries.get(socketId);
    if (!entry) return null;

    const { groupId, device } = entry;
    const group = this.groups.get(groupId);
    if (group) {
      group.devices.delete(socketId);
      if (group.devices.size === 0) this._scheduleReap(groupId);
    }
    this.entries.delete(socketId);
    return { groupId, deviceId: socketId, device };
  }

  /** Reopens the pairing window. Only a device already in the group may. */
  openPairing(socketId) {
    const entry = this.entries.get(socketId);
    const group = entry && this.groups.get(entry.groupId);
    if (!group) return null;
    group.pairingOpenUntil = this._now() + PAIRING_WINDOW_MS;
    return { groupId: group.groupId, pairingOpenUntil: group.pairingOpenUntil };
  }

  closePairing(socketId) {
    const entry = this.entries.get(socketId);
    const group = entry && this.groups.get(entry.groupId);
    if (!group) return null;
    group.pairingOpenUntil = 0;
    return { groupId: group.groupId, pairingOpenUntil: 0 };
  }

  pairingState(groupId) {
    const group = this.groups.get(groupId);
    if (!group) return null;
    const until = group.pairingOpenUntil;
    return { open: this._now() < until, pairingOpenUntil: until };
  }

  setRole(socketId, role) {
    const entry = this.entries.get(socketId);
    if (!entry) return null;
    entry.device.role = role;
    const group = this.groups.get(entry.groupId);
    const known = group?.tokens.get(entry.device.token);
    if (known) known.role = role;
    return { groupId: entry.groupId, device: entry.device };
  }

  updateSettings(socketId, settings) {
    const entry = this.entries.get(socketId);
    if (!entry) return null;
    entry.device.settings = { ...entry.device.settings, ...settings };
    return { groupId: entry.groupId, device: entry.device };
  }

  updateStatus(socketId, status) {
    const entry = this.entries.get(socketId);
    if (!entry) return null;
    entry.device.status = { ...entry.device.status, ...status };
    return { groupId: entry.groupId, device: entry.device };
  }

  getEntry(socketId) {
    return this.entries.get(socketId) || null;
  }

  devicesOf(groupId) {
    const group = this.groups.get(groupId);
    return group ? [...group.devices.values()] : [];
  }

  /** True when `socketId` and `targetId` share a group — the check that
   *  stops a connected socket from signaling into someone else's nursery. */
  sameGroup(socketId, targetId) {
    const a = this.entries.get(socketId);
    const b = this.entries.get(targetId);
    return Boolean(a && b && a.groupId === b.groupId);
  }

  stats() {
    return { groups: this.groups.size, devices: this.entries.size };
  }

  /** Releases all timers. Tests and graceful shutdown need this. */
  dispose() {
    for (const timer of this._reapTimers.values()) clearTimeout(timer);
    this._reapTimers.clear();
  }

  _makeDevice(socketId, displayName, token) {
    return {
      deviceId: socketId,
      displayName,
      role: ROLE_CLIENT,
      settings: { ...DEFAULT_SETTINGS },
      status: {},
      token,           // stripped before broadcast, see publicDevice()
    };
  }

  _scheduleReap(groupId) {
    this._cancelReap(groupId);
    const timer = setTimeout(() => {
      if (this.groups.get(groupId)?.devices.size === 0) this.groups.delete(groupId);
      this._reapTimers.delete(groupId);
    }, GROUP_TTL_MS);
    timer.unref?.();
    this._reapTimers.set(groupId, timer);
  }

  _cancelReap(groupId) {
    const timer = this._reapTimers.get(groupId);
    if (timer) {
      clearTimeout(timer);
      this._reapTimers.delete(groupId);
    }
  }
}

/** A device as other members of the group are allowed to see it. */
export function publicDevice(device) {
  const { token, ...rest } = device;
  return rest;
}
