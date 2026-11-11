// ─── Babyfunken shared constants ───────────────────────────────
// No secrets and no deployment-specific URLs live here. The server
// reads its configuration from the environment; the clients read
// theirs from their own build config. See docs/CONFIGURATION.md.

/** Alphabet for group codes: no 0/O/1/I, so codes can be read aloud. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Group code length. 32^8 ≈ 1.1e12 combinations. */
export const CODE_LENGTH = 8;

/** How long a newly created group accepts joins, in ms. */
export const PAIRING_WINDOW_MS = 10 * 60 * 1000;

/** Grace period an empty group is kept alive so devices can reconnect. */
export const GROUP_TTL_MS = 15 * 60 * 1000;

/** Hard cap on devices per group — a nursery does not need more. */
export const MAX_DEVICES_PER_GROUP = 8;

/** Deep link used by the QR pairing code. */
export const PAIRING_URL_SCHEME = 'babyfunken';

export const DEFAULT_SETTINGS = {
  motionDetection: true,
  cryDetection: true,
  /** dBFS threshold above which sustained audio counts as crying. */
  crySensitivity: -25,
  /** Fraction of changed pixels that counts as motion. */
  motionSensitivity: 0.06,
  /** Stream quality preset: 'low' | 'balanced' | 'high' */
  quality: 'balanced',
};

/**
 * Video constraints per quality preset. Lower presets exist because a
 * phone acting as a camera runs on battery for hours at a time.
 */
export const QUALITY_PRESETS = {
  low:      { width: 480,  height: 360,  frameRate: 12 },
  balanced: { width: 960,  height: 540,  frameRate: 20 },
  high:     { width: 1280, height: 720,  frameRate: 30 },
};

/** Bundled lullabies. Files live in mobile/assets/lullabies/. */
export const LULLABIES = [
  { id: 'white-noise', title: 'Weißes Rauschen', loop: true },
  { id: 'rain',        title: 'Regen',            loop: true },
  { id: 'heartbeat',   title: 'Herzschlag',       loop: true },
  { id: 'musicbox',    title: 'Spieluhr',         loop: true },
];

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** True if `code` is syntactically a group code. Does not check existence. */
export function isValidGroupCode(code) {
  return typeof code === 'string' && CODE_RE.test(code);
}

/** Normalises user input ("abc 123-de") into a candidate code. */
export function normaliseGroupCode(input) {
  if (typeof input !== 'string') return '';
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

/** Builds the deep link encoded into a pairing QR code. */
export function buildPairingUrl(groupId, secret) {
  return `${PAIRING_URL_SCHEME}://join?g=${encodeURIComponent(groupId)}&s=${encodeURIComponent(secret)}`;
}

/** Parses a pairing deep link. Returns null if it is not one. */
export function parsePairingUrl(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/^babyfunken:\/\/join\?(.*)$/);
  if (!m) return null;
  const params = new URLSearchParams(m[1]);
  const groupId = normaliseGroupCode(params.get('g') || '');
  const secret = params.get('s') || '';
  if (!isValidGroupCode(groupId) || !secret) return null;
  return { groupId, secret };
}
