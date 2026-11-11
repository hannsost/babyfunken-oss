// ─── Babyfunken Signaling Protocol v3 ──────────────────────────
// Shared between server, webapp and mobile app.
//
// Design note: the server is a signaling relay only. It never sees
// media — audio and video flow peer-to-peer over WebRTC, and all
// detection (cry, motion) runs on the device that owns the camera.

export const PROTOCOL_VERSION = 3;

// ── Connection ──
export const HELLO = 'hello';
export const HELLO_ACK = 'hello:ack';

// ── Group lifecycle ──
export const GROUP_CREATE = 'group:create';
export const GROUP_CREATED = 'group:created';
export const GROUP_JOIN = 'group:join';
export const GROUP_JOINED = 'group:joined';
export const GROUP_LEAVE = 'group:leave';
export const GROUP_DEVICE_JOINED = 'group:device-joined';
export const GROUP_DEVICE_LEFT = 'group:device-left';
export const GROUP_DEVICE_UPDATED = 'group:device-updated';
export const GROUP_ERROR = 'group:error';

// ── Pairing ──
// Joining is only possible while the group owner has the pairing
// window open. This is what keeps a guessed code from being enough
// to watch someone's nursery.
export const PAIRING_OPEN = 'pairing:open';
export const PAIRING_CLOSE = 'pairing:close';
export const PAIRING_STATE = 'pairing:state';

// ── Roles ──
export const ROLE_SET = 'role:set';
export const ROLE_SERVER = 'server';   // the device with the camera
export const ROLE_CLIENT = 'client';   // a device watching

// ── WebRTC signaling ──
export const SIGNAL_OFFER = 'signal:offer';
export const SIGNAL_ANSWER = 'signal:answer';
export const SIGNAL_ICE = 'signal:ice';
export const SIGNAL_INITIATE = 'signal:initiate';
export const SIGNAL_RESTART = 'signal:restart';

// ── Lullabies (played locally on the camera device, never streamed) ──
export const LULLABY_PLAY = 'lullaby:play';
export const LULLABY_STOP = 'lullaby:stop';
export const LULLABY_STATUS = 'lullaby:status';
export const LULLABY_VOLUME = 'lullaby:volume';

// ── Alerts ──
export const ALERT_MOTION = 'alert:motion';
export const ALERT_CRY = 'alert:cry';
export const ALERT_ACK = 'alert:ack';

// ── Device state ──
export const SETTINGS_UPDATE = 'settings:update';
export const DEVICE_STATUS = 'device:status';   // battery, network, stream health

// ── Error codes (stable, safe to branch on in clients) ──
export const ERR_GROUP_NOT_FOUND = 'group_not_found';
export const ERR_PAIRING_CLOSED = 'pairing_closed';
export const ERR_RATE_LIMITED = 'rate_limited';
export const ERR_GROUP_FULL = 'group_full';
export const ERR_BAD_REQUEST = 'bad_request';
export const ERR_PROTOCOL_MISMATCH = 'protocol_mismatch';
