// Pruebas de la corrección visual al terreno y de la fuente única de posición.
// node --test tests/floor.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { terrainFloorAltitudes, FLOOR_CLEARANCE_M } from "../js/floor.js";
import { positionAtTime, trajectorySamples } from "../js/playback.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const flight = JSON.parse(fs.readFileSync(path.join(root, "data/vuelo/transmissions.json"), "utf8")).flight;
const times = flight.map((tx) => Date.parse(tx.packetTimestampUtc));
const raw = flight.map((tx) => tx.altitudeGpsM);

test("floor: solo corrige cuando la altitud bruta queda bajo terreno + holgura", () => {
  const { display, corrections } = terrainFloorAltitudes([118, 121, 164, 394, 230], [127.2, 127.2, 122.2, 115.1, 11.5]);
  assert.deepEqual(display.map((v) => +v.toFixed(2)), [128.2, 128.2, 164, 394, 230]);
  assert.deepEqual(corrections.map((v) => +v.toFixed(2)), [10.2, 7.2, 0, 0, 0]);
  assert.equal(FLOOR_CLEARANCE_M, 1);
});

test("floor: nunca baja una altitud y no inventa terreno desconocido", () => {
  const { display, corrections } = terrainFloorAltitudes([50, 60, 70], [null, undefined, 10]);
  assert.deepEqual(display, [50, 60, 70]);
  assert.deepEqual(corrections, [0, 0, 0]);
  const r = terrainFloorAltitudes(raw, raw.map(() => -1000)); // terreno muy bajo: sin correcciones
  assert.ok(r.corrections.every((c) => c === 0));
  assert.deepEqual(r.display, raw);
});

test("floor: continuidad (max es continua) sobre los datos reales con un terreno plano", () => {
  const { display } = terrainFloorAltitudes(raw, raw.map(() => 127.2));
  for (let i = 1; i < display.length; i++) {
    assert.ok(Math.abs(display[i] - display[i - 1]) <= Math.abs(raw[i] - raw[i - 1]) + 1e-9, `salto en ${i}`);
  }
});

test("positionAtTime: con altitudes de render, la carga y la línea comparten la misma función", () => {
  const { display } = terrainFloorAltitudes(raw, raw.map(() => 127.2));
  const samples = trajectorySamples(flight, times, 5000, display);
  assert.equal(samples.filter((s) => s.real).length, 155);
  for (const t of [times[0] + 7000, times[3] + 31000, times[40] + 59000]) {
    const p = positionAtTime(flight, times, t, display);
    const q = positionAtTime(flight, times, t, null);
    assert.equal(p.lat, q.lat);
    assert.equal(p.lon, q.lon);
  }
  // en los instantes de las transmisiones devuelve exactamente la altitud de render
  flight.forEach((_, i) => assert.equal(positionAtTime(flight, times, times[i], display).altM, display[i]));
  // sin altitudes de render devuelve exactamente altitudeGpsM
  flight.forEach((tx, i) => assert.equal(positionAtTime(flight, times, times[i]).altM, tx.altitudeGpsM));
});

test("el dataset no se modifica", () => {
  const before = JSON.stringify(flight);
  terrainFloorAltitudes(raw, raw.map(() => 130));
  trajectorySamples(flight, times, 5000, raw.map((v) => v + 5));
  assert.equal(JSON.stringify(flight), before);
});
