// Interpolación visual de la carga (PCHIP): fidelidad, sin sobreimpulso, velocidad continua.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { positionAtTime, positionAtTimeLinear, trajectorySamples } from "../js/playback.js";

const tx = JSON.parse(readFileSync(new URL("../data/vuelo/transmissions.json", import.meta.url), "utf8"));
const flight = tx.flight.filter((t) => t.frameNumber >= 10);
const times = flight.map((t) => Date.parse(t.packetTimestampUtc));

test("coincide exactamente con cada transmisión real", () => {
  flight.forEach((t, i) => {
    const p = positionAtTime(flight, times, times[i]);
    assert.equal(p.lat, t.position.lat);
    assert.equal(p.lon, t.position.lon);
    assert.equal(p.altM, t.altitudeGpsM);
  });
});

test("con altitudes de render usa esas altitudes en los nodos", () => {
  const alts = flight.map((t, i) => t.altitudeGpsM + (i === 0 ? 9.65 : 0));
  assert.equal(positionAtTime(flight, times, times[0], alts).altM, alts[0]);
  assert.equal(positionAtTime(flight, times, times[5], alts).altM, alts[5]);
});

test("sin sobreimpulso: cada coordenada queda entre las de las dos transmisiones del intervalo", () => {
  for (let i = 0; i < flight.length - 1; i++) {
    const a = flight[i], b = flight[i + 1];
    for (let k = 1; k < 40; k++) {
      const p = positionAtTime(flight, times, times[i] + ((times[i + 1] - times[i]) * k) / 40);
      const within = (v, x, y) => v >= Math.min(x, y) - 1e-9 && v <= Math.max(x, y) + 1e-9;
      assert.ok(within(p.lat, a.position.lat, b.position.lat), `lat ${i}`);
      assert.ok(within(p.lon, a.position.lon, b.position.lon), `lon ${i}`);
      assert.ok(within(p.altM, a.altitudeGpsM, b.altitudeGpsM), `alt ${i}`);
    }
  }
});

test("la velocidad es continua en cada transmisión (mucho mejor que la lineal)", () => {
  const rate = (fn, ms) => {
    const p = fn(ms - 200), q = fn(ms + 200);
    return Math.hypot((q.lat - p.lat) * 111000, (q.lon - p.lon) * 111000 * 0.82, q.altM - p.altM) / 0.4;
  };
  let worstP = 0, worstL = 0;
  for (let i = 1; i < flight.length - 1; i++) {
    const t = times[i];
    const jump = (fn) => Math.abs(rate(fn, t + 1000) - rate(fn, t - 1000));
    worstP = Math.max(worstP, jump((ms) => positionAtTime(flight, times, ms)));
    worstL = Math.max(worstL, jump((ms) => positionAtTimeLinear(flight, times, ms)));
  }
  assert.ok(worstP < worstL / 5, `pchip ${worstP} vs lineal ${worstL}`);
});

test("la velocidad dentro de un intervalo no es constante (acelera y frena) pero no hay saltos", () => {
  // intervalo 145→146 (descenso rápido): se mide la rapidez cada 5 s
  const i = flight.findIndex((t) => t.frameNumber === 145);
  const speeds = [];
  for (let s = 2; s < 58; s += 2) {
    const ms = times[i] + s * 1000;
    const p = positionAtTime(flight, times, ms - 500), q = positionAtTime(flight, times, ms + 500);
    speeds.push(Math.hypot((q.lat - p.lat) * 111000, (q.lon - p.lon) * 111000 * 0.82));
  }
  assert.ok(Math.max(...speeds) - Math.min(...speeds) > 0.05);
  for (let k = 1; k < speeds.length; k++) assert.ok(Math.abs(speeds[k] - speeds[k - 1]) < 8, "sin saltos bruscos");
});

test("fuera de rango devuelve el primer y el último punto", () => {
  assert.equal(positionAtTime(flight, times, times[0] - 5000).lat, flight[0].position.lat);
  assert.equal(positionAtTime(flight, times, times.at(-1) + 5000).lon, flight.at(-1).position.lon);
});

test("trayectoria: conserva las transmisiones reales y los puntos intermedios salen de positionAtTime", () => {
  const s = trajectorySamples(flight, times, 2000);
  assert.equal(s.filter((x) => x.real).length, flight.length);
  let t = times[0];
  let n = 0;
  for (let i = 0; i < flight.length - 1; i++) {
    for (let ms = times[i] + 2000; ms < times[i + 1]; ms += 2000) {
      const p = positionAtTime(flight, times, ms);
      const sample = s.filter((x) => !x.real)[n++];
      assert.equal(sample.lat, p.lat);
      assert.equal(sample.altM, p.altM);
    }
    t = times[i + 1];
  }
  assert.ok(n > 1000 && t === times.at(-1));
});

test("datos que no se alteran: la interpolación no modifica transmisiones", () => {
  const before = JSON.stringify(flight);
  positionAtTime(flight, times, times[10] + 12345);
  assert.equal(JSON.stringify(flight), before);
});
