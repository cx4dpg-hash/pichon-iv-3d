// Estadísticas de cobertura de un log importado. Una transmisión recibida varias veces cuenta
// una sola vez. Solo cuentan como recibidas las coincidencias exact y probable (nunca ambiguous).

const EARTH_RADIUS_KM = 6371.0088; // radio medio; haversine => error de ~0.3 % respecto del elipsoide

/** Distancia horizontal (sobre la superficie) entre dos puntos, en km. No incluye altitud. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** Clave de identidad de una línea para contar duplicados del archivo. */
function identityOf(result) {
  if (result.match) return `tx|${result.match.id}`;
  const p = result.packet;
  return `${result.status}|${p.aprsTime}|${p.frameNumber}|${p.lat}|${p.lon}|${p.altitudeGpsFt}`;
}

/**
 * Anota duplicados en `results` (campo `duplicateOfLine`) y devuelve el mapa de recepciones por
 * transmisión (solo exact/probable) y el de candidatos ambiguos.
 */
export function annotateAndIndex(results) {
  const firstSeen = new Map();
  const received = new Map(); // id → { group, index, count, lines[] }
  const ambiguous = new Map(); // id → cantidad de líneas ambiguas que la incluyen
  for (const r of results) {
    const key = identityOf(r);
    if (firstSeen.has(key)) r.duplicateOfLine = firstSeen.get(key);
    else {
      firstSeen.set(key, r.packet.lineNumber);
      r.duplicateOfLine = null;
    }
    if (r.match) {
      const e = received.get(r.match.id) ?? { ...r.match, count: 0, lines: [] };
      e.count++;
      e.lines.push(r.packet.lineNumber);
      received.set(r.match.id, e);
    } else if (r.status === "ambiguous") {
      for (const c of r.candidates) ambiguous.set(c.id, (ambiguous.get(c.id) ?? 0) + 1);
    }
  }
  return { received, ambiguous, uniqueIdentities: firstSeen.size };
}

/**
 * @param {object} args
 * @param {{fileLines:number, emptyLines:number, ignoredLines:number}} args.parsed
 * @param {object[]} args.results resultados del matcher (con `packet`, `status`, `match`)
 * @param {{flight:object[]}} args.master
 * @param {{received:Map, uniqueIdentities:number}} args.index salida de annotateAndIndex
 * @param {{lat:number, lon:number}|null} [args.stationPosition] estación fija con coordenadas válidas
 */
export function computeStats({ parsed, results, master, index, stationPosition = null }) {
  const byStatus = { exact: 0, probable: 0, ambiguous: 0, unmatched: 0 };
  for (const r of results) byStatus[r.status]++;

  const flightReceived = [];
  let postFlightReceived = 0;
  let preFlightReceived = 0;
  for (const e of index.received.values()) {
    if (e.group === "flight") flightReceived.push(e);
    else if (e.group === "postFlight") postFlightReceived++;
    else preFlightReceived++;
  }
  flightReceived.sort((a, b) => a.index - b.index);

  const flight = master.flight;
  const total = flight.length;
  const stats = {
    fileLines: parsed.fileLines,
    emptyLines: parsed.emptyLines,
    ignoredLines: parsed.ignoredLines,
    packetLines: results.length,
    byStatus,
    uniqueIdentities: index.uniqueIdentities,
    duplicateLines: results.length - index.uniqueIdentities,
    flightTotal: total,
    flightReceived: flightReceived.length,
    coveragePercent: total ? (100 * flightReceived.length) / total : 0,
    postFlightReceived,
    preFlightReceived,
    first: null,
    last: null,
    highestFrame: null,
    maxAltitude: null,
    maxDistance: null,
  };
  if (flightReceived.length) {
    const tx = (e) => flight[e.index];
    stats.first = tx(flightReceived[0]);
    stats.last = tx(flightReceived[flightReceived.length - 1]);
    stats.highestFrame = flightReceived.map(tx).reduce((m, t) => (t.frameNumber > m.frameNumber ? t : m));
    stats.maxAltitude = flightReceived.map(tx).reduce((m, t) => (t.altitudeGpsM > m.altitudeGpsM ? t : m));
    if (stationPosition) {
      let best = null;
      for (const t of flightReceived.map(tx)) {
        const km = haversineKm(stationPosition.lat, stationPosition.lon, t.position.lat, t.position.lon);
        if (!best || km > best.km) best = { km, tx: t };
      }
      stats.maxDistance = best;
    }
  }
  return stats;
}
