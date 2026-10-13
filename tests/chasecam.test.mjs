// Cámara de Vista inmersiva: matemática pura de js/chasecam.js.
import test from "node:test";
import assert from "node:assert/strict";
import { motionDirection, viewTarget, stepChase, cameraOffsetENU, isTimeJump, wrapPi, CHASE } from "../js/chasecam.js";

const DEG = Math.PI / 180;
// Ascenso de 5 m/s hacia el este y 5 m/s vertical (lat 0: 1° lon ≈ 111195 m)
const posAt = (t) => ({ lat: 0, lon: (5 * t) / 1000 / 111194.9, altM: 100 + (5 * t) / 1000 });

test("dirección: este y 45° de pendiente", () => {
  const d = motionDirection(posAt, 10000, 60000, 2500);
  assert.ok(Math.abs(d.heading - Math.PI / 2) < 1e-3);
  assert.ok(Math.abs(d.pitch - 45 * DEG) < 1e-3);
  assert.ok(Math.abs(d.hSpeed - 5) < 0.01);
});

test("ventana recortada en los extremos (sin extrapolar)", () => {
  assert.ok(motionDirection(posAt, 0, 60000, 2500));
  assert.ok(motionDirection(posAt, 60000, 60000, 2500));
});

test("sin velocidad horizontal se conserva el rumbo anterior", () => {
  const t = viewTarget({ heading: 1, pitch: -1.2, hSpeed: 0.05 }, 0.3);
  assert.equal(t.heading, 0.3);
  assert.ok(t.pitch >= -CHASE.maxPitchDeg * DEG * CHASE.pitchGain - 1e-9);
});

test("la cámara queda detrás y por encima de la carga; la carga bajo el centro", () => {
  const fovy = 60 * DEG;
  const o = cameraOffsetENU(Math.PI / 2, 0, fovy); // mira al este
  assert.ok(o.e === -CHASE.backM && Math.abs(o.n) < 1e-9 && o.u > 0);
  // la carga cae a dropFraction del semicampo bajo el centro
  const ang = Math.atan2(o.u, CHASE.backM);
  assert.ok(Math.abs(Math.tan(ang) - Math.tan((CHASE.dropFraction * fovy) / 2)) < 1e-9);
});

test("suavizado: converge, no salta, rodea el 180°", () => {
  let s = stepChase(null, { heading: 3.0, pitch: 0.1 }, 0, 1, false);
  assert.equal(s.heading, 3.0);
  s = stepChase(s, { heading: -3.0, pitch: 0.1 }, 0.016, 1, false); // 0.28 rad por el camino corto
  assert.ok(Math.abs(wrapPi(s.heading - 3.0)) < 0.02);
  for (let i = 0; i < 600; i++) s = stepChase(s, { heading: -3.0, pitch: 0.1 }, 0.016, 1, false);
  assert.ok(Math.abs(wrapPi(s.heading + 3.0)) < 1e-3);
});

test("alabeo sutil: cero en giros pequeños, tope 5°", () => {
  let s = { heading: 0, pitch: 0, bank: 0 };
  for (let i = 0; i < 300; i++) s = stepChase(s, { heading: 2 * DEG, pitch: 0 }, 0.016, 1, false);
  assert.ok(Math.abs(s.bank) < 1e-6);
  s = { heading: 0, pitch: 0, bank: 0 };
  for (let i = 0; i < 5; i++) s = stepChase(s, { heading: 120 * DEG, pitch: 0 }, 0.016, 1, false);
  assert.ok(Math.abs(s.bank) <= CHASE.maxBankDeg * DEG + 1e-9);
});

test("snap: parte directo del objetivo, sin arrastre", () => {
  const s = stepChase({ heading: 0, pitch: 0, bank: 0.05 }, { heading: 2, pitch: 0.3 }, 0.016, 1, true);
  assert.deepEqual(s, { heading: 2, pitch: 0.3, bank: 0 });
});

test("a 64x la constante de tiempo es menor", () => {
  const a = stepChase({ heading: 0, pitch: 0, bank: 0 }, { heading: 1, pitch: 0 }, 0.016, 1, false);
  const b = stepChase({ heading: 0, pitch: 0, bank: 0 }, { heading: 1, pitch: 0 }, 0.016, 64, false);
  assert.ok(b.heading > a.heading * 4);
});

test("saltos del tiempo", () => {
  const base = { prevOffsetMs: 10000, dtRealMs: 16, playing: true, speed: 64 };
  assert.equal(isTimeJump({ ...base, offsetMs: 10000 + 16 * 64 }), false); // reproducción normal 64x
  assert.equal(isTimeJump({ ...base, offsetMs: 10000 + 60000 }), true); // scrub
  assert.equal(isTimeJump({ ...base, offsetMs: 5000 }), true); // retroceso
  assert.equal(isTimeJump({ ...base, playing: false, offsetMs: 10001 }), true); // pausa: scrub/Anterior
  assert.equal(isTimeJump({ ...base, offsetMs: 10000, playing: false }), false); // sin cambio
  assert.equal(isTimeJump({ ...base, prevOffsetMs: null, offsetMs: 0 }), true);
  assert.equal(isTimeJump({ ...base, dtRealMs: 2000, offsetMs: 10016 }), true); // pausa → play
});
