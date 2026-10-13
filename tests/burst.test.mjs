// Animación de ruptura del globo: función pura del instante simulado (sin estado oculto).
import test from "node:test";
import assert from "node:assert/strict";
import {
  BURST,
  FRAGMENTS,
  burstPhase,
  burstWindowMs,
  expansionFactor,
  fragmentProgress,
  fragmentState,
  flashState,
} from "../js/burst.js";

const T = 1_000_000; // instante de ruptura de prueba (ms)

test("antes de la ruptura el globo está intacto; sin ruptura (null) siempre intacto", () => {
  assert.deepEqual(burstPhase(T - 1, T, 1), { state: "intact", p: 0 });
  assert.deepEqual(burstPhase(0, T, 64), { state: "intact", p: 0 });
  assert.equal(burstPhase(T + 5e9, null, 1).state, "intact");
  assert.equal(burstPhase(Number.NaN, T, 1).state, "intact");
});

test("exactamente en el instante de ruptura empieza la expansión (p = 0), sin ambigüedad", () => {
  const a = burstPhase(T, T, 1);
  assert.equal(a.state, "expanding");
  assert.equal(a.p, 0);
  assert.equal(expansionFactor(0), 1); // idéntico al globo intacto en el primer instante
});

test("la secuencia es expansión → fragmentos → nada, con los límites esperados", () => {
  const w = burstWindowMs(1);
  assert.equal(w, BURST.realMs);
  assert.equal(burstPhase(T + w * BURST.expandFrac * 0.99, T, 1).state, "expanding");
  assert.equal(burstPhase(T + w * BURST.expandFrac, T, 1).state, "fragments");
  assert.equal(burstPhase(T + w * 0.999, T, 1).state, "fragments");
  assert.deepEqual(burstPhase(T + w, T, 1), { state: "gone", p: 1 });
  assert.deepEqual(burstPhase(T + 10 * w, T, 1), { state: "gone", p: 1 });
});

test("la duración en pantalla es la misma a cualquier velocidad (ventana = realMs × velocidad)", () => {
  for (const speed of [1, 2, 4, 8, 16, 32, 64]) {
    const w = burstWindowMs(speed);
    assert.equal(w, BURST.realMs * speed);
    // A esa velocidad, la ventana dura realMs de pantalla (w simulados / speed por segundo real).
    assert.equal(w / speed, BURST.realMs);
    assert.equal(burstPhase(T + w - 1, T, speed).state, "fragments");
    assert.equal(burstPhase(T + w, T, speed).state, "gone");
  }
  assert.equal(burstWindowMs(0.5), BURST.realMs); // nunca por debajo de 1x
  assert.equal(burstWindowMs(Number.NaN), BURST.realMs);
});

test("scrub: el resultado depende solo del instante (adelante, atrás y saltos dan lo mismo)", () => {
  const w = burstWindowMs(8);
  const instants = [T - 5000, T, T + w * 0.03, T + w * 0.4, T + w * 0.9, T + w + 1, T + 60000];
  const forward = instants.map((t) => burstPhase(t, T, 8));
  const backward = [...instants].reverse().map((t) => burstPhase(t, T, 8)).reverse();
  const shuffled = [3, 0, 6, 1, 5, 2, 4].map((i) => [i, burstPhase(instants[i], T, 8)]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  assert.deepEqual(forward, backward);
  assert.deepEqual(forward, shuffled);
});

test("la expansión crece de 1 a 1 + expansion y es monótona", () => {
  let prev = 1;
  for (let i = 0; i <= 20; i++) {
    const f = expansionFactor((BURST.expandFrac * i) / 20);
    assert.ok(f >= prev - 1e-12);
    prev = f;
  }
  assert.ok(Math.abs(expansionFactor(BURST.expandFrac) - (1 + BURST.expansion)) < 1e-12);
  assert.equal(expansionFactor(BURST.expandFrac * 5), 1 + BURST.expansion); // se mantiene acotada
});

test("el progreso de fragmentos va de 0 a 1 dentro de su fase", () => {
  assert.equal(fragmentProgress(BURST.expandFrac), 0);
  assert.equal(fragmentProgress(1), 1);
  assert.equal(fragmentProgress(0), 0);
  assert.ok(Math.abs(fragmentProgress((1 + BURST.expandFrac) / 2) - 0.5) < 1e-12);
});

test("hay BURST.count fragmentos, la tabla es determinista y las direcciones son unitarias", () => {
  assert.equal(FRAGMENTS.length, BURST.count);
  for (const f of FRAGMENTS) {
    assert.ok(Math.abs(Math.hypot(...f.dir) - 1) < 1e-9);
    assert.ok(Math.abs(Math.hypot(...f.axis) - 1) < 1e-9);
    assert.ok(f.width > 0 && f.length > 0 && f.reach > 0);
  }
  assert.equal(FRAGMENTS.filter((f) => f.width > 0.45).length, 3); // restos de faldón
});

test("los fragmentos nacen en la superficie del globo, se alejan, caen y se desvanecen sin NaN", () => {
  const out = {};
  for (const def of FRAGMENTS) {
    fragmentState(def, 0, out);
    assert.ok(Math.abs(Math.hypot(out.x, out.y, out.z) - 0.9) < 1e-9);
    assert.equal(out.alpha, 1);
    assert.equal(out.scale, 1);
    let prevAlpha = 1;
    let prevR = 0.9;
    for (let i = 0; i <= 50; i++) {
      const q = i / 50;
      fragmentState(def, q, out);
      for (const v of Object.values(out)) assert.ok(Number.isFinite(v));
      assert.ok(out.alpha <= prevAlpha + 1e-12 && out.alpha >= 0 && out.alpha <= 1);
      assert.ok(out.scale > 0 && out.scale <= 1);
      prevAlpha = out.alpha;
      // la distancia horizontal al centro no disminuye (se separan)
      const r = Math.hypot(out.x, out.y);
      assert.ok(r >= 0 && Number.isFinite(r));
      prevR = r;
    }
    fragmentState(def, 1, out);
    assert.equal(out.alpha, 0); // al final de la fase ya no se ven
    assert.ok(out.z < def.dir[2] * (0.9 + def.reach)); // y cayeron respecto a su trayectoria sin gravedad
    assert.ok(prevR >= 0);
  }
});

test("los fragmentos no empiezan a desvanecerse antes de fadeStart y terminan invisibles", () => {
  const out = {};
  fragmentState(FRAGMENTS[0], BURST.fadeStart - 0.01, out);
  assert.equal(out.alpha, 1);
  fragmentState(FRAGMENTS[0], 0.99, out);
  assert.ok(out.alpha > 0 && out.alpha < 0.05);
});

test("el destello de la vista lejana dura la primera mitad de la ventana y se desvanece", () => {
  const out = {};
  assert.equal(flashState(0, out), true);
  assert.equal(out.sizePx, 14);
  assert.ok(Math.abs(out.alpha - 0.9) < 1e-12);
  assert.equal(flashState(BURST.flashFrac * 0.99, out), true);
  assert.ok(out.alpha < 0.02 && out.sizePx < 48.01);
  assert.equal(flashState(BURST.flashFrac, out), false);
  assert.equal(flashState(1, out), false);
  assert.equal(flashState(-0.1, out), false);
});

test("las siluetas de los trozos son polígonos irregulares, deterministas y acotados", async () => {
  const { SHARDS } = await import("../js/burst.js");
  assert.equal(SHARDS.length, 6);
  for (const s of SHARDS) {
    assert.ok(s.pts.length >= 7 && s.pts.length <= 9);
    for (const [x, y] of s.pts) assert.ok(Math.abs(x) <= 0.5 + 1e-9 && Math.abs(y) <= 0.5 + 1e-9);
    const radii = s.pts.map(([x, y]) => Math.hypot(x, y));
    assert.ok(Math.max(...radii) / Math.min(...radii) > 1.25, "no debe ser un polígono regular");
    assert.ok(s.fold >= 0 && s.fold <= Math.PI);
  }
  for (const f of FRAGMENTS) assert.ok(f.shape >= 0 && f.shape < SHARDS.length && f.tone >= 0 && f.tone <= 2);
  const { SHARDS: again } = await import("../js/burst.js?again");
  assert.deepEqual(again.map((s) => s.pts), SHARDS.map((s) => s.pts));
});

test("el volteo mantiene un ancho mínimo y el sombreado mate queda acotado", () => {
  const out = {};
  for (const def of FRAGMENTS) {
    for (let i = 0; i <= 40; i++) {
      fragmentState(def, i / 40, out);
      assert.ok(out.flip >= 0.14 - 1e-12 && out.flip <= 1 + 1e-12);
      assert.ok(out.shade >= 0.8 - 1e-12 && out.shade <= 1 + 1e-12);
    }
  }
});

test("la cámara de Seguir globo: 0 fuera de la ventana, 1 durante la rotura, suave y sin saltos", async () => {
  const { burstCameraBlend } = await import("../js/burst.js");
  const w = burstWindowMs(8);
  assert.equal(burstCameraBlend(T - w * BURST.camLead - 1, T, 8), 0);
  assert.equal(burstCameraBlend(T + w * BURST.camOutEnd + 1, T, 8), 0);
  assert.equal(burstCameraBlend(0, null, 8), 0);
  assert.equal(burstCameraBlend(T + w * 0.5, T, 8), 1);
  assert.ok(burstCameraBlend(T, T, 8) > 0.9 && burstCameraBlend(T, T, 8) < 1); // casi completa al romper
  assert.equal(burstCameraBlend(T + w * BURST.camIn, T, 8), 1);
  // monótona al subir (antes de romper) y al bajar (después), y continua
  let prev = 0;
  for (let i = 0; i <= 100; i++) {
    const v = burstCameraBlend(T - w * BURST.camLead + (w * (BURST.camLead + BURST.camIn) * i) / 100, T, 8);
    assert.ok(v >= prev - 1e-12 && v >= 0 && v <= 1);
    prev = v;
  }
  assert.ok(Math.abs(prev - 1) < 1e-9);
  prev = 1;
  for (let i = 0; i <= 100; i++) {
    const v = burstCameraBlend(T + w * BURST.camHoldEnd + (w * (BURST.camOutEnd - BURST.camHoldEnd) * i) / 100, T, 8);
    assert.ok(v <= prev + 1e-12 && v >= 0 && v <= 1);
    prev = v;
  }
  assert.ok(prev < 1e-9);
  // sin saltos grandes entre muestras muy próximas
  for (let t = T - w; t < T + 2 * w; t += w / 500) {
    assert.ok(Math.abs(burstCameraBlend(t + w / 500, T, 8) - burstCameraBlend(t, T, 8)) < 0.05);
  }
});
