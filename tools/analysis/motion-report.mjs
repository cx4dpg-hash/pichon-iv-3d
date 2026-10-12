// Informe del movimiento de la carga: velocidades derivadas por intervalo, comparación con la
// velocidad/curso transmitidos y comparación de la interpolación lineal anterior con la PCHIP.
// Uso: node tools/analysis/motion-report.mjs [--json]
// Solo lee data/vuelo/transmissions.json; no modifica nada.
import { readFileSync } from "node:fs";
import { positionAtTime, positionAtTimeLinear } from "../../js/playback.js";

const tx = JSON.parse(readFileSync(new URL("../../data/vuelo/transmissions.json", import.meta.url), "utf8"));
const flight = tx.flight.filter((t) => t.frameNumber >= 10); // vuelo efectivo (frames 10–157)
const times = flight.map((t) => Date.parse(t.packetTimestampUtc));

const R = 6371008.8;
const rad = Math.PI / 180;
function horizM(a, b) {
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// ---- 1) por intervalo ----
const rows = [];
for (let i = 0; i < flight.length - 1; i++) {
  const a = flight[i], b = flight[i + 1];
  const dt = (times[i + 1] - times[i]) / 1000;
  const d = horizM(a.position, b.position);
  const dz = b.altitudeGpsM - a.altitudeGpsM;
  rows.push({
    from: a.frameNumber, to: b.frameNumber, dt, horizM: d, dAltM: dz,
    vHorizKmh: (d / dt) * 3.6, vVertMs: dz / dt, v3dKmh: (Math.hypot(d, dz) / dt) * 3.6,
    bearingDeg: bearing(a.position, b.position),
    txSpeedKmh: (a.speedKmh + b.speedKmh) / 2, txCourseDeg: a.courseDeg,
    dSpeedKmh: (d / dt) * 3.6 - (a.speedKmh + b.speedKmh) / 2,
    dCourseDeg: angDiff(bearing(a.position, b.position), a.courseDeg),
  });
}

// ---- 2) continuidad de velocidad en cada transmisión interior (derivada numérica ±1 s) ----
function speedAt(fn, ms) {
  const e = 500;
  const p = fn(ms - e), q = fn(ms + e);
  const east = horizM({ lat: p.lat, lon: p.lon }, { lat: p.lat, lon: q.lon }) * Math.sign(q.lon - p.lon);
  const north = horizM({ lat: p.lat, lon: p.lon }, { lat: q.lat, lon: p.lon }) * Math.sign(q.lat - p.lat);
  return { east: east / 1, north: north / 1, up: (q.altM - p.altM) / 1 };
}
const jumps = (fn) => {
  let max = { v: 0, frame: null };
  let sum = 0;
  for (let i = 1; i < flight.length - 1; i++) {
    const t = times[i];
    const before = speedAt(fn, t - 1000), after = speedAt(fn, t + 1000);
    const j = Math.hypot(after.east - before.east, after.north - before.north, after.up - before.up);
    sum += j;
    if (j > max.v) max = { v: j, frame: flight[i].frameNumber };
  }
  return { maxJumpMs: max.v, atFrame: max.frame, meanJumpMs: sum / (flight.length - 2) };
};
const linear = (ms) => positionAtTimeLinear(flight, times, ms);
const pchip = (ms) => positionAtTime(flight, times, ms);

// ---- 3) fidelidad, sobreimpulso y desviación espacial respecto de la cuerda ----
let maxNodeErrM = 0, maxOvershootM = 0, maxChordDevM = 0, maxChordDevFrame = null, maxSpeedPchip = 0, maxSpeedLinear = 0;
for (let i = 0; i < flight.length; i++) {
  const p = pchip(times[i]);
  maxNodeErrM = Math.max(maxNodeErrM, horizM(p, flight[i].position), Math.abs(p.altM - flight[i].altitudeGpsM));
}
for (let i = 0; i < flight.length - 1; i++) {
  const a = flight[i], b = flight[i + 1];
  const loLat = Math.min(a.position.lat, b.position.lat), hiLat = Math.max(a.position.lat, b.position.lat);
  const loLon = Math.min(a.position.lon, b.position.lon), hiLon = Math.max(a.position.lon, b.position.lon);
  const loAlt = Math.min(a.altitudeGpsM, b.altitudeGpsM), hiAlt = Math.max(a.altitudeGpsM, b.altitudeGpsM);
  const cosLat = Math.cos(a.position.lat * rad);
  for (let k = 1; k < 200; k++) {
    const ms = times[i] + ((times[i + 1] - times[i]) * k) / 200;
    const p = pchip(ms);
    maxOvershootM = Math.max(maxOvershootM, (loLat - p.lat) * rad * R, (p.lat - hiLat) * rad * R, (loLon - p.lon) * rad * R * cosLat, (p.lon - hiLon) * rad * R * cosLat, loAlt - p.altM, p.altM - hiAlt);
    // distancia horizontal de p a la cuerda a→b (plano local)
    const ax = 0, ay = 0, bx = (b.position.lon - a.position.lon) * rad * R * cosLat, by = (b.position.lat - a.position.lat) * rad * R;
    const px = (p.lon - a.position.lon) * rad * R * cosLat, py = (p.lat - a.position.lat) * rad * R;
    const len2 = bx * bx + by * by;
    const u = len2 ? Math.min(Math.max((px * bx + py * by) / len2, 0), 1) : 0;
    const dev = Math.hypot(px - u * bx, py - u * by);
    if (dev > maxChordDevM) { maxChordDevM = dev; maxChordDevFrame = a.frameNumber; }
  }
}
for (let ms = times[0] + 500; ms < times.at(-1); ms += 1000) {
  const sp = (fn) => { const s = speedAt(fn, ms); return Math.hypot(s.east, s.north, s.up); };
  maxSpeedPchip = Math.max(maxSpeedPchip, sp(pchip));
  maxSpeedLinear = Math.max(maxSpeedLinear, sp(linear));
}

const top = (key, n = 5) => [...rows].sort((a, b) => Math.abs(b[key]) - Math.abs(a[key])).slice(0, n);
const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? +v.toFixed(2) : v]));
const stats = (key) => { const v = rows.map((r) => r[key]); return { min: +Math.min(...v).toFixed(2), max: +Math.max(...v).toFixed(2), mean: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) }; };

const report = {
  intervals: rows.length,
  dtSeconds: stats("dt"), vHorizKmh: stats("vHorizKmh"), vVertMs: stats("vVertMs"), v3dKmh: stats("v3dKmh"),
  derivedMinusTransmittedSpeedKmh: stats("dSpeedKmh"),
  courseDiffDeg: { ...stats("dCourseDeg"), over30deg: rows.filter((r) => r.dCourseDeg > 30).length },
  largestSpeedDifferences: top("dSpeedKmh").map(round),
  largestCourseDifferences: top("dCourseDeg").map(round),
  largestVerticalSpeedChanges: [...rows.slice(1).map((r, i) => ({ frame: r.from, dvVertMs: r.vVertMs - rows[i].vVertMs }))].sort((a, b) => Math.abs(b.dvVertMs) - Math.abs(a.dvVertMs)).slice(0, 5).map(round),
  velocityContinuityAtTransmissions: { linear: jumps(linear), pchip: jumps(pchip) },
  maxSpeed3dMs: { linear: +maxSpeedLinear.toFixed(1), pchip: +maxSpeedPchip.toFixed(1) },
  fidelity: { maxErrorAtRealTransmissionsM: maxNodeErrM, maxOvershootBeyondIntervalM: +maxOvershootM.toExponential(2), maxHorizontalDeviationFromChordM: +maxChordDevM.toFixed(2), atFrame: maxChordDevFrame },
};
if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else console.log(JSON.stringify(report, null, 1));
export { report };
