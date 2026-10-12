// Motor temporal: reloj de reproducción, búsqueda de la transmisión vigente e
// interpolación exclusivamente VISUAL de posición/altitud. Nunca crea tramas.

export const SPEEDS = [1, 2, 4, 8, 16, 32, 64];

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
    // Altitudes SOLO de render (corrección visual al terreno); null = se usa altitudeGpsM tal cual.
    this.displayAltM = null;
    this.floorCorrectionsM = null;
    this._geometryListeners = new Set();
    this._raf = null;
    this._last = 0;
  }

  onChange(callback) {
    this._listeners.add(callback);
  }

  _emit() {
    for (const cb of this._listeners) cb(this);
  }

  /** Avisa cuando cambia la geometría de render (altitudes mostradas). */
  onGeometryChange(callback) {
    this._geometryListeners.add(callback);
  }

  /**
   * Fija las altitudes de RENDER de cada transmisión (p. ej. con corrección al terreno). No
   * modifica el dataset: los valores brutos siguen siendo altitudeGpsM.
   */
  setDisplayAltitudes(displayAltM, floorCorrectionsM = null) {
    this.displayAltM = displayAltM;
    this.floorCorrectionsM = floorCorrectionsM;
    for (const cb of this._geometryListeners) cb(this);
    this._emit();
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
 * ÚNICA FUENTE GEOMÉTRICA de la posición visual de la carga útil en un instante t (ms).
 *
 * Interpolación lineal en lat, lon y altitudeGpsM entre las dos transmisiones reales que
 * rodean a t (en t = instante de una transmisión devuelve exactamente su posición GPS; fuera
 * del rango devuelve la primera/última). Es exclusivamente VISUAL: no crea transmisiones ni
 * telemetría. La carga animada (`visualPosition`) y la trayectoria dibujada
 * (`trajectorySamples`) dependen de esta misma función.
 *
 * @param {object[]} flight transmisiones de vuelo
 * @param {number[]} times instantes (ms) de cada transmisión, en orden estricto
 * @param {number} ms instante absoluto (ms)
 * @param {number[]|null} [altitudes] altitudes de render por transmisión (null = altitudeGpsM)
 * @returns {{lat:number, lon:number, altM:number}}
 */
export function positionAtTime(flight, times, ms, altitudes = null) {
  const last = flight.length - 1;
  const alt = (i) => (altitudes ? altitudes[i] : flight[i].altitudeGpsM);
  if (ms <= times[0]) {
    const a = flight[0];
    return { lat: a.position.lat, lon: a.position.lon, altM: alt(0) };
  }
  if (ms >= times[last]) {
    const a = flight[last];
    return { lat: a.position.lat, lon: a.position.lon, altM: alt(last) };
  }
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= ms) lo = mid;
    else hi = mid - 1;
  }
  const a = flight[lo];
  const b = flight[lo + 1];
  const f = (ms - times[lo]) / (times[lo + 1] - times[lo]);
  return {
    lat: a.position.lat + (b.position.lat - a.position.lat) * f,
    lon: a.position.lon + (b.position.lon - a.position.lon) * f,
    altM: alt(lo) + (alt(lo + 1) - alt(lo)) * f,
  };
}

/** Posición visual de la carga en el instante actual de la reproducción. */
export function visualPosition(flight, playback) {
  return positionAtTime(flight, playback.times, playback.absoluteMs, playback.displayAltM);
}

/**
 * Geometría visible de la trayectoria: remuestreo de `positionAtTime`. Conserva SIEMPRE las
 * transmisiones reales y agrega, solo para dibujar, puntos intermedios cada `stepMs` ms. Esos
 * puntos NO son transmisiones, no se agregan al dataset y no tienen telemetría.
 *
 * @returns {{lat:number, lon:number, altM:number, real:boolean}[]}
 */
export function trajectorySamples(flight, times, stepMs = 5000, altitudes = null) {
  const out = [];
  for (let i = 0; i < flight.length; i++) {
    out.push({ ...positionAtTime(flight, times, times[i], altitudes), real: true });
    if (i === flight.length - 1) break;
    for (let t = times[i] + stepMs; t < times[i + 1]; t += stepMs) {
      out.push({ ...positionAtTime(flight, times, t, altitudes), real: false });
    }
  }
  return out;
}
