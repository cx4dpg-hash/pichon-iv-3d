// Pruebas de la detección de fases: node --test tests/phases.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectAscentStart, splitPhases, ASCENT_CRITERIA } from "../js/phases.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = fs.readFileSync(path.join(root, "data/vuelo/transmissions.json"), "utf8");
const flight = JSON.parse(file).flight;

const synth = (gps, baro = gps) => gps.map((g, i) => ({ frameNumber: i + 1, altitudeGpsM: g, telemetry: { barometricAltitudeM: baro[i] } }));

test("datos reales: la liberación (ancla) es el frame 10 y el primer punto en el aire el 11", () => {
  const d = detectAscentStart(flight);
  assert.equal(flight[d.anchorIndex].frameNumber, 10);
  assert.equal(flight[d.firstAirborneIndex].frameNumber, 11);
  assert.equal(flight[d.anchorIndex].packetTimestampUtc, "2026-10-11T13:21:39Z");
  assert.ok(d.groundNoiseM < ASCENT_CRITERIA.minRisePerIntervalM / 2); // ruido en tierra << umbral
  assert.ok(d.intervals.every((i) => i.gpsRiseM >= 10 && i.baroRiseM >= 10));
});

test("partición: preLaunch = frames 3 a 9, vuelo efectivo = frames 10 a 157, nada se copia ni se pierde", () => {
  const before = JSON.stringify(flight);
  const { preLaunch, flight: eff } = splitPhases(flight);
  assert.deepEqual(preLaunch.map((t) => t.frameNumber), [3, 4, 5, 6, 7, 8, 9]);
  assert.equal(eff[0].frameNumber, 10);
  assert.equal(eff[eff.length - 1].frameNumber, 157);
  assert.equal(preLaunch.length + eff.length, 155);
  assert.ok(preLaunch.every((t, i) => t === flight[i]) && eff.every((t, i) => t === flight[7 + i])); // mismas referencias
  assert.equal(JSON.stringify(flight), before);
  assert.equal(file, fs.readFileSync(path.join(root, "data/vuelo/transmissions.json"), "utf8"));
});

test("el ruido del GPS en tierra no se toma como liberación", () => {
  // saltos de ±15 m aislados, sin tendencia
  const noisy = synth([120, 135, 121, 136, 120, 134, 121, 135, 120, 121, 120]);
  assert.equal(detectAscentStart(noisy), null);
});

test("una subida de pocos intervalos o con barómetro plano no es ascenso sostenido", () => {
  assert.equal(detectAscentStart(synth([100, 100, 150, 220, 300, 300, 300, 300])), null); // solo 3 intervalos
  const baroFlat = synth([100, 100, 150, 220, 300, 400, 500, 600], [100, 100, 100, 100, 100, 100, 100, 100]);
  assert.equal(detectAscentStart(baroFlat), null);
});

test("ascenso sostenido sintético: ancla = última muestra antes de la subida", () => {
  const d = detectAscentStart(synth([100, 101, 99, 100, 130, 200, 300, 420, 540, 650]));
  assert.equal(d.anchorIndex, 3);
  assert.equal(d.firstAirborneIndex, 4);
});
