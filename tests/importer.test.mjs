// Pruebas del importador de logs (Node >= 18, sin dependencias): node --test tests/
//
// Los fixtures se construyen EXCLUSIVAMENTE a partir de paquetes reales del dataset maestro
// (test fixture derived from master APRS data). No son un log real de usuario. Si existe el
// log real de ejemplo en imports/source/, también se prueba (se omite si no está).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importLog, COORD_TOLERANCE_DEG } from "../js/importer/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const masterFile = JSON.parse(fs.readFileSync(path.join(root, "data/vuelo/transmissions.json"), "utf8"));
const master = {
  flight: masterFile.flight,
  postFlight: masterFile.postFlight,
  preFlight: masterFile.preFlight,
};
const CALLSIGN = "CX1AA-11";
const run = (text, opts = {}) => importLog(text, { master, targetCallsign: CALLSIGN, ...opts });
const byFrame = (group, frame) => master[group].find((t) => t.frameNumber === frame);
const raw = (tx, k = 0) => tx.receptions[k].rawPacket;
/** Prefijo estilo APRS.fi (con zona horaria indicada). */
const prefix = (tx) => `${tx.receptions[0].receivedAtLocal.replace("T", " ").slice(0, 19)} -03: `;

test("1. paquete exacto existente: una única transmisión, estado exact", async () => {
  const tx = byFrame("flight", 47);
  const r = await run(prefix(tx) + raw(tx));
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].status, "exact");
  assert.equal(r.results[0].match.id, tx.id);
  assert.equal(r.results[0].match.group, "flight");
  assert.equal(r.results[0].packet.externalTimezoneKnown, true);
  assert.equal(r.stats.flightReceived, 1);
});

test("2. misma transmisión repetida: duplicados no inflan la cobertura", async () => {
  const tx = byFrame("flight", 47);
  const direct = raw(tx).replace(",qAO," + tx.firstIgate, ""); // recepción directa por RF, sin path de APRS-IS
  const r = await run([raw(tx), prefix(tx) + raw(tx), direct].join("\n"));
  assert.equal(r.results.length, 3);
  assert.deepEqual(r.results.map((x) => x.match?.id), [tx.id, tx.id, tx.id]);
  assert.equal(r.stats.duplicateLines, 2);
  assert.equal(r.stats.flightReceived, 1);
  assert.equal(r.index.received.get(tx.id).count, 3);
  assert.equal(r.results[0].duplicateOfLine, null);
  assert.equal(r.results[1].duplicateOfLine, 1);
});

test("3. frameNumber correcto pero timestamp diferente: no hace match", async () => {
  const tx = byFrame("flight", 50);
  const bad = raw(tx).replace(/\/(\d{6})h/, (m, t) => `/${String(Number(t) + 1).padStart(6, "0")}h`);
  const r = await run(bad);
  assert.equal(r.results[0].status, "unmatched");
  assert.equal(r.results[0].match, null);
  assert.match(r.results[0].notes.join(" "), /difiere en packetTimestamp/);
});

test("4. frameNumber repetido de otra jornada: se distingue por hora/posición", async () => {
  const post = byFrame("postFlight", 77);
  const flightSame = byFrame("flight", 77);
  assert.ok(post && flightSame);
  const r = await run([raw(post), raw(flightSame)].join("\n"));
  assert.equal(r.results[0].match.group, "postFlight");
  assert.equal(r.results[1].match.group, "flight");
  assert.equal(r.stats.flightReceived, 1);
  assert.equal(r.stats.postFlightReceived, 1);
});

test("5. paquete sin frameNumber: probable (faltan campos), no exact", async () => {
  const tx = byFrame("flight", 60);
  const noFrame = raw(tx).replace(/;\d+;[GP];.*$/, ";PICHON-IV Radio Club Uruguayo");
  const r = await run(noFrame);
  assert.equal(r.results[0].packet.frameNumber, null);
  assert.equal(r.results[0].status, "probable");
  assert.equal(r.results[0].match.id, tx.id);
  assert.ok(r.results[0].missingFields.includes("frameNumber"));
});

test("6. posición sin timestamp externo: el timestamp externo no interviene", async () => {
  const tx = byFrame("flight", 60);
  const r = await run(raw(tx));
  assert.equal(r.results[0].packet.externalTimestamp, null);
  assert.equal(r.results[0].packet.externalTimezoneKnown, false);
  assert.equal(r.results[0].status, "exact");
  // un timestamp externo sin zona o incorrecto no cambia el resultado
  const r2 = await run(`2020-01-01 00:00:00 ${raw(tx)}`);
  assert.equal(r2.results[0].status, "exact");
  assert.equal(r2.results[0].packet.externalTimezoneKnown, false);
  assert.equal(r2.results[0].packet.externalTimestamp, "2020-01-01 00:00:00");
});

test("7. paquete desconocido: unmatched y visible", async () => {
  const tx = byFrame("flight", 70);
  const unknown = raw(tx).replace(/A=\d{6}/, "A=000123").replace(/\/\d{6}h/, "/010101h");
  const r = await run(unknown);
  assert.equal(r.results[0].status, "unmatched");
  assert.equal(r.stats.byStatus.unmatched, 1);
  assert.equal(r.stats.flightReceived, 0);
});

test("8. línea sin APRS: se ignora", async () => {
  const r = await run("hello world\n# comentario\n2026-10-11 10:00:00 nada de interés");
  assert.equal(r.results.length, 0);
  assert.equal(r.stats.ignoredLines, 3);
  assert.equal(r.stats.fileLines, 3);
});

test("9. archivo vacío: no rompe", async () => {
  for (const text of ["", "\n", "   \n\n"]) {
    const r = await run(text);
    assert.equal(r.results.length, 0);
    assert.equal(r.stats.flightReceived, 0);
    assert.equal(r.stats.coveragePercent, 0);
    assert.equal(r.stats.first, null);
  }
});

test("10. CRLF, LF y CR mezclados", async () => {
  const a = byFrame("flight", 10);
  const b = byFrame("flight", 11);
  const c = byFrame("flight", 12);
  const r = await run(`${raw(a)}\r\n${raw(b)}\n${raw(c)}\r${"ruido"}\r\n`);
  assert.equal(r.results.length, 3);
  assert.equal(r.stats.fileLines, 4);
  assert.deepEqual(r.results.map((x) => x.packet.lineNumber), [1, 2, 3]);
  assert.equal(r.stats.flightReceived, 3);
});

test("11. CX1AA-11 mezclado con otros indicativos", async () => {
  const tx = byFrame("flight", 80);
  const text = [
    "CX9ZZ-1>APRS,TCPIP*:!3445.00S/05600.00W>otra estación",
    "XCX1AA-11>APE002:/000000h0000.00N/00000.00EO000/000/A=000000;1;G",
    `${prefix(tx)}${raw(tx)}`,
    "digi>APRS,CX1AA-11*:>CX1AA-11 aparece en el path pero no como origen",
  ].join("\n");
  const r = await run(text);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].match.id, tx.id);
  assert.equal(r.stats.ignoredLines, 3);
});

test("frameNumber solo no basta (aunque haya una única transmisión con ese frame)", async () => {
  const tx = byFrame("flight", 50);
  assert.equal(master.flight.filter((t) => t.frameNumber === 50).length, 1);
  const r = await run("CX1AA-11>APE002,TELEM-1:;50;G;");
  assert.equal(r.results[0].status, "ambiguous");
  assert.equal(r.results[0].match, null);
  assert.equal(r.stats.flightReceived, 0);
  assert.match(r.results[0].notes.join(" "), /insuficiente/);
  assert.ok(tx);
});

test("ambiguous no se resuelve arbitrariamente (frame repetido en varias jornadas)", async () => {
  const r = await run("CX1AA-11>APE002,TELEM-1:;13;G;");
  const res = r.results[0];
  assert.equal(res.status, "ambiguous");
  assert.equal(res.match, null);
  assert.ok(res.candidates.length >= 2);
  assert.ok(res.candidates.some((c) => c.group === "flight") && res.candidates.some((c) => c.group === "postFlight"));
  assert.equal(r.stats.flightReceived, 0);
  assert.equal(r.index.ambiguous.size, res.candidates.length);
});

test("ambiguous: preFlight idéntico en dos jornadas sin telemetría completa", async () => {
  const text = "CX1AA-11>APE002,TELEM-1,qAO,CX3BP-8:/000000h0000.00N/00000.00EO000/000/A=000000;1;G";
  const r = await run(text);
  assert.equal(r.results[0].status, "ambiguous");
  assert.equal(r.results[0].candidates.length, 2);
  // con telemetría completa se desempata por payload (evidencia, no arbitrariedad)
  const full = raw(master.preFlight[0]);
  const r2 = await run(full);
  assert.equal(r2.results[0].status, "exact");
  assert.equal(r2.results[0].match.id, master.preFlight[0].id);
  assert.equal(r2.stats.flightReceived, 0);
  assert.equal(r2.stats.preFlightReceived, 1);
});

test("tolerancia de coordenadas: absorbe representación decimal, no une posiciones distintas", async () => {
  assert.equal(COORD_TOLERANCE_DEG, 1e-5);
  // CSV con lat/lon desplazadas 5e-6° (dentro de tolerancia) y 5e-4° (fuera)
  const tx = byFrame("flight", 90);
  const header = "chan,utime,isotime,source,heard,level,error,dti,name,symbol,latitude,longitude,speed,course,altitude,frequency,offset,tone,system,status,telemetry,comment";
  const row = (dLat) =>
    `0,0,2026-10-11T00:00:00Z,CX1AA-11,CX1AA-11,0,0,/,CX1AA-11,/O,${(tx.position.lat + dLat).toFixed(6)},${tx.position.lon.toFixed(6)},0,0,${tx.altitudeGpsM.toFixed(1)},,,,,,,;${tx.frameNumber};G;1;1;1;1;1;1;1;1;1;x`;
  const r = await run([header, row(5e-6), row(5e-4)].join("\r\n"));
  assert.equal(r.parsed.adapterId, "direwolf-csv");
  assert.equal(r.results[0].match?.id, tx.id);
  assert.equal(r.results[1].status, "unmatched");
});

test("el matching no modifica el dataset maestro", async () => {
  const before = JSON.stringify(master);
  await run(raw(byFrame("flight", 47)));
  assert.equal(JSON.stringify(master), before);
});

test("archivo grande: 60 000 líneas sin problemas", async () => {
  const tx = byFrame("flight", 100);
  const lines = [];
  for (let i = 0; i < 60000; i++) lines.push(i % 3 === 0 ? raw(tx) : `ruido ${i}`);
  const t0 = Date.now();
  const r = await run(lines.join("\n"));
  assert.equal(r.results.length, 20000);
  assert.equal(r.stats.duplicateLines, 19999);
  assert.equal(r.stats.flightReceived, 1);
  assert.ok(Date.now() - t0 < 10000);
});

test("estadísticas con estación fija: distancia horizontal máxima", async () => {
  const txs = [byFrame("flight", 20), byFrame("flight", 100), byFrame("flight", 138)];
  const r = await run(txs.map((t) => raw(t)).join("\n"), { stationPosition: { lat: -34.759333, lon: -55.684333 } });
  assert.equal(r.stats.flightReceived, 3);
  assert.ok(r.stats.maxDistance.km > 50 && r.stats.maxDistance.km < 200);
  assert.equal(r.stats.maxAltitude.frameNumber, 138);
  assert.equal(r.stats.highestFrame.frameNumber, 138);
  assert.equal(r.stats.first.frameNumber, 20);
  const noStation = await run(txs.map((t) => raw(t)).join("\n"));
  assert.equal(noStation.stats.maxDistance, null);
});

// El log real puede renombrarse: se busca en imports/source/ el primer .log en formato Dire Wolf CSV.
const sourceDir = path.join(root, "imports/source");
const realLog = fs.existsSync(sourceDir)
  ? fs
      .readdirSync(sourceDir)
      .filter((f) => f.toLowerCase().endsWith(".log"))
      .map((f) => path.join(sourceDir, f))
      .find((f) => fs.readFileSync(f, "utf8").startsWith("chan,utime,isotime,source"))
  : undefined;
test("log real (Dire Wolf CSV) del usuario, si está disponible", { skip: !realLog }, async () => {
  const r = await run(fs.readFileSync(realLog, "utf8"));
  assert.equal(r.parsed.adapterId, "direwolf-csv");
  assert.equal(r.stats.packetLines, 140);
  assert.equal(r.stats.byStatus.unmatched, 0);
  assert.equal(r.stats.byStatus.ambiguous, 0);
  // sin hora APRS interna en este formato nunca puede ser "exact"
  assert.equal(r.stats.byStatus.exact, 0);
  assert.equal(r.stats.byStatus.probable, 140);
  assert.equal(r.stats.flightReceived, 140);
  assert.equal(r.stats.duplicateLines, 0);
  assert.equal(r.stats.first.frameNumber, 13);
  assert.equal(r.stats.last.frameNumber, 153);
});
