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
 * Pendiente (por ms) en el nodo `k` de una serie (t[], y[]) con el método monótono de
 * Fritsch–Carlson (PCHIP): usa solo los vecinos k−1, k, k+1. Si la serie cambia de sentido en k la
 * pendiente es 0 (no hay sobreimpulso); si no, media armónica ponderada de las pendientes de los
 * dos intervalos. En los extremos, fórmula de tres puntos limitada para preservar la forma.
 */
function pchipSlope(t, y, k, last) {
  const d = (i) => (y(i + 1) - y(i)) / (t[i + 1] - t[i]);
  if (k === 0 || k === last) {
    const i = k === 0 ? 0 : last - 1; // intervalo del extremo
    const j = k === 0 ? 1 : last - 2; // intervalo vecino
    if (last < 2) return d(i);
    const h0 = t[i + 1] - t[i];
    const h1 = t[j + 1] - t[j];
    const d0 = d(i);
    const d1 = d(j);
    let s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(s) !== Math.sign(d0)) s = 0;
    else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > 3 * Math.abs(d0)) s = 3 * d0;
    return s;
  }
  const dm = d(k - 1);
  const dp = d(k);
  if (dm * dp <= 0) return 0;
  const hm = t[k] - t[k - 1];
  const hp = t[k + 1] - t[k];
  const w1 = 2 * hp + hm;
  const w2 = hp + 2 * hm;
  return (w1 + w2) / (w1 / dm + w2 / dp);
}

/** Hermite cúbico en el intervalo [lo, lo+1] con pendientes monótonas (PCHIP) para la serie y(i). */
function hermite(times, y, lo, ms) {
  const last = times.length - 1;
  const h = times[lo + 1] - times[lo];
  const f = (ms - times[lo]) / h;
  if (f <= 0) return y(lo);
  const m0 = pchipSlope(times, y, lo, last) * h;
  const m1 = pchipSlope(times, y, lo + 1, last) * h;
  const f2 = f * f;
  const f3 = f2 * f;
  return (
    (2 * f3 - 3 * f2 + 1) * y(lo) + (f3 - 2 * f2 + f) * m0 + (-2 * f3 + 3 * f2) * y(lo + 1) + (f3 - f2) * m1
  );
}

function locateInterval(times, ms) {
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= ms) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * ÚNICA FUENTE GEOMÉTRICA de la posición visual de la carga útil en un instante t (ms).
 *
 * Interpolación Hermite cúbica MONÓTONA (PCHIP / Fritsch–Carlson) por separado en lat, lon y
 * altitud, usando como pendientes las de las transmisiones vecinas: la velocidad es continua en
 * cada transmisión (no hay velocidad constante por tramos) y cada coordenada queda siempre entre
 * los valores de los dos extremos del intervalo (sin sobreimpulso). En el instante de una
 * transmisión devuelve exactamente su posición GPS; fuera del rango, la primera/última. Es
 * exclusivamente VISUAL: no crea transmisiones ni telemetría. La carga animada
 * (`visualPosition`) y la trayectoria dibujada (`trajectorySamples`) dependen de esta función.
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
  const lo = locateInterval(times, ms);
  return {
    lat: hermite(times, (i) => flight[i].position.lat, lo, ms),
    lon: hermite(times, (i) => flight[i].position.lon, lo, ms),
    altM: hermite(times, alt, lo, ms),
  };
}

/**
 * Interpolación LINEAL anterior (velocidad constante en cada intervalo). Ya no se usa en la
 * aplicación; se conserva solo para comparar en pruebas y en el informe de movimiento.
 */
export function positionAtTimeLinear(flight, times, ms, altitudes = null) {
  const last = flight.length - 1;
  const alt = (i) => (altitudes ? altitudes[i] : flight[i].altitudeGpsM);
  if (ms <= times[0]) return { lat: flight[0].position.lat, lon: flight[0].position.lon, altM: alt(0) };
  if (ms >= times[last]) return { lat: flight[last].position.lat, lon: flight[last].position.lon, altM: alt(last) };
  const lo = locateInterval(times, ms);
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
export function trajectorySamples(flight, times, stepMs = 2000, altitudes = null) {
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
