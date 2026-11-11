/**
 * Cry detection.
 *
 * The obvious implementation — open a second microphone recorder and read
 * its meter — fights WebRTC for the mic. On Android the two AudioRecord
 * sessions interfere, which is why the previous version needed a two
 * second delay and still dropped audio.
 *
 * Instead this reads `audioLevel` out of the WebRTC statistics for the
 * track that is already being transmitted. One microphone session, no
 * contention, and the level measured is exactly the audio the other
 * device hears.
 *
 * Consequence worth knowing: levels only exist while at least one monitor
 * is connected, because that is when a peer connection exists.
 */

const POLL_INTERVAL_MS = 250;
const SUSTAIN_MS = 1000;
const COOLDOWN_MS = 8000;

/** Converts WebRTC's linear 0..1 audio level to dBFS. */
function toDecibels(level) {
  if (!level || level <= 0) return -100;
  return 20 * Math.log10(Math.min(1, level));
}

export class CryDetector {
  /**
   * @param {object} options
   * @param {() => Iterable<RTCPeerConnection>} options.getPeerConnections
   * @param {number} [options.sensitivity]  dBFS threshold, e.g. -25
   * @param {() => void} options.onCry
   * @param {(db: number) => void} [options.onLevel]  for the live meter
   * @param {() => number} [options.now]  injectable clock, for tests
   */
  constructor({ getPeerConnections, sensitivity = -25, onCry, onLevel, now = Date.now }) {
    this._getPeerConnections = getPeerConnections;
    this._sensitivity = sensitivity;
    this._onCry = onCry;
    this._onLevel = onLevel;
    this._now = now;
    this._timer = null;
    this._loudSince = null;
    this._cooldownUntil = 0;
    this._running = false;
  }

  setSensitivity(db) {
    this._sensitivity = db;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._timer = setInterval(() => { this._tick(); }, POLL_INTERVAL_MS);
  }

  stop() {
    this._running = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this._loudSince = null;
  }

  async _tick() {
    if (!this._running) return;

    const level = await this._readLevel();
    if (level == null) return;

    const db = toDecibels(level);
    this._onLevel?.(db);

    const now = this._now();
    if (now < this._cooldownUntil) return;

    if (db > this._sensitivity) {
      if (this._loudSince == null) {
        this._loudSince = now;
      } else if (now - this._loudSince >= SUSTAIN_MS) {
        this._loudSince = null;
        this._cooldownUntil = now + COOLDOWN_MS;
        try {
          this._onCry?.();
        } catch (error) {
          console.warn('[cryDetector] onCry threw:', error?.message);
        }
      }
    } else {
      this._loudSince = null;
    }
  }

  /** Highest audio level across the outbound tracks, or null if unknown. */
  async _readLevel() {
    let best = null;

    for (const pc of this._getPeerConnections()) {
      if (pc.connectionState !== 'connected') continue;
      let report;
      try {
        report = await pc.getStats();
      } catch {
        continue;
      }

      report.forEach((stat) => {
        // `media-source` is the current location; `track` is the legacy
        // one some react-native-webrtc builds still report.
        const isLocalAudio =
          (stat.type === 'media-source' && stat.kind === 'audio') ||
          (stat.type === 'track' && stat.kind === 'audio' && stat.remoteSource === false);

        if (isLocalAudio && typeof stat.audioLevel === 'number') {
          best = best == null ? stat.audioLevel : Math.max(best, stat.audioLevel);
        }
      });

      if (best != null) break;   // one connection is enough
    }

    return best;
  }
}

export { toDecibels };
