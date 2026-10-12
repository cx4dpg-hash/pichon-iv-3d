// Campo de nubes 3D: geometría pura (sin Cesium ni DOM) derivada de data/clouds/cloud-model.json.
//
// El modelo meteorológico da, por zona (Z1 centro-oeste, Z2 este) y cada 30 min, cobertura, base
// (techo METAR), tope (ACHA) y su dispersión. Aquí solo se traduce eso a elementos nubosos de una
// capa ESTRATIFORME BAJA (stratus/stratocumulus probable): muchos elementos anchos y poco altos,
// solapados, con variación natural entre ellos. NO se inventa viento ni forma interna fuera de lo
// que sustentan los datos. Es una reconstrucción aproximada, no una observación.

export const FIELD = {
  minLon: -55.52,
  maxLon: -53.82,
  minLat: -34.5,
  maxLat: -34.06,
  spacingLonDeg: 0.07, // ≈ 6.4 km
  spacingLatDeg: 0.06, // ≈ 6.6 km
  jitterFraction: 0.35, // desplazamiento aleatorio máximo (fracción del paso)
  transitionLon: -54.2, // borde entre zonas (cloud-model.json → zoning)
  transitionHalfWidthDeg: 0.15, // transición suave de ≈ 27 km
  topVariationFraction: 0.25, // variación del tope entre elementos = ±25 % de (p90−p10), limitada
  topVariationMaxM: 200,
  baseVariationFraction: 0.12, // variación de la base entre elementos = ±12 % del espesor
  edgeFadeDeg: 0.15, // los bordes del campo se deshilachan (la nube modelada no termina en recta)
  seed: 20261011,
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (x) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};

/** Peso de la zona Este (0 = centro-oeste, 1 = este) a una longitud, con transición suave. */
export function eastWeight(lon, field = FIELD) {
  return smoothstep((lon - (field.transitionLon - field.transitionHalfWidthDeg)) / (2 * field.transitionHalfWidthDeg));
}

/** Elementos del campo: posiciones, tamaños relativos y valores aleatorios fijos (deterministas). */
export function buildField(field = FIELD) {
  const rand = mulberry32(field.seed);
  const elements = [];
  for (let lat = field.minLat; lat <= field.maxLat + 1e-9; lat += field.spacingLatDeg) {
    for (let lon = field.minLon; lon <= field.maxLon + 1e-9; lon += field.spacingLonDeg) {
      const jl = (rand() * 2 - 1) * field.jitterFraction * field.spacingLonDeg;
      const ja = (rand() * 2 - 1) * field.jitterFraction * field.spacingLatDeg;
      elements.push({
        lon: lon + jl,
        lat: lat + ja,
        rank: rand(), // para la cobertura: visible si rank < cobertura
        widthK: 0.85 + rand() * 0.45, // factor de ancho
        depthK: 0.85 + rand() * 0.45,
        topU: rand() * 2 - 1,
        baseU: rand() * 2 - 1,
      });
    }
  }
  return elements;
}

/** Estados del modelo → arreglo ordenado { ms, zones: { [prefijo]: {...} } } (Z1, Z2). */
export function parseModel(model) {
  return model.states
    .map((s) => {
      const zones = {};
      for (const z of s.zones) {
        zones[z.zoneId.slice(0, 2)] = {
          coverage: z.cloudCoverage.value / 100,
          base: z.cloudBaseM.value,
          top: z.cloudTopM.value,
          topP10: z.cloudTopM.range[0],
          topP90: z.cloudTopM.range[1],
        };
      }
      return { ms: Date.parse(s.timestampUtc), zones };
    })
    .sort((a, b) => a.ms - b.ms);
}

const lerp = (a, b, f) => a + (b - a) * f;

/**
 * Parámetros de cada zona en el instante `ms`, interpolados LINEALMENTE entre los dos estados
 * vecinos (fuera del periodo del modelo se mantiene el estado extremo). No se inventa nada entre
 * estados: es una transición gradual visual entre dos reconstrucciones.
 */
export function paramsAtTime(states, ms) {
  let hi = states.findIndex((s) => s.ms >= ms);
  if (hi === -1) hi = states.length - 1;
  const lo = Math.max(hi - 1, 0);
  const a = states[lo], b = states[hi];
  const f = a.ms === b.ms ? 0 : Math.min(Math.max((ms - a.ms) / (b.ms - a.ms), 0), 1);
  const out = {};
  for (const key of Object.keys(a.zones)) {
    const za = a.zones[key], zb = b.zones[key];
    out[key] = Object.fromEntries(Object.keys(za).map((k) => [k, lerp(za[k], zb[k], f)]));
  }
  return out;
}

/** Factor 0–1 de presencia cerca del borde del campo (1 en el interior). */
export function edgeFactor(el, field = FIELD) {
  const d = Math.min(el.lon - field.minLon, field.maxLon - el.lon, (el.lat - field.minLat) * 1.2, (field.maxLat - el.lat) * 1.2);
  return smoothstep(d / field.edgeFadeDeg + 0.3);
}

/** Geometría de un elemento en el instante dado: altura de centro, tamaños y visibilidad. */
export function elementGeometry(el, params, field = FIELD) {
  const w = eastWeight(el.lon, field);
  const z1 = params.Z1, z2 = params.Z2;
  const mix = (k) => lerp(z1[k], z2[k], w);
  const baseMean = mix("base");
  const topMean = mix("top");
  const thickness = Math.max(topMean - baseMean, 150);
  const topSpread = Math.min(field.topVariationFraction * (mix("topP90") - mix("topP10")), field.topVariationMaxM);
  const top = topMean + el.topU * topSpread;
  const base = baseMean + el.baseU * field.baseVariationFraction * thickness;
  const height = Math.max(top - base, 120);
  return {
    baseM: base,
    topM: base + height,
    thicknessM: height,
    centerAltM: base + height / 2,
    visible: el.rank < mix("coverage") * edgeFactor(el, field),
  };
}

/** Cobertura de huella: fracción de una malla de puntos cubierta por la huella (elipses) de los elementos visibles. */
export function footprintCoverage(elements, params, footprintKm, field = FIELD, samples = 4000) {
  const rand = mulberry32(7);
  const kmLon = 111.32 * Math.cos((-34.28 * Math.PI) / 180);
  const kmLat = 110.57;
  const vis = elements.filter((e) => elementGeometry(e, params, field).visible);
  let covered = 0;
  for (let n = 0; n < samples; n++) {
    const lon = field.minLon + 0.3 + rand() * (field.maxLon - field.minLon - 0.6);
    const lat = field.minLat + 0.1 + rand() * (field.maxLat - field.minLat - 0.2);
    const hit = vis.some((e) => {
      const dx = ((e.lon - lon) * kmLon) / (0.5 * footprintKm * e.widthK);
      const dy = ((e.lat - lat) * kmLat) / (0.5 * footprintKm * e.depthK);
      return dx * dx + dy * dy <= 1;
    });
    if (hit) covered++;
  }
  return covered / samples;
}
