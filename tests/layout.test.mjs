// Presentación móvil: detección de layout, alturas y estados del bottom sheet (js/layout.js) y
// área segura / holguras del encuadre responsive (js/overview.js).
import test from "node:test";
import assert from "node:assert/strict";
import {
  detectLayout,
  isMobileLayout,
  sheetHeights,
  toggleSheet,
  stepSheet,
  stateOnTabSelect,
  dragHeight,
  snapSheetState,
} from "../js/layout.js";
import { fitOverview, safeRect, mobileSafeRect, capPads } from "../js/overview.js";

test("teléfonos verticales → mobile-portrait", () => {
  for (const [width, height] of [[430, 932], [393, 852], [390, 844], [360, 800]]) {
    assert.equal(detectLayout({ width, height, coarsePointer: true }), "mobile-portrait");
  }
});

test("teléfonos apaisados (táctiles) → mobile-landscape, no escritorio, aunque el ancho sea grande", () => {
  for (const [width, height] of [[932, 430], [852, 393]]) {
    assert.equal(detectLayout({ width, height, coarsePointer: true }), "mobile-landscape");
  }
});

test("escritorio y tablets siguen en desktop", () => {
  for (const [width, height] of [[1920, 1080], [1600, 900], [1366, 768]]) {
    assert.equal(detectLayout({ width, height, coarsePointer: false }), "desktop");
  }
  assert.equal(detectLayout({ width: 1024, height: 768, coarsePointer: true }), "desktop"); // tablet apaisada
  assert.equal(detectLayout({ width: 820, height: 1180, coarsePointer: true }), "desktop"); // tablet vertical
  assert.equal(detectLayout({ width: 900, height: 450, coarsePointer: false }), "desktop"); // ventana baja con ratón
});

test("ventana de escritorio estrecha (≤ 600 px) usa la disposición móvil", () => {
  assert.equal(detectLayout({ width: 500, height: 900, coarsePointer: false }), "mobile-portrait");
  assert.ok(isMobileLayout("mobile-landscape") && !isMobileLayout("desktop"));
});

test("alturas del sheet: ordenadas, el expandido no tapa la UI fija y en horizontal es menos alto", () => {
  const chrome = 48 + 130 + 58;
  const p = sheetHeights("mobile-portrait", 852, chrome);
  assert.equal(p.collapsed, 0);
  assert.ok(p.medium > 0 && p.medium < p.expanded);
  assert.ok(p.expanded <= 852 - chrome);
  const l = sheetHeights("mobile-landscape", 393, 40 + 52 + 44);
  assert.ok(l.medium < p.medium);
  assert.ok(l.expanded <= 393 - (40 + 52 + 44));
  const t = sheetHeights("mobile-landscape", 200, 190); // pantalla minúscula
  assert.ok(t.expanded >= 0 && t.medium <= t.expanded);
});

test("estados del sheet: handle, botón y pestañas", () => {
  assert.equal(toggleSheet("collapsed"), "medium");
  assert.equal(toggleSheet("medium"), "collapsed");
  assert.equal(toggleSheet("expanded"), "collapsed");
  assert.equal(stepSheet("collapsed"), "medium");
  assert.equal(stepSheet("medium"), "expanded");
  assert.equal(stepSheet("expanded"), "medium");
  assert.equal(stateOnTabSelect("collapsed"), "medium");
  assert.equal(stateOnTabSelect("expanded"), "expanded");
});

test("arrastre: sigue el dedo acotado y asienta en el estado más cercano", () => {
  const h = { collapsed: 0, medium: 340, expanded: 610 };
  assert.equal(dragHeight(340, -100, h), 440);
  assert.equal(dragHeight(340, 999, h), 0);
  assert.equal(dragHeight(340, -999, h), 610);
  assert.equal(snapSheetState({ heightPx: 300, heights: h }), "medium");
  assert.equal(snapSheetState({ heightPx: 560, heights: h }), "expanded");
  assert.equal(snapSheetState({ heightPx: 80, heights: h }), "collapsed");
  assert.equal(snapSheetState({ heightPx: 200, heights: h }), "medium");
  // un gesto rápido corto también cambia de estado
  assert.equal(snapSheetState({ heightPx: 250, velocityPxPerMs: -1.2, heights: h }), "collapsed");
  assert.equal(snapSheetState({ heightPx: 400, velocityPxPerMs: 1.2, heights: h }), "expanded");
});

// --- Vista general responsive ---
const frame = { east: [1, 0, 0], north: [0, 1, 0], up: [0, 0, 1] };
const pts = [];
for (let i = 0; i <= 40; i++) pts.push({ p: [-80000 + i * 4000, 5000 * Math.sin(i / 6), i * 600], padL: 10, padR: 10, padT: 10, padB: 10 });
pts.push({ p: [-80000, 0, 100], padL: 165, padR: 165, padT: 34, padB: 10 });
pts.push({ p: [75000, -4000, 0], padL: 125, padR: 125, padT: 10, padB: 50 });
const center = [0, 0, 12000];
const fovy = (60 * Math.PI) / 180;
function screen(P, pose, W, H) {
  const v = [P[0] - pose.eye[0], P[1] - pose.eye[1], P[2] - pose.eye[2]];
  const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const f = d(v, pose.direction);
  const ty = Math.tan(fovy / 2), tx = ty * (W / H);
  return { x: W / 2 + (d(v, [1, 0, 0]) / f / tx) * (W / 2), y: H / 2 - (d(v, pose.up) / f / ty) * (H / 2) };
}

test("mobileSafeRect descuenta cabecera, sheet y áreas seguras laterales", () => {
  const s = mobileSafeRect({ width: 390, height: 640, topPx: 95, bottomPx: 300, margin: 12 });
  assert.deepEqual(s, { left: 12, right: 378, top: 107, bottom: 328 });
  const l = mobileSafeRect({ width: 800, height: 300, topPx: 40, leftPx: 47, rightPx: 47 });
  assert.equal(l.left, 59);
  assert.equal(l.right, 741);
  const bad = mobileSafeRect({ width: 300, height: 200, topPx: 150, bottomPx: 500 });
  assert.ok(bad.bottom > bad.top && bad.right > bad.left);
});

test("capPads limita las etiquetas anchas sin tocar las demás ni mutar la entrada", () => {
  const out = capPads(pts, { maxSidePx: 100 });
  assert.equal(out[41].padL, 100);
  assert.equal(out[0].padL, 10);
  assert.equal(pts[41].padL, 165);
});

for (const [W, H, bottomPx] of [[430, 750, 0], [393, 670, 0], [390, 660, 300], [360, 620, 0], [360, 620, 340]]) {
  test(`móvil ${W}×${H} (UI inferior ${bottomPx}px): el recorrido queda dentro del área útil`, () => {
    const safe = mobileSafeRect({ width: W, height: H, topPx: 48, bottomPx });
    const points = capPads(pts, { maxSidePx: W * 0.3 });
    const pose = fitOverview({ points, frame, center, pitchDeg: -40, width: W, height: H, fovy, safe });
    assert.ok(pose.fits, "debe caber");
    for (const pt of points) {
      const s = screen(pt.p, pose, W, H);
      assert.ok(s.x - pt.padL >= safe.left - 1 && s.x + pt.padR <= safe.right + 1, `x ${s.x}`);
      assert.ok(s.y - pt.padT >= safe.top - 1 && s.y + pt.padB <= safe.bottom + 1, `y ${s.y}`);
    }
  });
}

test("escritorio: safeRect sin cambios (regresión)", () => {
  assert.deepEqual(safeRect({ width: 1600, height: 900, leftInsetPx: 450 }), { left: 474, right: 1576, top: 52, bottom: 844 });
});
