// Datos DERIVADOS (no son telemetría original) calculados a partir de las transmisiones reales.
// Nunca se rellenan ni se interpolan valores: si no hay muestra anterior, el valor es null.

/**
 * Velocidad vertical derivada (m/s), una por transmisión:
 *
 *     v[i] = (altitudeGpsM[i] − altitudeGpsM[i−1]) / ((t[i] − t[i−1]) / 1000)
 *
 * donde t[i] es el instante de emisión de la trama (packetTimestampUtc, en ms), NO la hora de
 * recepción. Es la tasa media entre dos transmisiones consecutivas (con intervalos de 60 s o,
 * a veces, 120 s), no una medición instantánea. Para la primera transmisión no existe muestra
 * anterior y vale null (la interfaz muestra "—"). Positivo = ascenso.
 *
 * @param {object[]} flight transmisiones de vuelo en orden temporal
 * @param {number[]} times instantes (ms) de cada transmisión (de packetTimestampUtc)
 * @returns {(number|null)[]}
 */
export function verticalSpeedsMs(flight, times) {
  return flight.map((tx, i) => {
    if (i === 0) return null;
    const dt = (times[i] - times[i - 1]) / 1000;
    if (!(dt > 0)) return null;
    return (tx.altitudeGpsM - flight[i - 1].altitudeGpsM) / dt;
  });
}
