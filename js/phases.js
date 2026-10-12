// Fases del vuelo (derivadas en tiempo de ejecución; el dataset no se modifica):
//
//   preLaunch / ground  transmisiones con GPS válido en tierra, anteriores a la liberación
//   ascent              desde la liberación hasta la transmisión de máxima altitud
//   descent             después de la transmisión de máxima altitud (ver physics.js)
//
// Tres conceptos distintos (no deben confundirse):
//   - primera posición GPS válida: primera transmisión con posición no nula (frame 3);
//   - punto de lanzamiento: el sitio (lat/lon) de esa primera posición válida (flight.json →
//     actualLaunch); la carga permaneció allí en tierra varios minutos;
//   - inicio efectivo del ascenso (liberación): ancla de la reproducción principal, determinada
//     con el criterio de abajo a partir de la telemetría.
//
// CRITERIO (reproducible, sin asumir ningún frame): se busca la primera transmisión i tal que
// en los `sustainedIntervals` intervalos consecutivos que parten de ella (i→i+1, …) tanto la
// altitud GPS como la altitud barométrica suben al menos `minRisePerIntervalM` en cada intervalo
// y la ganancia GPS acumulada es ≥ `minTotalGainM`. Así el ruido del GPS en tierra (varios
// metros, sin tendencia) no se confunde con la liberación. La transmisión i es la última
// posición en tierra, base del primer intervalo ascendente; i+1 es la primera ya en el aire.

export const ASCENT_CRITERIA = {
  minRisePerIntervalM: 10, // ≈ 2.5 × el mayor salto GPS observado en tierra (≈ 4 m)
  sustainedIntervals: 4,
  minTotalGainM: 100,
};

export const PRELAUNCH_PHASE_TEXT = "En tierra / preparación (antes de la liberación)";

/**
 * @param {object[]} flight transmisiones válidas en orden temporal (flight de transmissions.json)
 * @returns {null | {anchorIndex:number, firstAirborneIndex:number, criteria:object,
 *   groundNoiseM:number, intervals:object[]}}
 */
export function detectAscentStart(flight, criteria = ASCENT_CRITERIA) {
  const { minRisePerIntervalM, sustainedIntervals, minTotalGainM } = criteria;
  const gps = flight.map((tx) => tx.altitudeGpsM);
  const baro = flight.map((tx) => tx.telemetry.barometricAltitudeM);
  for (let i = 0; i + sustainedIntervals < flight.length; i++) {
    let ok = true;
    for (let k = 0; k < sustainedIntervals && ok; k++) {
      ok = gps[i + k + 1] - gps[i + k] >= minRisePerIntervalM && baro[i + k + 1] - baro[i + k] >= minRisePerIntervalM;
    }
    if (!ok || gps[i + sustainedIntervals] - gps[i] < minTotalGainM) continue;
    let groundNoiseM = 0;
    for (let j = 1; j <= i; j++) groundNoiseM = Math.max(groundNoiseM, Math.abs(gps[j] - gps[j - 1]));
    const intervals = [];
    for (let k = 0; k < sustainedIntervals; k++) {
      intervals.push({
        fromFrame: flight[i + k].frameNumber,
        toFrame: flight[i + k + 1].frameNumber,
        gpsRiseM: gps[i + k + 1] - gps[i + k],
        baroRiseM: baro[i + k + 1] - baro[i + k],
      });
    }
    return { anchorIndex: i, firstAirborneIndex: i + 1, criteria, groundNoiseM, intervals };
  }
  return null;
}

/**
 * Divide las transmisiones válidas en preLaunch (en tierra) y vuelo efectivo (desde la
 * liberación). No copia ni modifica las transmisiones.
 */
export function splitPhases(flightAll, criteria = ASCENT_CRITERIA) {
  const detection = detectAscentStart(flightAll, criteria);
  if (!detection) return { preLaunch: [], flight: flightAll, detection: null, anchorIndexInAll: 0 };
  const a = detection.anchorIndex;
  return { preLaunch: flightAll.slice(0, a), flight: flightAll.slice(a), detection, anchorIndexInAll: a };
}
