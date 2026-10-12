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
 * Calcula estimatedBalloonDiameterM SOLO para la fase de ascenso: desde el inicio del vuelo
 * hasta la transmisión de máxima altitud GPS (`apogeeIndex`, determinada desde el dataset).
 * Desde la primera transmisión posterior el globo se considera ya no intacto y la fórmula
 * no se aplica (diameterM = null, status "not_applicable").
 *
 * - Referencia: primera transmisión con muestra válida (se le asigna el diámetro inicial visual).
 * - Muestra inválida durante el ascenso (o resultado no finito): no se calcula; se usa como
 *   fallback VISUAL el último diámetro válido (o el inicial si todavía no hubo ninguno) y la
 *   entrada queda marcada `fallback` (o `initial` si es anterior a la referencia).
 *
 * estimatedBurstTransition: transición ESTIMADA entre la transmisión de máxima altitud y la
 * siguiente. Se infiere del perfil de vuelo (máximo seguido de descenso rápido); no se conoce
 * el instante exacto de ruptura.
 */
export function buildDiameterModel(flight, initialDiameterM, apogeeIndex) {
  const referenceIndex = flight.findIndex((tx) => isValidSample(tx.telemetry));
  if (referenceIndex < 0 || referenceIndex > apogeeIndex) {
    throw new Error("Ninguna transmisión del ascenso tiene presión y temperatura externa válidas");
  }
  const refTel = flight[referenceIndex].telemetry;
  const reference = {
    d1: initialDiameterM,
    p1Hpa: refTel.pressureHpa,
    t1K: refTel.externalTemperatureC + KELVIN_OFFSET,
  };

  const entries = [];
  let lastValid = initialDiameterM;
  let maxDiameterIndex = -1;
  let fallbackCount = 0;
  flight.forEach((tx, i) => {
    if (i > apogeeIndex) {
      entries.push({ diameterM: null, status: "not_applicable" });
      return;
    }
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
      if (maxDiameterIndex < 0 || diameterM > entries[maxDiameterIndex].diameterM) maxDiameterIndex = i;
    } else {
      entries.push({ diameterM: lastValid, status: i < referenceIndex ? "initial" : "fallback" });
      fallbackCount++;
    }
  });

  const firstDescentIndex = apogeeIndex + 1 < flight.length ? apogeeIndex + 1 : null;
  const estimatedBurstTransition =
    firstDescentIndex === null
      ? null
      : {
          lastAscentIndex: apogeeIndex,
          firstDescentIndex,
          lastAscentFrame: flight[apogeeIndex].frameNumber,
          firstDescentFrame: flight[firstDescentIndex].frameNumber,
          altitudeDropM: flight[apogeeIndex].altitudeGpsM - flight[firstDescentIndex].altitudeGpsM,
          seconds: (Date.parse(flight[firstDescentIndex].packetTimestampUtc) - Date.parse(flight[apogeeIndex].packetTimestampUtc)) / 1000,
        };

  return {
    reference,
    referenceIndex,
    initialDiameterM,
    entries,
    apogeeIndex,
    maxDiameterIndex,
    fallbackCount,
    estimatedBurstTransition,
  };
}

/** Diámetro estimado de la transmisión vigente (sin interpolar; es el valor que se muestra). */
export function currentEstimate(model, index) {
  return model.entries[index];
}

/** ¿El globo se considera intacto (fase de ascenso) en esta transmisión? */
export function isAscentPhase(model, index) {
  return index <= model.apogeeIndex;
}

/**
 * Diámetro para dibujar (m físicos, sin escala visual): interpolación VISUAL entre
 * transmisiones consecutivas del ascenso. Devuelve null desde la primera transmisión posterior
 * al máximo (globo no representado). Entre el máximo y la siguiente se mantiene el valor del máximo.
 */
export function visualDiameterM(model, index, fraction) {
  const a = model.entries[index].diameterM;
  if (a === null || index >= model.entries.length - 1) return a;
  const b = model.entries[index + 1].diameterM;
  if (b === null) return a;
  return a + (b - a) * fraction;
}
