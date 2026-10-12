// Geometría pura del campo de nubes 3D derivada de cloud-model.json.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FIELD, buildField, parseModel, paramsAtTime, elementGeometry, eastWeight, footprintCoverage } from "../js/cloudfield.js";

const model = JSON.parse(readFileSync(new URL("../data/clouds/cloud-model.json", import.meta.url), "utf8"));
const states = parseModel(model);
const elements = buildField();

test("campo determinista, acotado y con pocos elementos", () => {
  const again = buildField();
  assert.deepEqual(elements.slice(0, 5), again.slice(0, 5));
  assert.ok(elements.length >= 100 && elements.length <= 400, `n=${elements.length}`);
  for (const e of elements) {
    assert.ok(e.lon > FIELD.minLon - 0.1 && e.lon < FIELD.maxLon + 0.1);
    assert.ok(e.lat > FIELD.minLat - 0.1 && e.lat < FIELD.maxLat + 0.1);
  }
});

test("los límites verticales salen del modelo: por zona, con transición suave", () => {
  const ms = states[3].ms; // 14:50 Z
  const p = paramsAtTime(states, ms);
  const z1 = model.states[3].zones.find((z) => z.zoneId.startsWith("Z1"));
  const z2 = model.states[3].zones.find((z) => z.zoneId.startsWith("Z2"));
  assert.equal(p.Z1.top, z1.cloudTopM.value);
  assert.equal(p.Z2.base, z2.cloudBaseM.value);
  assert.ok(eastWeight(-55.4) < 0.01 && eastWeight(-53.9) > 0.99);
  // la altura del tope baja gradualmente de oeste a este (sin salto)
  let prev = null;
  for (let lon = -55.0; lon <= -53.5; lon += 0.02) {
    const e = { lon, lat: -34.3, rank: 0, widthK: 1, depthK: 1, topU: 0, baseU: 0 };
    const g = elementGeometry(e, p);
    if (prev !== null) assert.ok(Math.abs(g.topM - prev) < 60, "transición suave");
    prev = g.topM;
  }
});

test("cada elemento queda entre base y tope con espesor positivo (volumen)", () => {
  for (const s of states) {
    const p = paramsAtTime(states, s.ms);
    for (const e of elements) {
      const g = elementGeometry(e, p);
      assert.ok(g.thicknessM >= 120 && g.topM > g.baseM);
      assert.ok(g.baseM > 100 && g.topM < 2200, `base ${g.baseM} top ${g.topM}`);
    }
  }
});

test("no es un plano único: hay variación de base y tope entre elementos", () => {
  const p = paramsAtTime(states, states[2].ms);
  const tops = new Set(elements.map((e) => Math.round(elementGeometry(e, p).topM / 5)));
  const bases = new Set(elements.map((e) => Math.round(elementGeometry(e, p).baseM / 5)));
  assert.ok(tops.size > 25 && bases.size > 25, `tops ${tops.size} bases ${bases.size}`);
});

test("evolución temporal gradual entre los siete estados", () => {
  assert.equal(states.length, 7);
  let prev = null;
  for (let ms = states[0].ms - 600000; ms <= states.at(-1).ms + 600000; ms += 60000) {
    const p = paramsAtTime(states, ms);
    if (prev) for (const z of ["Z1", "Z2"]) assert.ok(Math.abs(p[z].top - prev[z].top) < 40, "sin saltos de tope");
    prev = p;
  }
  assert.notEqual(paramsAtTime(states, states[0].ms).Z1.top, paramsAtTime(states, states[6].ms).Z1.top);
});

test("cobertura: ≈ 98–100 % de los elementos visibles y huella casi cerrada", () => {
  for (const s of states) {
    const p = paramsAtTime(states, s.ms);
    const interior = elements.filter((e) => e.lon > FIELD.minLon + 0.3 && e.lon < FIELD.maxLon - 0.3 && e.lat > FIELD.minLat + 0.1 && e.lat < FIELD.maxLat - 0.1);
    const visible = interior.filter((e) => elementGeometry(e, p).visible).length / interior.length;
    assert.ok(visible > 0.94, `visibles ${visible}`);
  }
  // huella visible efectiva ≈ 60 % del ancho nominal del sprite (medido en pantalla)
  const cov = footprintCoverage(elements, paramsAtTime(states, states[2].ms), 0.6 * 16);
  assert.ok(cov > 0.9, `cobertura de huella ${cov}`);
});
