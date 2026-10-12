// Valida la estructura y la coherencia interna de data/clouds/cloud-model.json.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const model = JSON.parse(readFileSync(new URL("../data/clouds/cloud-model.json", import.meta.url), "utf8"));
const flight = JSON.parse(readFileSync(new URL("../data/vuelo/transmissions.json", import.meta.url), "utf8")).flight;

const STATUS = ["observed", "derived", "inferred", "unknown"];
const CONF = ["high", "medium", "low"];
const FIELDS = ["cloudCoverage", "cloudTypeProbable", "cloudBaseM", "cloudTopM", "cloudThicknessM", "cloudPhase"];

test("estados cada 30 min dentro del periodo del vuelo", () => {
  assert.equal(model.temporalResolution.stepMinutes, 30);
  assert.equal(model.states.length, 7);
  assert.equal(model.temporalResolution.nStates, model.states.length);
  const times = model.states.map((s) => Date.parse(s.timestampUtc));
  times.forEach((t, i) => i && assert.equal(t - times[i - 1], 30 * 60000));
  const first = Date.parse(flight.find((t) => t.frameNumber >= 10).packetTimestampUtc);
  const last = Date.parse(flight.at(-1).packetTimestampUtc);
  assert.ok(times[0] <= first + 60000 && times.at(-1) <= last);
  for (const s of model.states) {
    assert.match(s.timestampLocal, /-03:00$/);
    assert.equal(Date.parse(s.timestampLocal), Date.parse(s.timestampUtc));
  }
});

test("cada zona de cada estado trae todos los campos con method/status/confidence", () => {
  for (const s of model.states) {
    assert.equal(s.zones.length, model.zoning ? 2 : 0);
    for (const z of s.zones) {
      assert.ok(z.area && z.area.minLon < z.area.maxLon && z.area.minLat < z.area.maxLat);
      assert.ok(Array.isArray(z.sourceRefs) && z.sourceRefs.length > 0);
      assert.ok(CONF.includes(z.confidence));
      assert.ok(Array.isArray(z.notes));
      for (const f of FIELDS) {
        const v = z[f];
        assert.ok(v, `${s.id}/${z.zoneId}/${f}`);
        assert.ok(typeof v.method === "string" && v.method.length > 10, `${f} method`);
        assert.ok(STATUS.includes(v.status), `${f} status`);
        assert.ok(CONF.includes(v.confidence), `${f} confidence`);
        assert.ok("value" in v);
        if (v.status === "unknown") assert.equal(v.value, null);
      }
    }
  }
});

test("ninguna inferencia se presenta como medición y la base nunca es 'observed'", () => {
  for (const s of model.states) {
    for (const z of s.zones) {
      assert.notEqual(z.cloudBaseM.status, "observed"); // transferencia desde estaciones lejanas
      assert.notEqual(z.cloudTypeProbable.status, "observed");
      assert.equal(z.cloudTypeProbable.status === "inferred" || z.cloudTypeProbable.status === "unknown", true);
      assert.equal(z.cloudThicknessM.status === "inferred" || z.cloudThicknessM.status === "unknown", true);
    }
  }
});

test("coherencia numérica: cobertura 0-100, tope > base, espesor = tope − base", () => {
  for (const s of model.states) {
    for (const z of s.zones) {
      const cov = z.cloudCoverage.value;
      assert.ok(cov >= 0 && cov <= 100);
      const top = z.cloudTopM, base = z.cloudBaseM, th = z.cloudThicknessM;
      assert.ok(top.range[0] <= top.value && top.value <= top.range[1]);
      if (base.value !== null) {
        assert.ok(top.value > base.value, "el tope está por encima de la base");
        assert.equal(th.value, top.value - base.value);
        assert.ok(th.range[0] <= th.value && th.value <= th.range[1]);
      }
    }
  }
});

test("la zonificación cumple su propia regla y el area cubre solo la franja de la trayectoria", () => {
  assert.equal(model.zoning.ruleSatisfiedInAllStates, true);
  for (const v of Object.values(model.zoning.separationByStateM)) assert.ok(v > 150);
  const lons = flight.filter((t) => t.frameNumber >= 10).map((t) => t.position.lon);
  const lats = flight.filter((t) => t.frameNumber >= 10).map((t) => t.position.lat);
  const e = model.extent;
  assert.ok(Math.min(...lons) >= e.minLon && Math.max(...lons) <= e.maxLon);
  assert.ok(Math.min(...lats) >= e.minLat && Math.max(...lats) <= e.maxLat);
});

test("las referencias de fuente existen y lo no determinado está declarado", () => {
  const ids = new Set(model.sources.map((s) => s.id));
  for (const s of model.states) for (const z of s.zones) for (const r of z.sourceRefs) assert.ok(ids.has(r), `fuente ${r}`);
  assert.ok(model.undetermined.length >= 3);
});
