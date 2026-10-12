// Encuadre de Vista general: matemática pura de js/overview.js.
import test from "node:test";
import assert from "node:assert/strict";
import { fitOverview, safeRect } from "../js/overview.js";

// Marco local ficticio (este = x, norte = y, arriba = z) y puntos tipo "recorrido ancho y bajo".
const frame = { east: [1, 0, 0], north: [0, 1, 0], up: [0, 0, 1] };
const pts = [];
for (let i = 0; i <= 40; i++) pts.push({ p: [-80000 + i * 4000, 5000 * Math.sin(i / 6), i * 600], padL: 10, padR: 10, padT: 10, padB: 10 });
pts.push({ p: [-80000, 0, 100], padL: 165, padR: 165, padT: 34, padB: 10 }); // lanzamiento con etiqueta
pts.push({ p: [75000, -4000, 0], padL: 125, padR: 125, padT: 10, padB: 50 }); // rescate con etiqueta
const center = [0, 0, 12000];
const fovy = (60 * Math.PI) / 180;

function screen(P, pose, W, H) {
  const v = [P[0] - pose.eye[0], P[1] - pose.eye[1], P[2] - pose.eye[2]];
  const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const f = d(v, pose.direction);
  const ty = Math.tan(fovy / 2), tx = ty * (W / H);
  const right = [1, 0, 0];
  return { x: W / 2 + (d(v, right) / f / tx) * (W / 2), y: H / 2 - (d(v, pose.up) / f / ty) * (H / 2) };
}

for (const [W, H] of [[1920, 1080], [1600, 900], [1366, 768]]) {
  test(`${W}x${H}: con panel visible todo cae en el área segura, a la derecha del panel`, () => {
    const inset = 450;
    const safe = safeRect({ width: W, height: H, leftInsetPx: inset });
    const pose = fitOverview({ points: pts, frame, center, pitchDeg: -40, width: W, height: H, fovy, safe });
    assert.ok(pose.fits);
    for (const pt of pts) {
      const s = screen(pt.p, pose, W, H);
      assert.ok(s.x - pt.padL >= safe.left - 1 && s.x + pt.padR <= safe.right + 1, `x ${s.x}`);
      assert.ok(s.y - pt.padT >= safe.top - 1 && s.y + pt.padB <= safe.bottom + 1, `y ${s.y}`);
      assert.ok(s.x > inset, "nunca detrás del panel");
    }
  });
}

test("sin panel se usa el visor completo y el zoom es menor (más cerca) que con panel", () => {
  const W = 1600, H = 900;
  const a = fitOverview({ points: pts, frame, center, pitchDeg: -40, width: W, height: H, fovy, safe: safeRect({ width: W, height: H, leftInsetPx: 0 }) });
  const b = fitOverview({ points: pts, frame, center, pitchDeg: -40, width: W, height: H, fovy, safe: safeRect({ width: W, height: H, leftInsetPx: 450 }) });
  assert.ok(a.range < b.range);
  assert.ok(b.range < a.range * 1.8, "no se aleja de más");
  // sin panel el recorrido queda centrado horizontalmente
  const xs = pts.map((q) => screen(q.p, a, W, H).x);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  assert.ok(Math.abs(cx - W / 2) < 120, `centro ${cx}`);
});

test("el rectángulo seguro nunca deja el borde izquierdo más allá del 60 % del ancho", () => {
  const s = safeRect({ width: 800, height: 600, leftInsetPx: 790 });
  assert.ok(s.left <= 480);
});
