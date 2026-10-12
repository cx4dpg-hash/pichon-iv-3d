// Encuadre de "Vista general": busca la posición de cámara más cercana (con la orientación dada)
// desde la que TODOS los puntos clave (con su margen de etiqueta) caen dentro del área visible del
// mapa, que excluye el ancho real del panel izquierdo cuando está visible. Matemática pura (sin
// Cesium ni DOM) para poder probarla en Node; map3d.js aporta los puntos, el marco local y las
// medidas de pantalla.
//
// Modelo: cámara en perspectiva que mira en la dirección `dir` (derecha = este local, arriba de la
// cámara = up). Un punto a profundidad f proyecta a x = W/2 + (r/f)/tx · W/2, y = H/2 − (u/f)/ty · H/2.
// Para un alejamiento (range) dado se centra por iteración la caja proyectada en el rectángulo
// seguro desplazando la cámara de lado y en altura; el range mínimo que cabe se halla por bisección.

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * @param {object} o
 * @param {{p:number[], padL?:number, padR?:number, padT?:number, padB?:number}[]} o.points puntos ECEF y holgura en px
 * @param {{east:number[], north:number[], up:number[]}} o.frame marco local en el centro del recorrido
 * @param {number[]} o.center centro (ECEF) hacia el que se orienta la cámara
 * @param {number} o.pitchDeg inclinación (negativa = mirando hacia abajo)
 * @param {number} o.width ancho del lienzo (px)
 * @param {number} o.height alto del lienzo (px)
 * @param {number} o.fovy campo de visión vertical (rad)
 * @param {{left:number, right:number, top:number, bottom:number}} o.safe rectángulo seguro (px)
 * @returns {{eye:number[], direction:number[], up:number[], range:number, fits:boolean}}
 */
export function fitOverview({ points, frame, center, pitchDeg, width, height, fovy, safe }) {
  const pitch = (pitchDeg * Math.PI) / 180;
  const dir = norm(add(mul(frame.north, Math.cos(pitch)), mul(frame.up, Math.sin(pitch))));
  const right = frame.east;
  const camUp = norm(cross(right, dir));
  const ty = Math.tan(fovy / 2);
  const tx = ty * (width / height);
  const kx = width / 2 / tx; // px por unidad de r/f
  const ky = height / 2 / ty;
  const targetX = (safe.left + safe.right) / 2;
  const targetY = (safe.top + safe.bottom) / 2;

  const project = (P, eye) => {
    const v = sub(P, eye);
    const f = dot(v, dir);
    return { x: width / 2 + (dot(v, right) / f) * kx, y: height / 2 - (dot(v, camUp) / f) * ky, f };
  };
  const boxAt = (eye) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of points) {
      const q = project(pt.p, eye);
      minX = Math.min(minX, q.x - (pt.padL ?? 0));
      maxX = Math.max(maxX, q.x + (pt.padR ?? 0));
      minY = Math.min(minY, q.y - (pt.padT ?? 0));
      maxY = Math.max(maxY, q.y + (pt.padB ?? 0));
    }
    return { minX, maxX, minY, maxY };
  };
  const place = (range) => {
    let dx = 0, dy = 0;
    let eye = sub(center, mul(dir, range));
    for (let i = 0; i < 12; i++) {
      eye = add(sub(center, mul(dir, range)), add(mul(right, dx), mul(camUp, dy)));
      const b = boxAt(eye);
      const ex = (b.minX + b.maxX) / 2 - targetX;
      const ey = (b.minY + b.maxY) / 2 - targetY;
      if (Math.abs(ex) < 0.25 && Math.abs(ey) < 0.25) break;
      dx += (ex / kx) * range; // caja a la derecha → mover la cámara a la derecha
      dy -= (ey / ky) * range; // caja más abajo → mover la cámara hacia abajo
    }
    return { eye, box: boxAt(eye) };
  };
  const fitsIn = (b) => b.minX >= safe.left - 0.5 && b.maxX <= safe.right + 0.5 && b.minY >= safe.top - 0.5 && b.maxY <= safe.bottom + 0.5;

  // Escala de partida: extensión del recorrido.
  let extent = 1;
  for (const pt of points) extent = Math.max(extent, Math.hypot(...sub(pt.p, center)));
  let lo = extent * 0.05;
  let hi = extent * 60;
  let best = place(hi);
  for (let i = 0; i < 48; i++) {
    const mid = Math.sqrt(lo * hi);
    const r = place(mid);
    if (fitsIn(r.box)) {
      hi = mid;
      best = r;
    } else {
      lo = mid;
    }
  }
  return { eye: best.eye, direction: dir, up: camUp, range: hi, fits: fitsIn(best.box) };
}

/** Rectángulo seguro (px) del mapa: excluye el panel izquierdo si está visible y deja márgenes. */
export function safeRect({ width, height, leftInsetPx = 0, margin = 24, top = 52, bottom = 56 }) {
  return { left: Math.min(leftInsetPx + margin, width * 0.6), right: width - margin, top, bottom: height - bottom };
}

/**
 * Área segura en móvil (px, respecto del lienzo): descuenta la cabecera superior y la parte del
 * panel inferior (bottom sheet) que se superpone al mapa, más los márgenes de área segura laterales.
 * `bottomPx` es la altura del lienzo tapada por la UI (0 si el panel está colapsado y queda fuera).
 */
export function mobileSafeRect({ width, height, topPx = 0, bottomPx = 0, leftPx = 0, rightPx = 0, margin = 12 }) {
  const left = leftPx + margin;
  const right = width - rightPx - margin;
  const top = topPx + margin;
  const bottom = height - Math.max(0, bottomPx) - margin;
  return { left, right: Math.max(right, left + 1), top, bottom: Math.max(bottom, top + 1) };
}

/**
 * Limita la holgura de las etiquetas: en una pantalla estrecha una etiqueta de ~330 px no puede
 * reservar casi todo el ancho (el encuadre degeneraría en un acercamiento extremo).
 */
export function capPads(points, { maxSidePx, maxVerticalPx = Infinity }) {
  return points.map((pt) => ({
    ...pt,
    padL: Math.min(pt.padL ?? 0, maxSidePx),
    padR: Math.min(pt.padR ?? 0, maxSidePx),
    padT: Math.min(pt.padT ?? 0, maxVerticalPx),
    padB: Math.min(pt.padB ?? 0, maxVerticalPx),
  }));
}
