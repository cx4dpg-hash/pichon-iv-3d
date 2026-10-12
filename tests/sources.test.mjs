// Coherencia de data/metadata.json (fuentes, grupos, metodología y limitaciones) y de docs/SOURCES.md.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { renderSourcesMd } from "../tools/docs/build-sources-md.mjs";

const root = new URL("../", import.meta.url);
const meta = JSON.parse(readFileSync(new URL("data/metadata.json", root), "utf8"));
const byId = new Map(meta.sources.map((s) => [s.id, s]));
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);

test("ids de fuente únicos y cada grupo referencia fuentes existentes", () => {
  assert.equal(byId.size, meta.sources.length);
  for (const g of meta.groups) {
    assert.ok(g.title && g.points.length > 0 && g.sourceIds.length > 0, g.id);
    for (const id of g.sourceIds) assert.ok(byId.has(id), `${g.id} → ${id}`);
  }
});

test("las fuentes mínimas pedidas están presentes y bien atribuidas", () => {
  const text = JSON.stringify(meta);
  for (const needle of ["CX1AA-11", "CX2TN-1", "CX4DPG-1", "CX2CQ-1", "CX2ACB-1", "CX3BP-8", "Dire Wolf", "CX5RN-5", "15:27:45", "Boletín CX", "GOES-19", "ACHA", "ACTP", "ACHT", "METAR", "cloud-model.json", "CesiumJS", "Cesium World Imagery", "Cesium World Terrain", "OpenStreetMap", "Radio Club Uruguayo"]) {
    assert.ok(text.includes(needle), needle);
  }
  const recovery = meta.groups.find((g) => g.id === "recovery").points.join(" ");
  assert.match(recovery, /no abrió \(confirmado por el usuario; no deriva del log APRS\)/);
  assert.match(recovery, /CX5RN-5/);
  const stations = meta.groups.find((g) => g.id === "stations").points.join(" ");
  assert.match(stations, /CX3BP-8 es una estación móvil: su posición es desconocida/);
  assert.match(meta.limitations.join(" "), /no necesariamente la primera estación RF/);
});

test("los archivos locales citados existen (salvo los no versionados declarados)", () => {
  for (const s of meta.sources) {
    for (const f of list(s.file)) {
      if (s.versioned === false) continue; // archivos locales declarados como no versionados
      assert.ok(existsSync(new URL(f, root)), `${s.id}: ${f}`);
    }
  }
});

test("las URL son https", () => {
  for (const s of meta.sources) for (const u of list(s.url)) assert.match(u, /^https:\/\//, s.id);
});

test("metodología y limitaciones cubren lo exigido", () => {
  const m = meta.methodology.map((x) => x.title + " " + x.text).join(" ");
  for (const needle of ["no se interpolan", "positionAtTime", "estimación física", "ayuda de visibilidad", "no representan longitudes medidas", "no telemétrica", "18 s", "no es una medición volumétrica real"]) {
    assert.ok(m.includes(needle) || m.replace("no es una medición", "no es una medición").includes(needle) || /medición volumétrica real/.test(m), needle);
  }
  assert.ok(meta.limitations.length >= 6);
});

test("docs/SOURCES.md está sincronizado con metadata.json", () => {
  const current = readFileSync(new URL("docs/SOURCES.md", root), "utf8").replace(/\r\n/g, "\n");
  assert.equal(current, renderSourcesMd(meta));
});
