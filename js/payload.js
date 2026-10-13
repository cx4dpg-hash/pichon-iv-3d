// Modelo procedural de la CARGA ÚTIL (geometría pura, sin Cesium): cajas y líneas en coordenadas
// locales (metros físicos; x = largo, y = ancho, z = arriba; origen = centro de la caja de espuma).
// Es una reconstrucción VISUAL a partir de fotografías del lanzamiento; no contiene mediciones.
//
// Antena inferior (fotografías): 4 elementos de alambre fino y NINGUNA antena superior.
//   · 3 alambres inclinados de ~0,60 m que salen de tres puntos separados bajo la carga y
//     convergen en un único vértice inferior (pirámide triangular invertida);
//   · 1 alambre vertical de ~1,00 m que baja desde ese vértice.
// Los tres alambres inclinados tienen el mismo largo y están a 120° entre sí.

export const ANTENNA = {
  slantLengthM: 0.6, // cada alambre inclinado
  verticalLengthM: 1.0, // alambre vertical bajo el vértice
  spreadRadiusM: 0.4, // radio horizontal de los extremos superiores (≈ 0,83 m de punta a punta, como en la foto)
  firstAzimuthDeg: 90,
  strutRadiusFraction: 0.35, // la cinta azul de cada tirante está a esta fracción del alambre desde el vértice
};

const C = {
  foam: "#fffdf8",
  foamLow: "#f7f4ec",
  shade: "#aaa699",
  foamUp: "#fffefa",
  foamLid: "#ffffff",
  label: "#f2f5f8",
  blue: "#2766d6",
  dark: "#2b2b2b",
  tape: "#e8e8e1",
  yellow: "#f0c419",
  silver: "#d6dade",
  copper: "#c9742a",
  strut: "#8ea36f",
  red: "#c4231f",
  black: "#1c1c1c",
};

const deg = Math.PI / 180;

/** Los 3 alambres inclinados y el vertical: extremos superiores, vértice y punta inferior. */
export function antennaGeometry(payloadHeightM) {
  const { slantLengthM, verticalLengthM, spreadRadiusM, firstAzimuthDeg } = ANTENNA;
  const topZ = -payloadHeightM / 2; // los extremos libres llegan a la altura de la base de la caja
  const drop = Math.sqrt(slantLengthM * slantLengthM - spreadRadiusM * spreadRadiusM);
  const vertex = [0, 0, topZ - drop];
  const tops = [0, 1, 2].map((k) => {
    const a = (firstAzimuthDeg + k * 120) * deg;
    return [spreadRadiusM * Math.cos(a), spreadRadiusM * Math.sin(a), topZ];
  });
  return { tops, vertex, tip: [0, 0, vertex[2] - verticalLengthM], drop };
}

/**
 * Piezas del modelo para una caja de L × W × H (m). Devuelve:
 *   boxes:  { center, size, color, outline, foam, yaw }   (espuma, nudos, conectores…)
 *   label:  cuadrilátero de la etiqueta pegada a la cara lateral y < 0 (centro, ancho y alto en m)
 *   lines:  { points, color, width }           (cordeles, cables, antena…)
 *   bridleApex: punto donde confluyen los cordeles de suspensión (la línea al globo parte de aquí)
 */
export function buildPayloadModel({ length: L, width: W, height: H }) {
  const boxes = [];
  const lines = [];
  // foam: pieza de espuma (con textura de grano); yaw: giro artesanal en grados alrededor de la vertical
  // La caja se modela primero "plana" (cara ancha con la pieza elevada hacia +z) y se la cuelga de
  // canto: rot() gira esa geometría 90° alrededor de x (+z → −y, y → +z), de modo que la cara ancha con
  // la pieza elevada y la etiqueta queda VERTICAL, mirando a −y. Solo se gira lo unido al cuerpo de
  // espuma (piezas, cordeles, cables); la suspensión sobre la carga y la antena quedan verticales.
  const rot = (p) => [p[0], -p[2], p[1]];
  let attached = true; // true: la geometría que se agrega pertenece al cuerpo y se gira
  // foam: pieza de espuma (con grano); yaw: giro artesanal (grados) alrededor de la normal de la cara ancha
  const box = (center, size, color, { outline = false, foam = false, yaw = 0 } = {}) =>
    boxes.push({
      center: attached ? rot(center) : center,
      size: attached ? [size[0], size[2], size[1]] : size,
      color,
      outline,
      foam,
      rotY: -yaw, // un giro alrededor de la antigua z es un giro (de signo opuesto) alrededor de y
    });
  // jit: amplitud (m) de una ondulación leve y determinista, para que cordeles y cables no sean rectas perfectas
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5);
  const wobble = (pts, jit) => {
    if (!jit) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const n = Math.max(1, Math.min(8, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.045)));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        out.push(k === n ? q : [q[0] + rnd() * jit * 2, q[1] + rnd() * jit * 2, q[2] + rnd() * jit * 2]);
      }
    }
    return out;
  };
  const line = (points, color, width = 2, jit = 0) => {
    const pts = wobble(points, jit);
    lines.push({ points: attached ? pts.map(rot) : pts, color, width });
  };
  // Pieza de espuma con cantos suaves: la unión de tres cajas, cada una recortada en dos ejes con
  // distinto retranqueo (así no hay caras coplanares), da un chaflán en las 12 aristas.
  const ch = 0.005;
  const foamBlock = (center, size, opts) => {
    for (const [ix, iy, iz] of [[ch, 0, 1.2 * ch], [1.1 * ch, ch, 0], [0, 1.2 * ch, 1.1 * ch]]) {
      box(center, [size[0] - 2 * ix, size[1] - 2 * iy, size[2] - 2 * iz], C.foam, { foam: true, ...opts });
    }
  };
  // Nudo: un bulto principal con dos más chicos, desparejos
  const knot = (k) => {
    box(k, [0.016, 0.016, 0.013], C.yellow);
    box([k[0] + 0.005, k[1] + 0.003, k[2] + 0.004], [0.009, 0.01, 0.007], C.yellow);
    box([k[0] - 0.005, k[1] - 0.004, k[2] + 0.003], [0.008, 0.008, 0.008], C.yellow);
  };

  const zb = -H / 2;
  const c = 0.012; // bisel inferior (los bordes de la espuma no son aristas vivas)
  const hLayer = 0.07;

  // --- Cuerpo de espuma: base chica + dos capas con cantos suaves, desfasadas y giradas unos grados.
  //     Entre capas queda una ranura natural (chaflanes) con una línea de sombra en el fondo. ---
  foamBlock([0, 0, zb + c / 2], [L - 2 * c, W - 2 * c, c], { yaw: 0.3 });
  foamBlock([0, 0, zb + c + hLayer / 2], [L, W, hLayer], { yaw: -0.25 });
  foamBlock([0.004, -0.0025, zb + c + hLayer * 1.5], [L - 0.008, W - 0.006, hLayer], { yaw: 0.8 });
  const zBodyTop = zb + c + 2 * hLayer;
  box([0.002, -0.001, zb + c + hLayer], [L - 0.016, W - 0.014, 0.003], C.shade); // junta entre capas
  box([0.001, 0, zb + c], [L - 2 * c - 0.012, W - 2 * c - 0.012, 0.003], C.shade); // junta con la base

  // --- Tapa: pieza de espuma más chica, simple, apenas elevada, centrada ---
  const lidL = L * 0.62;
  const lidW = W * 0.7;
  const lidH = H / 2 - zBodyTop;
  foamBlock([0.006, 0.002, zBodyTop + lidH / 2], [lidL, lidW, lidH], { yaw: -1.1 });
  box([0.006, 0.002, zBodyTop + 0.0005], [lidL - 0.012, lidW - 0.012, 0.003], C.shade); // sombra bajo la tapa
  const zLidTop = H / 2;
  const zLidBase = zBodyTop;

  // --- Etiqueta impresa pegada SOBRE la pieza elevada (cara ancha, que ahora mira a −y): se dibuja
  //     como un cuadrilátero con textura (ver payloadtextures.js). ---
  const label = { center: rot([0.006, 0.002, zLidTop + 0.0016]), width: 0.2, height: 0.098 };

  // --- Cordeles amarillos ---
  const zTopBody = zBodyTop + 0.003;
  const yLid = lidW / 2;
  const yb = W / 2 - 0.004;
  const yS = W / 2 + 0.003;
  const xBand = 0.1;
  for (const sx of [-1, 1]) {
    const x = sx * xBand;
    // Banda alrededor de la caja pasando por encima de la tapa
    line(
      [
        [x, -yLid, zLidTop + 0.003],
        [x, yLid, zLidTop + 0.003],
        [x, yLid + 0.003, zLidBase + 0.003],
        [x, yb, zTopBody],
        [x, yS, zBodyTop - 0.03],
        [x, yS, zb + 0.03],
        [x, yb, zb - 0.003],
        [x, -yb, zb - 0.003],
        [x, -yS, zb + 0.03],
        [x, -yS, zBodyTop - 0.03],
        [x, -yb, zTopBody],
        [x, -yLid - 0.003, zLidBase + 0.003],
        [x, -yLid, zLidTop + 0.003],
      ],
      C.yellow,
      2,
      0.0015,
    );
  }
  const xEnd = L / 2 + 0.003;
  const xLidEnd = lidL / 2 + 0.003;
  for (const sy of [-1, 1]) {
    const y = sy * 0.055;
    // Cordel longitudinal sobre la tapa, bajando por los extremos
    line(
      [
        [-xEnd, y, zb + 0.03],
        [-xEnd, y, zBodyTop - 0.03],
        [-(L / 2 - 0.01), y, zTopBody],
        [-xLidEnd + 0.006, y, zLidBase + 0.003],
        [-xLidEnd + 0.009, y, zLidTop + 0.003],
        [xLidEnd - 0.003, y, zLidTop + 0.003],
        [xLidEnd, y, zLidBase + 0.003],
        [L / 2 - 0.01, y, zTopBody],
        [xEnd, y, zBodyTop - 0.03],
        [xEnd, y, zb + 0.03],
      ],
      C.yellow,
      2,
      0.0015,
    );
  }

  // Nudos en los cruces (sobre la pieza elevada) y cuatro amarras sobre la cara superior de la caja
  // (la antigua +y, que al colgar de canto queda arriba) que confluyen en un vértice sobre la carga.
  const apex = [0, 0, W / 2 + 0.3];
  const yTop = W / 2 + 0.003;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      knot([sx * xBand, sy * 0.055, zLidTop + 0.005]);
      const k = [sx * xBand, yTop, sy * 0.05]; // sobre la banda transversal, en la cara superior
      knot(k);
      attached = false;
      line([rot(k), apex], C.yellow, 1.5, 0.0012);
      attached = true;
    }
  }
  attached = false;
  knot(apex); // nudo del punto de suspensión
  attached = true;

  // --- Tomas y cables: salen de la base de la caja colgada (la antigua cara −z de la espuma) y
  //     cuelgan hacia abajo, hacia la parte trasera (y > 0) para no tapar la etiqueta ---
  attached = false;
  const zB = -W / 2;
  box([0.03, 0.03, zB - 0.0012], [0.13, 0.045, 0.003], C.tape); // parche de cinta
  box([0.075, 0.03, zB - 0.0025], [0.02, 0.02, 0.004], C.dark); // orificios
  box([0.105, 0.03, zB - 0.0025], [0.02, 0.02, 0.004], C.dark);
  line([[0.0, 0.03, zB - 0.004], [0.012, 0.045, zB - 0.04], [0.016, 0.05, zB - 0.1]], C.dark, 2, 0.0018);
  box([0.016, 0.05, zB - 0.108], [0.014, 0.014, 0.03], C.blue); // conector azul
  box([0.0165, 0.0505, zB - 0.128], [0.007, 0.007, 0.012], C.dark);
  line([[0.05, 0.03, zB - 0.004], [0.066, 0.045, zB - 0.03], [0.07, 0.05, zB - 0.07]], C.red, 2, 0.0018);
  line([[0.07, 0.05, zB - 0.07], [0.073, 0.052, zB - 0.1]], C.black, 3.5, 0.0018); // funda negra
  box([0.047, 0.04, zB - 0.062], [0.014, 0.012, 0.026], C.blue);
  box([0.0475, 0.0405, zB - 0.079], [0.007, 0.006, 0.01], C.dark);
  line([[L / 2 - 0.01, 0.0, zB - 0.003], [L / 2 + 0.004, 0.02, zB - 0.06], [L / 2 + 0.006, 0.026, zB - 0.1]], C.red, 1.5, 0.0018);

  // --- Antena inferior: 3 alambres inclinados + 1 vertical (ver ANTENNA); cuelga de la base ---
  const zBottom = zB; // base de la caja colgada de canto
  const ant = antennaGeometry(W);
  const strutFrac = ANTENNA.strutRadiusFraction;
  const hubZ = ant.vertex[2] + ant.drop * strutFrac + 0.04;
  ant.tops.forEach((top) => {
    line([top, ant.vertex], C.silver, 1.5); // alambre inclinado (0,60 m)
    // Tirante verde corto hasta el punto del alambre marcado con cinta azul
    const tape = [top[0] * strutFrac, top[1] * strutFrac, ant.vertex[2] + ant.drop * strutFrac];
    line([[0, 0, hubZ], [tape[0] * 0.5, tape[1] * 0.5, (hubZ + tape[2]) / 2 - 0.004], tape], C.strut, 2.5); // leve caída
    box(tape, [0.026, 0.026, 0.016], C.blue);
    box([tape[0], tape[1], tape[2] + 0.004], [0.03, 0.022, 0.009], C.blue); // la cinta no está pareja
    // Cordel amarillo desde la cinta hasta el fondo de la caja
    line([tape, [top[0] * 0.2, top[1] * 0.2, zBottom]], C.yellow, 1.2, 0.0012);
  });
  line([[0, 0, zBottom], ant.vertex], C.copper, 1.5); // alimentador central hasta el vértice
  line([ant.vertex, ant.tip], C.silver, 1.5); // alambre vertical (1 m)

  return { boxes, lines, label, bridleApex: apex, antenna: ant, riseAboveTopM: apex[2] - W / 2, hanging: { length: L, width: H, height: W } };
}
