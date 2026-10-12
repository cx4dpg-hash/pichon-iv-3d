// Corrección VISUAL de la altura mostrada al terreno ("visual terrain floor correction").
// Solo es presentación: no modifica altitudeGpsM ni ningún dato del dataset.
//
// Problema: a baja altitud la altitud GPS bruta puede quedar por debajo del terreno de Cesium
// (frames de lanzamiento: la carga aparecería enterrada). Causas posibles: la altitud APRS/GPS es
// sobre el nivel medio del mar (geoide) y Cesium usa altura elipsoidal (diferencia de unos metros
// a una decena de metros en Uruguay, no corregida porque CesiumJS no incluye un modelo de geoide),
// el error vertical propio del GPS y el detalle del mallado del terreno.
//
// Criterio: la altura mostrada es max(altitud bruta, terreno + holgura). Solo actúa cuando la
// altitud bruta queda por debajo de (terreno + holgura), es decir, en la fase de lanzamiento /
// baja altitud; en el resto del vuelo la corrección es exactamente 0. La función es continua
// (no introduce saltos) y se aplica en un único lugar, sobre las altitudes de render que usan
// positionAtTime, la trayectoria dibujada, los marcadores y la carga.

/** Holgura mínima (m) de la carga sobre el terreno en la corrección visual. */
export const FLOOR_CLEARANCE_M = 1.0;

/**
 * @param {number[]} rawAltM altitudes brutas (altitudeGpsM) por transmisión
 * @param {(number|null)[]} terrainM alturas de terreno consultadas (m) por transmisión
 * @returns {{display:number[], corrections:number[]}} altitudes de render y corrección aplicada (>= 0)
 */
export function terrainFloorAltitudes(rawAltM, terrainM, clearanceM = FLOOR_CLEARANCE_M) {
  const display = [];
  const corrections = [];
  rawAltM.forEach((raw, i) => {
    const terrain = terrainM[i];
    if (!Number.isFinite(terrain)) {
      display.push(raw);
      corrections.push(0);
      return;
    }
    const floor = terrain + clearanceM;
    const shown = Math.max(raw, floor);
    display.push(shown);
    corrections.push(shown - raw);
  });
  return { display, corrections };
}
