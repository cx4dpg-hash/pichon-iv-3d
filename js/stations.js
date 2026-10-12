// Estaciones terrestres: entidades 3D de las fijas y resolución del primer IGate.
// Una estación sin coordenadas conocidas (CX3BP-8) NO se dibuja ni se le asigna posición.

const Cesium = window.Cesium;

export function hasKnownPosition(station) {
  return !!station && station.position.lat !== null && station.position.lon !== null;
}

// Alturas de terreno consultadas en tiempo de ejecución (solo con relieve activo). Son solo
// de representación: no se guardan en stations.json ni son mediciones de la estación.
const terrainHeights = new Map();

export function setStationHeight(callsign, heightM) {
  terrainHeights.set(callsign, heightM);
}

/** Posición de una estación fija en Cartesian3, o null si es desconocida. */
export function stationCartesian(station) {
  if (!hasKnownPosition(station)) return null;
  // La altura de terreno de las estaciones es desconocida en los datos (terrainHeightM = null):
  // sin relieve se dibujan a altura 0 del elipsoide; con relieve, sobre el terreno consultado.
  const height = terrainHeights.get(station.callsign) ?? 0;
  return Cesium.Cartesian3.fromDegrees(station.position.lon, station.position.lat, height);
}

export function addStationEntities(viewer, stations) {
  for (const station of stations) {
    if (!hasKnownPosition(station)) continue;
    viewer.entities.add({
      id: `station-${station.callsign}`,
      name: station.callsign,
      position: new Cesium.CallbackProperty(() => stationCartesian(station), false),
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
