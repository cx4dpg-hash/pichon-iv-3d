// visualPosition memoizada por instante: mismo resultado que el cálculo directo y se invalida
// al cambiar el instante, las altitudes de render o la fase final.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Playback, visualPosition, positionAtTime, finalPosition } from "../js/playback.js";

const tx = JSON.parse(readFileSync(new URL("../data/vuelo/transmissions.json", import.meta.url), "utf8"));
const rec = JSON.parse(readFileSync(new URL("../data/vuelo/recovery.json", import.meta.url), "utf8"));
const flight = tx.flight.filter((t) => t.frameNumber >= 10);
const times = flight.map((t) => Date.parse(t.packetTimestampUtc));
const make = () => {
  const p = new Playback(times);
  p.setFinalPhase({ lat: rec.rescuePoint.lat, lon: rec.rescuePoint.lon, groundM: 50, offsetM: 0 });
  return p;
};
const direct = (p) =>
  p.finalFraction > 0 && p.final
    ? finalPosition(flight, p, p.finalFraction)
    : positionAtTime(flight, p.times, p.absoluteMs, p.displayAltM);

test("devuelve el mismo objeto dentro de un instante y el valor exacto del cálculo directo", () => {
  const p = make();
  for (const frac of [0, 0.137, 0.5, 0.9999, 1, 1.02, 1.5, 1.99, 2]) {
    p.seek(frac < 1.0001 ? p.duration * frac : p.duration + (frac - 1) * p.finalMs);
    const a = visualPosition(flight, p);
    assert.equal(visualPosition(flight, p), a);
    assert.deepEqual(a, direct(p));
  }
});

test("se invalida al cambiar el instante, las altitudes de render o la fase final", () => {
  const p = make();
  p.seek(1_000_000);
  const a = visualPosition(flight, p);
  p.seek(1_000_500);
  assert.notEqual(visualPosition(flight, p), a);
  assert.deepEqual(visualPosition(flight, p), direct(p));

  const before = visualPosition(flight, p);
  p.displayAltM = flight.map((t) => t.altitudeGpsM + 25);
  const shifted = visualPosition(flight, p);
  assert.notEqual(shifted, before);
  assert.ok(Math.abs(shifted.altM - before.altM - 25) < 1e-6);

  p.seek(p.duration + 4000);
  const mid = visualPosition(flight, p);
  p.setFinalPhase({ lat: rec.rescuePoint.lat, lon: rec.rescuePoint.lon, groundM: 80, offsetM: 0 });
  const moved = visualPosition(flight, p);
  assert.notEqual(moved, mid);
  assert.deepEqual(moved, direct(p));
});
