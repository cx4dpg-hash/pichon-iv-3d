// Pruebas de los datos derivados: node --test tests/derived.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verticalSpeedsMs } from "../js/derived.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const flight = JSON.parse(fs.readFileSync(path.join(root, "data/vuelo/transmissions.json"), "utf8")).flight;
const times = flight.map((tx) => Date.parse(tx.packetTimestampUtc));

test("velocidad vertical derivada: primera transmisión sin muestra anterior", () => {
  const v = verticalSpeedsMs(flight, times);
  assert.equal(v.length, 155);
  assert.equal(v[0], null);
  assert.equal(v.filter((x) => x === null).length, 1);
});

test("velocidad vertical derivada: fórmula con altitudeGpsM y packetTimestampUtc", () => {
  const v = verticalSpeedsMs(flight, times);
  const i = flight.findIndex((tx) => tx.frameNumber === 139);
  const expected = (flight[i].altitudeGpsM - flight[i - 1].altitudeGpsM) / ((times[i] - times[i - 1]) / 1000);
  assert.equal(v[i], expected);
  assert.ok(Math.abs(v[i] - -28.158) < 0.001); // (23853.04 − 25542.54) / 60 s
  assert.ok(v[flight.findIndex((tx) => tx.frameNumber === 100)] > 0); // ascenso
});

test("velocidad vertical derivada: intervalos de 120 s promedian la tasa", () => {
  const v = verticalSpeedsMs(flight, times);
  const i = flight.findIndex((tx) => tx.frameNumber === 20); // 19 → 20: 121 s
  assert.equal((times[i] - times[i - 1]) / 1000, 121);
  assert.ok(Math.abs(v[i] - (flight[i].altitudeGpsM - flight[i - 1].altitudeGpsM) / 121) < 1e-9);
});

test("sin tiempos válidos no inventa valores", () => {
  const v = verticalSpeedsMs(flight.slice(0, 3), [0, 0, 60000]);
  assert.deepEqual(v.map((x) => x === null), [true, true, false]);
});
