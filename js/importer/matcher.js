// Matching de paquetes parseados contra el dataset maestro (transmissions.json).
// El log del usuario NUNCA crea ni modifica transmisiones maestras: solo puede coincidir con
// alguna existente, quedar ambiguo o sin coincidencia.
//
// Campos de identificación (los cinco del dataset): packetTimestamp (hhmmss UTC), frameNumber,
// lat, lon, altitudeGpsFt. frameNumber NO es clave única (se reinicia entre jornadas).
//
// Estados:
//   exact     los cinco campos están en el log y coinciden con una única transmisión.
//   probable  falta algún campo, pero los restantes (al menos 3 coincidentes, sin ninguna
//             discrepancia) identifican una única transmisión.
//   ambiguous más de una transmisión posible, o evidencia insuficiente (<3 campos).
//   unmatched ninguna transmisión del maestro es compatible.
// Un ambiguous nunca se resuelve eligiendo arbitrariamente.

/**
 * Tolerancia para lat/lon, en grados. La resolución de una posición APRS es 0.01' ≈ 1.7e-4°,
 * así que 1e-5° (~1 m) absorbe diferencias de representación decimal sin poder unir dos
 * posiciones APRS distintas.
 */
export const COORD_TOLERANCE_DEG = 1e-5;

/** Mínimo de campos coincidentes para aceptar un match "probable". */
export const MIN_MATCHED_FIELDS = 3;

const FIELDS = ["packetTimestamp", "frameNumber", "lat", "lon", "altitudeGpsFt"];

function telemetryTuple(t) {
  return [
    t.mode, t.internalTemperatureC, t.externalTemperatureC, t.pressureHpa, t.humidityPercent,
    t.barometricAltitudeM, t.batteryRaw, t.gpsQuality, t.satellites, t.gpsStatus,
  ].join(";");
}

/**
 * @param {{flight:object[], postFlight:object[], preFlight:object[], preLaunch?:object[]}} master
 */
export function createMatcher(master) {
  const candidates = [];
  const rawPackets = new Set();
  for (const group of ["flight", "postFlight", "preFlight", "preLaunch"]) {
    (master[group] ?? []).forEach((tx, index) => {
      candidates.push({
        id: tx.id,
        group,
        index,
        frameNumber: tx.frameNumber,
        packetTimestamp: tx.packetTimestampRaw.slice(0, 6),
        lat: tx.position.lat,
        lon: tx.position.lon,
        altitudeGpsFt: tx.altitudeGpsFt,
        payload: telemetryTuple(tx.telemetry),
      });
      for (const r of tx.receptions) rawPackets.add(r.rawPacket);
    });
  }
  const byTime = new Map();
  for (const c of candidates) {
    if (!byTime.has(c.packetTimestamp)) byTime.set(c.packetTimestamp, []);
    byTime.get(c.packetTimestamp).push(c);
  }

  const available = (p) => ({
    packetTimestamp: p.aprsTime !== null,
    frameNumber: p.frameNumber !== null,
    lat: p.lat !== null,
    lon: p.lon !== null,
    altitudeGpsFt: p.altitudeGpsFt !== null,
  });

  function compare(p, avail, c) {
    const matched = [];
    const mismatched = [];
    const check = (field, ok) => (ok ? matched : mismatched).push(field);
    if (avail.packetTimestamp) check("packetTimestamp", p.aprsTime === c.packetTimestamp);
    if (avail.frameNumber) check("frameNumber", p.frameNumber === c.frameNumber);
    if (avail.lat) check("lat", Math.abs(p.lat - c.lat) <= COORD_TOLERANCE_DEG);
    if (avail.lon) check("lon", Math.abs(p.lon - c.lon) <= COORD_TOLERANCE_DEG);
    if (avail.altitudeGpsFt) check("altitudeGpsFt", p.altitudeGpsFt === c.altitudeGpsFt);
    let payload = "absent";
    if (p.telemetry) payload = telemetryTuple(p.telemetry) === c.payload ? "equal" : "different";
    return { c, matched, mismatched, payload };
  }

  const describe = (c) => ({ id: c.id, group: c.group, index: c.index, frameNumber: c.frameNumber });

  function match(p) {
    const avail = available(p);
    const availableFields = FIELDS.filter((f) => avail[f]);
    const result = {
      status: "unmatched",
      match: null,
      candidates: [],
      matchedFields: [],
      missingFields: FIELDS.filter((f) => !avail[f]),
      notes: [],
      evidence: { rawPacketKnown: false, payload: "absent" },
    };
    if (p.rawPacket && rawPackets.has(p.rawPacket)) result.evidence.rawPacketKnown = true;
    if (availableFields.length === 0) {
      result.notes.push("el paquete no contiene ningún campo identificable");
      return result;
    }

    // Si hay hora APRS, solo pueden coincidir transmisiones con esa misma hora.
    const pool = avail.packetTimestamp ? (byTime.get(p.aprsTime) ?? []) : candidates;
    const evaluated = pool.map((c) => compare(p, avail, c));
    let compatible = evaluated.filter((e) => e.mismatched.length === 0 && e.matched.length >= 1);

    if (compatible.length === 0) {
      // Sin coincidencias: documentar la transmisión más parecida (solo como nota).
      const near = (avail.packetTimestamp ? candidates : pool)
        .map((c) => compare(p, avail, c))
        .filter((e) => e.matched.length >= 2)
        .sort((a, b) => b.matched.length - a.matched.length)[0];
      if (near) {
        result.notes.push(
          `se parece a la transmisión ${near.c.id} (coincide ${near.matched.join(", ")}) pero difiere en ${near.mismatched.join(", ")}`,
        );
      } else {
        result.notes.push("ninguna transmisión del maestro es compatible");
      }
      return result;
    }

    // Desempate por telemetría (payload) si hay varias compatibles y el log la trae.
    if (compatible.length > 1 && p.telemetry) {
      const byPayload = compatible.filter((e) => e.payload === "equal");
      if (byPayload.length === 1) {
        result.notes.push("desempatado por telemetría idéntica");
        compatible = byPayload;
      }
    }
    result.candidates = compatible.map((e) => describe(e.c));

    if (compatible.length > 1) {
      result.status = "ambiguous";
      result.notes.push(`${compatible.length} transmisiones posibles; no se elige ninguna`);
      return result;
    }

    const chosen = compatible[0];
    result.matchedFields = chosen.matched;
    result.evidence.payload = chosen.payload;
    if (chosen.matched.length < MIN_MATCHED_FIELDS) {
      result.status = "ambiguous";
      result.notes.push(
        `evidencia insuficiente (solo coincide ${chosen.matched.join(", ")}); no se asigna la transmisión ${chosen.c.id}`,
      );
      return result;
    }

    result.match = describe(chosen.c);
    const allFive = availableFields.length === FIELDS.length;
    result.status = allFive && chosen.payload !== "different" ? "exact" : "probable";
    if (!allFive) result.notes.push(`faltan en el log: ${result.missingFields.join(", ")}`);
    if (chosen.payload === "different") result.notes.push("la telemetría del log difiere de la del maestro");
    if (chosen.payload === "equal") result.notes.push("telemetría idéntica");
    if (result.evidence.rawPacketKnown) result.notes.push("paquete crudo idéntico a una recepción conocida");
    return result;
  }

  return { match, candidates };
}
