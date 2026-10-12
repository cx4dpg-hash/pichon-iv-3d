// Motor temporal: reloj de reproducción, búsqueda de la transmisión vigente e
// interpolación exclusivamente VISUAL de posición/altitud. Nunca crea tramas.

export const SPEEDS = [1, 2, 3, 4, 5, 6, 8, 16];

export class Playback {
  /** @param {number[]} times instantes (ms) de cada transmisión, en orden estricto */
  constructor(times) {
    this.times = times;
    this.t0 = times[0];
    this.duration = times[times.length - 1] - times[0];
    this.offset = 0; // ms desde la primera transmisión
    this.playing = false;
    this.speed = 1;
    this._listeners = new Set();
    this._raf = null;
    this._last = 0;
  }

  onChange(callback) {
    this._listeners.add(callback);
  }

  _emit() {
    for (const cb of this._listeners) cb(this);
  }

  get absoluteMs() {
    return this.t0 + this.offset;
  }

  /** Índice de la transmisión vigente: la última con instante <= tiempo actual. */
  get index() {
    return this.indexAt(this.offset);
  }

  indexAt(offset) {
    const target = this.t0 + offset;
    let lo = 0;
    let hi = this.times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.times[mid] <= target) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Fracción [0,1) entre la transmisión vigente y la siguiente (0 en la última). */
  get fraction() {
    const i = this.index;
    if (i >= this.times.length - 1) return 0;
    const a = this.times[i];
    const b = this.times[i + 1];
    return (this.absoluteMs - a) / (b - a);
  }

  seek(offset) {
    this.offset = Math.min(Math.max(offset, 0), this.duration);
    this._emit();
  }

  seekToIndex(index) {
    const i = Math.min(Math.max(index, 0), this.times.length - 1);
    this.seek(this.times[i] - this.t0);
  }

  next() {
    this.seekToIndex(this.index + 1);
  }

  /** Si estamos entre dos transmisiones, "anterior" vuelve al inicio de la vigente. */
  previous() {
    const i = this.index;
    const atStart = this.absoluteMs <= this.times[i];
    this.seekToIndex(atStart ? i - 1 : i);
  }

  setSpeed(speed) {
    this.speed = speed;
    this._emit();
  }

  play() {
    if (this.playing) return;
    if (this.offset >= this.duration) this.offset = 0;
    this.playing = true;
    this._last = performance.now();
    this._raf = requestAnimationFrame((now) => this._tick(now));
    this._emit();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    if (this._raf !== null) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._emit();
  }

  _tick(now) {
    if (!this.playing) return;
    // Se limita el salto para no "teletransportar" tras una pestaña en segundo plano.
    const dt = Math.min(now - this._last, 1000);
    this._last = now;
    // Velocidad = multiplicador del tiempo real del vuelo.
    this.offset += dt * this.speed;
    if (this.offset >= this.duration) {
      this.offset = this.duration;
      this.playing = false;
      this._raf = null;
    } else {
      this._raf = requestAnimationFrame((t) => this._tick(t));
    }
    this._emit();
  }
}

/**
 * Posición visual interpolada linealmente entre dos transmisiones reales.
 * Solo lat, lon y altitud GPS (m). El resto de campos pertenecen siempre a la
 * transmisión vigente y no se interpolan.
 */
export function visualPosition(flight, playback) {
  const i = playback.index;
  const a = flight[i];
  if (i >= flight.length - 1) {
    return { lat: a.position.lat, lon: a.position.lon, altM: a.altitudeGpsM };
  }
  const b = flight[i + 1];
  const f = playback.fraction;
  return {
    lat: a.position.lat + (b.position.lat - a.position.lat) * f,
    lon: a.position.lon + (b.position.lon - a.position.lon) * f,
    altM: a.altitudeGpsM + (b.altitudeGpsM - a.altitudeGpsM) * f,
  };
}
