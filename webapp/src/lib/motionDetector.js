// Canvas-based motion detection via frame differencing.
// Captures 160x120 frames at 2fps, computes mean pixel difference.
// Calls onMotion(score) when movement exceeds sensitivity threshold.

export class MotionDetector {
  constructor(videoEl, { sensitivity = 20, onMotion }) {
    this._video = videoEl;
    this._sensitivity = sensitivity;
    this._onMotion = onMotion;
    this._canvas = document.createElement('canvas');
    this._canvas.width = 160;
    this._canvas.height = 120;
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });
    this._prev = null;
    this._timer = null;
    this._cooldown = false;
  }

  setSensitivity(v) { this._sensitivity = v; }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), 500);
  }

  stop() {
    clearInterval(this._timer);
    this._timer = null;
    this._prev = null;
  }

  _tick() {
    const v = this._video;
    if (!v || v.readyState < 2 || v.videoWidth === 0) return;

    const { _canvas: c, _ctx: ctx } = this;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);

    if (this._prev) {
      let diff = 0;
      for (let i = 0; i < data.length; i += 4) {
        diff += Math.abs(data[i]   - this._prev[i])   +
                Math.abs(data[i+1] - this._prev[i+1]) +
                Math.abs(data[i+2] - this._prev[i+2]);
      }
      const score = diff / (data.length / 4 * 3); // 0-255 mean per channel

      if (score > this._sensitivity && !this._cooldown) {
        this._cooldown = true;
        setTimeout(() => { this._cooldown = false; }, 5000); // 5s cooldown
        this._onMotion(score);
      }
    }

    this._prev = new Uint8ClampedArray(data);
  }
}
