// "Vista inmersiva": cámara perseguidora detrás de la carga útil. Matemática pura (sin Cesium ni
// DOM), probada en Node (tests/chasecam.test.mjs); js/immersive.js la conecta con el visor.
//
// La orientación sale del desplazamiento REAL de la carga (positionAtTime / finalPosition, la misma
// geometría que mueve la carga), muestreado en el tiempo simulado alrededor del instante actual.
// Nunca se inventan datos: es solo encuadre.

const R_EARTH_M = 6371000;
const DEG = Math.PI / 180;

export const CHASE = {
  backM: 26, // distancia de la cámara detrás de la carga, sobre la dirección de la vista
  dropFraction: 0.4, // la carga queda a esta fracción del semicampo vertical por debajo del centro del cuadro
  pitchGain: 0.6, // fracción del ángulo de trayectoria que sigue la vista (deja ver terreno al ascender)
  maxPitchDeg: 60,
  minHSpeedMps: 0.4, // por debajo, el rumbo no es fiable y se conserva el anterior
  windowMs: 2500, // semiventana de muestreo a 1x (crece con sqrt(velocidad))
  tauS: 1.0, // constante de tiempo (s reales) a 1x; baja con sqrt(velocidad)
  maxBankDeg: 5,
  bankDeadDeg: 3,
  bankGain: 0.15,
};

export const wrapPi = (a) => {
  let x = (a + Math.PI) % (2 * Math.PI);
  if (x < 0) x += 2 * Math.PI;
  return x - Math.PI;
};

/** Desplazamiento ENU (m) entre dos posiciones {lat, lon, altM}. */
export function enuDelta(a, b) {
  const cosLat = Math.cos(((a.lat + b.lat) / 2) * DEG);
  return {
    e: (b.lon - a.lon) * DEG * cosLat * R_EARTH_M,
    n: (b.lat - a.lat) * DEG * R_EARTH_M,
    u: b.altM - a.altM,
  };
}

/**
 * Dirección de movimiento de la carga en `offsetMs`: rumbo (rad, desde el Norte, horario), pendiente
 * (rad) y velocidad horizontal (m/s). `posAt(offset)` devuelve {lat, lon, altM}. La ventana se
 * recorta en los extremos de la reproducción (diferencia unilateral), no se extrapola.
 */
export function motionDirection(posAt, offsetMs, totalMs, halfWindowMs) {
  const t0 = Math.max(0, offsetMs - halfWindowMs);
  const t1 = Math.min(totalMs, offsetMs + halfWindowMs);
  if (t1 - t0 < 1) return null;
  const d = enuDelta(posAt(t0), posAt(t1));
  const h = Math.hypot(d.e, d.n);
  const dt = (t1 - t0) / 1000;
  return { heading: Math.atan2(d.e, d.n), pitch: Math.atan2(d.u, h), hSpeed: h / dt, vSpeed: d.u / dt };
}

/** Rumbo y pendiente objetivo de la vista a partir de la dirección de movimiento (o null). */
export function viewTarget(dir, prevHeading) {
  if (!dir) return null;
  const maxP = CHASE.maxPitchDeg * DEG;
  const pitch = Math.max(-maxP, Math.min(maxP, dir.pitch)) * CHASE.pitchGain;
  const heading = dir.hSpeed >= CHASE.minHSpeedMps || prevHeading === null ? dir.heading : prevHeading;
  return { heading, pitch };
}

/**
 * Un paso de suavizado. `state` = {heading, pitch, bank} o null (primer cuadro). Con `snap` se parte
 * directamente del objetivo (salto del tiempo, cambio de modo): no se arrastra el suavizado.
 * `dtS` en segundos reales; `speed` multiplica el ritmo de cambio del objetivo, así que la
 * constante de tiempo baja con sqrt(speed) para no quedar rezagada a 64x.
 */
export function stepChase(state, target, dtS, speed, snap) {
  if (snap || !state) return { heading: target.heading, pitch: target.pitch, bank: 0 };
  const tau = CHASE.tauS / Math.sqrt(Math.max(1, speed));
  const k = 1 - Math.exp(-Math.max(0, dtS) / tau);
  const dh = wrapPi(target.heading - state.heading);
  // Alabeo sutil proporcional al rezago de rumbo (giro en curso), con zona muerta y tope.
  const lagDeg = Math.abs(dh) / DEG;
  const bankTarget = lagDeg <= CHASE.bankDeadDeg ? 0 : Math.sign(dh) * Math.min(CHASE.maxBankDeg, (lagDeg - CHASE.bankDeadDeg) * CHASE.bankGain);
  return {
    heading: wrapPi(state.heading + dh * k),
    pitch: state.pitch + (target.pitch - state.pitch) * k,
    bank: state.bank + (bankTarget * DEG - state.bank) * k,
  };
}

/** Vector (este, norte, arriba) de la dirección de la vista para un rumbo y pendiente. */
export function viewVector(heading, pitch) {
  const c = Math.cos(pitch);
  return { e: Math.sin(heading) * c, n: Math.cos(heading) * c, u: Math.sin(pitch) };
}

/**
 * Posición de la cámara respecto de la carga, en ENU (m): detrás de la vista y por encima, lo justo
 * para que la carga quede por debajo del centro (dropFraction del semicampo vertical `fovy`) en
 * cualquier relación de aspecto, sin clavarla en el centro ni sacarla del cuadro.
 */
export function cameraOffsetENU(heading, pitch, fovy) {
  const f = viewVector(heading, pitch);
  const up = CHASE.backM * Math.tan(CHASE.dropFraction * (fovy / 2)) / Math.cos(pitch);
  return { e: -f.e * CHASE.backM, n: -f.n * CHASE.backM, u: -f.u * CHASE.backM + up };
}

/**
 * ¿Salto del tiempo? Sí si se retrocede, si avanza mucho más de lo esperable por la reproducción o
 * si pasó demasiado tiempo real entre cuadros (render bajo demanda: pausa → play).
 */
export function isTimeJump({ prevOffsetMs, offsetMs, dtRealMs, playing, speed }) {
  if (prevOffsetMs === null || Number.isNaN(prevOffsetMs)) return true;
  const d = offsetMs - prevOffsetMs;
  if (d === 0) return false;
  if (!playing || dtRealMs > 400 || d < 0) return true;
  return d > 2 * dtRealMs * speed + 1000;
}

/**
 * Ajuste manual del usuario, relativo a la cámara automática: `az` (rad) orbita alrededor de la
 * carga, `el` (rad) sube/baja la cámara, `zoom` multiplica la distancia. Con {0, 0, 1} el resultado
 * es exactamente la cámara automática.
 */
export const MANUAL = { minZoom: 0.25, maxZoom: 6, minElDeg: -30, maxElDeg: 80 };

export const clampZoom = (z) => Math.min(MANUAL.maxZoom, Math.max(MANUAL.minZoom, z));

/**
 * Cámara con el ajuste manual aplicado: posición relativa a la carga (ENU, m) y rumbo/pendiente de
 * la vista. La cámara orbita sobre una esfera centrada en la carga y mira al mismo punto de
 * referencia que la cámara automática (ligeramente por encima de la carga), así que el seguimiento
 * no se pierde: la carga sigue siendo el centro del encuadre. La elevación queda acotada (nunca
 * pasa por el cenit ni se hunde bajo el horizonte más allá de lo que ya pedía la cámara automática).
 */
export function manualCamera(heading, pitch, fovy, manual) {
  const o0 = cameraOffsetENU(heading, pitch, fovy);
  const f = viewVector(heading, pitch);
  const d0 = Math.hypot(o0.e, o0.n, o0.u);
  const ref = { e: o0.e + f.e * d0, n: o0.n + f.n * d0, u: o0.u + f.u * d0 }; // punto mirado, fijo respecto de la carga
  const el0 = Math.atan2(o0.u, Math.hypot(o0.e, o0.n));
  const elMin = Math.min(el0, MANUAL.minElDeg * DEG);
  const el = Math.min(MANUAL.maxElDeg * DEG, Math.max(elMin, el0 + manual.el));
  const az = Math.atan2(o0.e, o0.n) + manual.az;
  const d = d0 * clampZoom(manual.zoom);
  const offset = { e: d * Math.cos(el) * Math.sin(az), n: d * Math.cos(el) * Math.cos(az), u: d * Math.sin(el) };
  const v = { e: ref.e - offset.e, n: ref.n - offset.n, u: ref.u - offset.u };
  return { offset, heading: Math.atan2(v.e, v.n), pitch: Math.atan2(v.u, Math.hypot(v.e, v.n)) };
}
