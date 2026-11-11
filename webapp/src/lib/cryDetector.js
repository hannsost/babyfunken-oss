// Web Audio API FFT-based cry/scream detection.
// Monitors 250-600 Hz (baby cry fundamental) and 1000-5000 Hz (overtones).
// Fires onCry() after 1 second of sustained detection, then 6s cooldown.

export class CryDetector {
  constructor(stream, { sensitivity = 0.015, onCry }) {
    this._stream = stream;
    this._sensitivity = sensitivity;
    this._onCry = onCry;
    this._actx = null;
    this._analyser = null;
    this._raf = null;
    this._sustainedSince = null;
    this._SUSTAIN_MS = 1000;
    this._cooldown = false;
  }

  setSensitivity(v) { this._sensitivity = v; }

  start() {
    if (this._actx) return;
    this._actx = new AudioContext();
    const src = this._actx.createMediaStreamSource(this._stream);
    this._analyser = this._actx.createAnalyser();
    this._analyser.fftSize = 2048;
    src.connect(this._analyser);
    this._loop();
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._actx) { this._actx.close(); this._actx = null; }
    this._analyser = null;
    this._sustainedSince = null;
    this._raf = null;
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop());
    const an = this._analyser;
    const actx = this._actx;
    if (!an || !actx) return;

    const buf = new Float32Array(an.frequencyBinCount);
    an.getFloatFrequencyData(buf);

    const binHz = actx.sampleRate / an.fftSize;

    const energy = (lo, hi) => {
      const a = Math.floor(lo / binHz);
      const b = Math.min(Math.ceil(hi / binHz), buf.length - 1);
      let sum = 0;
      for (let i = a; i <= b; i++) sum += Math.pow(10, buf[i] / 20);
      return sum / (b - a + 1);
    };

    const fund = energy(250, 600);
    const over = energy(1000, 5000);
    const base = energy(50, 200);
    const thr = this._sensitivity;

    const crying = fund > thr && over > thr * 0.5 && fund > base * 1.5;

    if (crying && !this._cooldown) {
      if (!this._sustainedSince) {
        this._sustainedSince = Date.now();
      } else if (Date.now() - this._sustainedSince >= this._SUSTAIN_MS) {
        this._sustainedSince = null;
        this._cooldown = true;
        setTimeout(() => { this._cooldown = false; }, 6000);
        this._onCry();
      }
    } else if (!crying) {
      this._sustainedSince = null;
    }
  }
}
