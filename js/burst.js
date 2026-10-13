// Animación visual de la ruptura del globo. Sin dependencias de Cesium (se prueba en Node).
//
// Es una convención VISUAL: no se conoce el instante exacto de la ruptura (ver
// estimatedBurstTransition en physics.js: ocurre entre la transmisión de máxima altitud y la
// siguiente). Se hace coincidir con la transmisión de máxima altitud (frame 138).
//
// Toda la animación es una FUNCIÓN PURA del instante simulado y de la velocidad elegida: no hay
// temporizadores ni estado acumulado. Por eso pausar, arrastrar la línea de tiempo, saltar o ir
// hacia atrás muestra siempre el estado correcto y no puede dejar restos.
//
// Duración: BURST.realMs milisegundos de pantalla a la velocidad elegida, es decir
// realMs × velocidad de tiempo simulado (2 s a 1x, 4 s simulados a 2x, … 128 s a 64x). Así la
// rotura se ve igual de breve y clara a cualquier velocidad.
//
// Fases (p = progreso 0–1 de la ventana):
//   "intact"     antes de la ruptura: globo normal.
//   "expanding"  p < expandFrac: expansión súbita del globo (se infla un ~20 %).
//   "fragments"  expandFrac ≤ p < 1: el globo desaparece y salen fragmentos de látex que se
//                separan, giran, caen y se desvanecen.
//   "gone"       p ≥ 1: nada del globo (como hasta ahora tras la ruptura).

export const BURST = {
  realMs: 2000, // duración de la rotura en pantalla (ms) a la velocidad elegida
  expandFrac: 0.07, // fracción de la ventana que dura la expansión súbita (~0,14 s)
  expansion: 0.2, // aumento relativo de tamaño del globo justo antes de romper
  fadeStart: 0.45, // fracción del tramo de fragmentos a partir de la cual se desvanecen
  fall: 1.7, // caída de los fragmentos al final (en radios del globo)
  followVertical: 1, // fracción del descenso de la carga que acompañan los fragmentos (mismo aire; 1 = todo)
  count: 12, // fragmentos (3 grandes: restos de faldón; el resto, trozos pequeños)
  flashFrac: 0.5, // el destello de la vista lejana dura la primera mitad de la ventana
  // Encuadre de la cámara en Seguir globo (burstCameraBlend): aleja suavemente antes de la rotura,
  // mantiene mientras dura y vuelve. Fracciones de la ventana (p; negativo = antes de romper).
  camLead: 0.3, // empieza a alejar en p = −camLead
  camIn: 0.05, // alejamiento completo en p = camIn
  camHoldEnd: 0.95, // empieza a volver
  camOutEnd: 1.6, // vuelta completa
};

/** Duración (ms simulados) de la ventana de la rotura a la velocidad de reproducción dada. */
export function burstWindowMs(speed) {
  return BURST.realMs * Math.max(1, Number.isFinite(speed) ? speed : 1);
}

/**
 * Estado de la rotura en un instante.
 * @param {number} absoluteMs instante simulado absoluto (ms)
 * @param {number|null} burstMs instante de la ruptura (ms) o null si no hay ruptura
 * @param {number} speed velocidad de reproducción
 * @returns {{state:"intact"|"expanding"|"fragments"|"gone", p:number}}
 */
export function burstPhase(absoluteMs, burstMs, speed) {
  if (burstMs === null || !(absoluteMs >= burstMs)) return { state: "intact", p: 0 };
  const p = (absoluteMs - burstMs) / burstWindowMs(speed);
  if (p >= 1) return { state: "gone", p: 1 };
  return { state: p < BURST.expandFrac ? "expanding" : "fragments", p };
}

const easeOut = (t) => 1 - (1 - t) * (1 - t);

/** Factor de tamaño del globo durante la expansión súbita (1 al empezar, 1+expansion al romper). */
export function expansionFactor(p) {
  const t = Math.min(Math.max(p / BURST.expandFrac, 0), 1);
  return 1 + BURST.expansion * easeOut(t);
}

/** Progreso 0–1 dentro de la fase de fragmentos. */
export function fragmentProgress(p) {
  return Math.min(Math.max((p - BURST.expandFrac) / (1 - BURST.expandFrac), 0), 1);
}

// Generador pseudoaleatorio con semilla: la forma de la rotura es siempre la misma.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Siluetas irregulares de los trozos de látex (polígonos de 7–9 vértices con muescas, alargados y
 * sesgados), en un cuadrado [−0.5, 0.5]². `fold` es el ángulo de un pliegue que parte la lámina
 * en dos tonos. Se dibujan una sola vez en un lienzo (sin assets).
 */
export const SHARDS = (() => {
  const rnd = mulberry32(7138);
  const shapes = [];
  for (let s = 0; s < 6; s++) {
    const n = 7 + Math.floor(rnd() * 3);
    const stretch = 0.7 + 0.5 * rnd();
    const skew = (rnd() - 0.5) * 0.5;
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * (k + 0.6 * (rnd() - 0.5))) / n;
      let r = 0.28 + 0.22 * rnd();
      if (rnd() < 0.3) r *= 0.55; // muesca
      const y = Math.sin(a) * r * stretch;
      pts.push([Math.cos(a) * r + skew * y, y]);
    }
    const m = Math.max(...pts.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]));
    shapes.push({ pts: pts.map(([x, y]) => [(x / m) * 0.5, (y / m) * 0.5]), fold: rnd() * Math.PI });
  }
  return shapes;
})();

/**
 * Definición fija de los fragmentos (en unidades del radio del globo, sistema local este-norte-arriba
 * centrado en el globo): dirección de salida, alcance, tamaño de la lámina, giro, silueta y volteo.
 */
export const FRAGMENTS = (() => {
  const rnd = mulberry32(138);
  const list = [];
  for (let i = 0; i < BURST.count; i++) {
    const az = (2 * Math.PI * (i + 0.7 * (rnd() - 0.5))) / BURST.count;
    const el = -0.3 + 1.0 * rnd();
    const large = i % 4 === 0;
    const w = large ? 0.62 + 0.14 * rnd() : 0.24 + 0.18 * rnd();
    const axis = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5];
    const norm = Math.hypot(...axis) || 1;
    list.push({
      dir: [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)],
      reach: 1.6 + 2.4 * rnd(),
      width: w,
      length: w * (0.6 + 0.3 * rnd()),
      axis: axis.map((v) => v / norm),
      spin: (3 + 6 * rnd()) * (rnd() < 0.5 ? -1 : 1), // radianes durante todo el tramo de fragmentos
      // Se añaden al final para no alterar el resto de valores de la tabla:
      shape: i % SHARDS.length, // silueta
      tone: i % 3, // tono: crema / gris crema / blanco suave
      tilt: rnd() * Math.PI, // fase inicial del volteo de la lámina
      tumble: (4 + 8 * rnd()) * (rnd() < 0.5 ? -1 : 1), // radianes de volteo durante todo el tramo
    });
  }
  return list;
})();

/**
 * Estado de un fragmento en el progreso q (0–1) de la fase de fragmentos. Escribe en `out`:
 * posición local (x, y, z) en radios del globo, ángulo de giro, escala y opacidad.
 */
export function fragmentState(def, q, out) {
  const e = 1 - Math.pow(1 - q, 2.2); // sale rápido y se frena
  const r = 0.9 + def.reach * e; // nace en la superficie del globo
  out.x = def.dir[0] * r;
  out.y = def.dir[1] * r;
  out.z = def.dir[2] * r - BURST.fall * q * q;
  out.angle = def.spin * q;
  // Volteo: la lámina fina gira sobre sí misma; vista de canto casi desaparece (ancho mínimo).
  out.flip = Math.max(0.14, Math.abs(Math.cos(def.tilt + def.tumble * q)));
  out.shade = 0.8 + 0.2 * out.flip; // mate: algo más oscura de canto, sin brillos
  out.scale = 1 - 0.35 * q;
  out.alpha = q <= BURST.fadeStart ? 1 : Math.max(0, 1 - (q - BURST.fadeStart) / (1 - BURST.fadeStart));
  return out;
}

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Mezcla 0–1 del alejamiento temporal de la cámara de Seguir globo durante la rotura. Función pura
 * del instante: 0 fuera de [−camLead, camOutEnd] (comportamiento normal intacto), sube con suavidad
 * antes de romper, 1 mientras dura la rotura y baja con suavidad después.
 */
export function burstCameraBlend(absoluteMs, burstMs, speed) {
  if (burstMs === null || !Number.isFinite(absoluteMs)) return 0;
  const p = (absoluteMs - burstMs) / burstWindowMs(speed);
  if (p <= -BURST.camLead || p >= BURST.camOutEnd) return 0;
  if (p < BURST.camIn) return smooth((p + BURST.camLead) / (BURST.camIn + BURST.camLead));
  if (p <= BURST.camHoldEnd) return 1;
  return 1 - smooth((p - BURST.camHoldEnd) / (BURST.camOutEnd - BURST.camHoldEnd));
}

/**
 * Destello de la vista lejana (cuando el globo 3D es demasiado pequeño para verse): un punto que
 * se expande y se desvanece. Devuelve false si no está activo.
 */
export function flashState(p, out) {
  if (!(p >= 0) || p >= BURST.flashFrac) return false;
  const t = p / BURST.flashFrac;
  out.sizePx = 14 + 34 * easeOut(t);
  out.alpha = 0.9 * (1 - t);
  return true;
}
