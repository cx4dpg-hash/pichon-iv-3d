// Fase visual final no telemétrica: de la última transmisión (frame 157) al punto de recuperación.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Playback, FINAL_PHASE_MS, visualPosition, positionAtTime } from "../js/playback.js";

const tx = JSON.parse(readFileSync(new URL("../data/vuelo/transmissions.json", import.meta.url), "utf8"));
const rec = JSON.parse(readFileSync(new URL("../data/vuelo/recovery.json", import.meta.url), "utf8"));
const flight = tx.flight.filter((t) => t.frameNumber >= 10);
const times = flight.map((t) => Date.parse(t.packetTimestampUtc));
const make = (ground = 123.4) => {
  const p = new Playback(times);
  p.setFinalPhase({ lat: rec.rescuePoint.lat, lon: rec.rescuePoint.lon, groundM: ground, offsetM: 1 });
  return p;
};

test("el frame 157 sigue siendo la última telemetría y el reloj real no se mueve en la fase final", () => {
  assert.equal(flight.at(-1).frameNumber, 157);
  const p = make();
  p.seek(p.duration + 5000);
  assert.equal(p.absoluteMs, times.at(-1));
  assert.equal(p.index, flight.length - 1);
  assert.equal(p.fraction, 0);
  assert.ok(p.inFinalPhase);
  assert.equal(p.totalDuration, p.duration + FINAL_PHASE_MS);
});

test("en el último instante telemétrico la carga está exactamente en el frame 157", () => {
  const p = make();
  p.seek(p.duration);
  assert.equal(p.finalFraction, 0);
  const v = visualPosition(flight, p);
  assert.equal(v.lat, flight.at(-1).position.lat);
  assert.equal(v.lon, flight.at(-1).position.lon);
});

test("la fase final recorre la recta hasta el punto de recuperación y termina sobre el terreno", () => {
  const p = make(123.4);
  const a = positionAtTime(flight, times, times.at(-1), null);
  let prevAlt = Infinity;
  for (let f = 0.1; f < 1; f += 0.1) {
    p.seek(p.duration + f * FINAL_PHASE_MS);
    const v = visualPosition(flight, p);
    // colineal con start→end (misma recta que la línea violeta)
    const u = (v.lat - a.lat) / (rec.rescuePoint.lat - a.lat);
    assert.ok(Math.abs(u - f) < 1e-9);
    assert.ok(Math.abs((v.lon - a.lon) / (rec.rescuePoint.lon - a.lon) - f) < 1e-9);
    assert.ok(v.altM < prevAlt, "desciende");
    prevAlt = v.altM;
  }
  p.seek(p.totalDuration);
  const end = visualPosition(flight, p);
  assert.equal(end.lat, rec.rescuePoint.lat);
  assert.equal(end.lon, rec.rescuePoint.lon);
  assert.equal(end.altM, 124.4); // terreno + 1 m de apoyo visual; sin altitud GPS inventada
});

test("la fase final respeta la velocidad: 18 s / velocidad", async () => {
  const real = { raf: global.requestAnimationFrame, now: performance.now };
  for (const speed of [1, 2, 4, 8, 16, 32, 64]) {
    const p = make();
    p.setSpeed(speed);
    p.seek(p.duration); // ya en el frame 157
    let t = 0, steps = 0;
    global.requestAnimationFrame = (cb) => { setImmediate(() => { steps++; cb((t += 10)); }); return 1; };
    performance.now = () => 0;
    p.play();
    await new Promise((r) => { const iv = setInterval(() => { if (!p.playing) { clearInterval(iv); r(); } }, 5); });
    // pasos de 10 ms de reloj simulado: tiempo de pared simulado = t; debe ser ≈ 18 000 / velocidad
    const expected = FINAL_PHASE_MS / speed;
    assert.ok(Math.abs(t - expected) <= 10 + 1e-9, `x${speed}: ${t} ms vs ${expected}`);
    assert.equal(p.offset, p.totalDuration);
  }
  global.requestAnimationFrame = real.raf;
  performance.now = real.now;
});

test("al cruzar el final de la telemetría la reproducción se detiene un fotograma en el frame 157", async () => {
  const p = make();
  p.setSpeed(8);
  p.seek(p.duration - 100);
  let t = 0;
  let n = 0;
  global.requestAnimationFrame = (cb) => { if (n++ < 1) setImmediate(() => cb((t += 50))); return 1; }; // un solo fotograma
  performance.now = () => 0;
  p.play();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(p.offset, p.duration);
  global.cancelAnimationFrame = () => {};
  p.pause();
});

test("recovery.json no cambia el punto de recuperación y transmissions.json no tiene tramas extra", () => {
  assert.equal(rec.rescuePoint.lat, -34.3286667);
  assert.equal(rec.rescuePoint.lon, -53.9865);
  assert.equal(tx.flight.length, 155);
  assert.equal(tx.meta.counts.flight, 155);
  assert.equal(rec.parachute.opened, false);
  assert.match(rec.parachute.text, /no abrió \(confirmado\)/);
});
