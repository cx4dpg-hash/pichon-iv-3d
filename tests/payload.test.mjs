// Modelo procedural de la carga: la antena inferior son 4 alambres (3 inclinados de ~0,6 m en
// pirámide invertida + 1 vertical de ~1 m) y no hay antena superior.
import test from "node:test";
import assert from "node:assert/strict";
import { ANTENNA, antennaGeometry, buildPayloadModel } from "../js/payload.js";

const dims = { length: 0.45, width: 0.25, height: 0.18 };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test("3 alambres inclinados de 0,60 m convergen en un único vértice inferior", () => {
  const { tops, vertex } = antennaGeometry(dims.height);
  assert.equal(tops.length, 3);
  for (const t of tops) {
    assert.ok(Math.abs(dist(t, vertex) - 0.6) < 1e-9);
    assert.ok(t[2] > vertex[2]); // el vértice queda debajo de los extremos
  }
  assert.ok(Math.abs(dist(tops[0], tops[1]) - dist(tops[1], tops[2])) < 1e-9); // 120° entre sí
  assert.ok(vertex[2] < -dims.height / 2); // bajo la carga
});

test("un único alambre vertical de 1 m baja desde el vértice", () => {
  const { vertex, tip } = antennaGeometry(dims.height);
  assert.ok(Math.abs(dist(vertex, tip) - ANTENNA.verticalLengthM) < 1e-9);
  assert.equal(tip[0], vertex[0]);
  assert.equal(tip[1], vertex[1]);
  assert.ok(tip[2] < vertex[2]);
});

test("el modelo no tiene nada sobre la tapa salvo cordeles (sin antena superior) y es liviano", () => {
  const m = buildPayloadModel(dims);
  const top = dims.width / 2; // colgada de canto: la altura vertical es el lado de 0,25 m
  for (const b of m.boxes) {
    if (b.color === "#f0c419") continue; // nudos amarillos (cruces y punto de suspensión)
    assert.ok(b.center[2] + b.size[2] / 2 < top + 0.02, "ninguna pieza se eleva sobre la tapa");
  }
  assert.ok(m.label.center[1] < 0 && Math.abs(m.label.center[2]) < 0.02, "la etiqueta está en la cara ancha vertical (sobre la pieza elevada), no arriba");
  const silver = m.lines.filter((l) => l.color === "#d6dade");
  assert.equal(silver.length, 4); // 3 inclinados + 1 vertical
  assert.ok(m.boxes.length + m.lines.length < 140);
});
