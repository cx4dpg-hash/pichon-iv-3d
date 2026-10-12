// Modelo físico aproximado del diámetro del globo (gas ideal). Sin dependencias de Cesium.
//
//   V2 = V1 * (T2 / T1) * (P1 / P2)      (P absoluta, T en kelvin)
//   D2 = D1 * (V2 / V1)^(1/3)            (esfera)
//
// Usa SOLO pressureHpa y externalTemperatureC de cada transmisión. No usa altitud GPS ni
// barométrica. El resultado es una ESTIMACIÓN (estimatedBalloonDiameterM), nunca un dato
// original del dataset.

const KELVIN_OFFSET = 273.15;

/** Muestra válida: presión > 0 y temperatura absoluta > 0 (ambas finitas). */
export function isValidSample(telemetry) {
  const p = telemetry?.pressureHpa;
  const t = telemetry?.externalTemperatureC;
  return Number.isFinite(p) && p > 0 && Number.isFinite(t) && t + KELVIN_OFFSET > 0;
}

/** D2 a partir de la condición de referencia (D1, P1, T1) y la muestra (P2, T2). */
export function estimateDiameter({ d1, p1Hpa, t1K }, p2Hpa, t2K) {
  const volumeRatio = (t2K / t1K) * (p1Hpa / p2Hpa);
  return d1 * Math.cbrt(volumeRatio);
}

/**
 * Calcula estimatedBalloonDiameterM para cada transmisión de `flight`.
 * - Referencia: primera transmisión con muestra válida (se le asigna el diámetro inicial visual).
 * - Muestra inválida (o resultado no finito): no se calcula; se usa como fallback VISUAL el
 *   último diámetro válido (o el inicial si todavía no hubo ninguno) y se marca `fallback`.
 */
export function buildDiameterModel(flight, initialDiameterM) {
  const referenceIndex = flight.findIndex((tx) => isValidSample(tx.telemetry));
  if (referenceIndex < 0) {
    throw new Error("Ninguna transmisión tiene presión y temperatura externa válidas");
  }
  const refTel = flight[referenceIndex].telemetry;
  const reference = {
    d1: initialDiameterM,
    p1Hpa: refTel.pressureHpa,
    t1K: refTel.externalTemperatureC + KELVIN_OFFSET,
  };

  const entries = [];
  let lastValid = initialDiameterM;
  let maxIndex = -1;
  let fallbackCount = 0;
  flight.forEach((tx, i) => {
    let diameterM = null;
    if (i >= referenceIndex && isValidSample(tx.telemetry)) {
      const d = estimateDiameter(
        reference,
        tx.telemetry.pressureHpa,
        tx.telemetry.externalTemperatureC + KELVIN_OFFSET,
      );
      if (Number.isFinite(d) && d > 0) diameterM = d;
    }
    if (diameterM !== null) {
      entries.push({ diameterM, status: "computed" });
      lastValid = diameterM;
      if (maxIndex < 0 || diameterM > entries[maxIndex].diameterM) maxIndex = i;
    } else {
      entries.push({ diameterM: lastValid, status: i < referenceIndex ? "initial" : "fallback" });
      fallbackCount++;
    }
  });

  return { reference, referenceIndex, initialDiameterM, entries, maxIndex, fallbackCount };
}

/** Diámetro estimado de la transmisión vigente (sin interpolar; es el valor que se muestra). */
export function currentEstimate(model, index) {
  return model.entries[index];
}

/** Diámetro para dibujar: interpolación VISUAL entre transmisiones consecutivas. */
export function visualDiameterM(model, index, fraction) {
  const a = model.entries[index].diameterM;
  if (index >= model.entries.length - 1) return a;
  const b = model.entries[index + 1].diameterM;
  return a + (b - a) * fraction;
}
