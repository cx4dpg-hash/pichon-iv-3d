// Estaciones terrestres: entidades 3D de las fijas y resolución del primer IGate.
// Una estación sin coordenadas conocidas (CX3BP-8) NO se dibuja ni se le asigna posición.

const Cesium = window.Cesium;

export function hasKnownPosition(station) {
  return !!station && station.position.lat !== null && station.position.lon !== null;
}

/** Posición de una estación fija en Cartesian3, o null si es desconocida. */
export function stationCartesian(station) {
  if (!hasKnownPosition(station)) return null;
  // No se conoce la altura de terreno de las estaciones (terrainHeightM = null):
  // se dibujan sobre la altura 0 del elipsoide.
  return Cesium.Cartesian3.fromDegrees(station.position.lon, station.position.lat, 0);
}

export function addStationEntities(viewer, stations) {
  for (const station of stations) {
    const position = stationCartesian(station);
    if (!position) continue;
    viewer.entities.add({
      id: `station-${station.callsign}`,
      name: station.callsign,
      position,
      point: {
        pixelSize: 9,
        color: Cesium.Color.CYAN,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: station.callsign,
        font: "13px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -12),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }
}

/**
 * Describe el primer IGate de una transmisión.
 * @returns {{callsign:string, station:object|null, cartesian:Cesium.Cartesian3|null, text:string}}
 */
export function describeFirstIgate(callsign, stationByCallsign) {
  const station = stationByCallsign.get(callsign) ?? null;
  const cartesian = stationCartesian(station);
  let text = callsign;
  if (station && station.type === "mobile" && !cartesian) {
    text = `${callsign} · estación móvil · posición desconocida`;
  } else if (!station) {
    text = `${callsign} · estación no registrada`;
  }
  return { callsign, station, cartesian, text };
}
