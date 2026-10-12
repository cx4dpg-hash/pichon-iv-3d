// Representación 3D del conjunto de vuelo: carga útil, antena, y (solo en ascenso) línea de
// suspensión y globo. TODO es una aproximación visual; no son mediciones.
//
// La posición APRS/GPS (lat, lon, altitudeGpsM) corresponde a la electrónica de la CARGA ÚTIL:
// la carga se dibuja centrada en esa posición (interpolada visualmente entre transmisiones).
// El globo se dibuja por encima de la carga mientras dura la fase de ascenso.

import { visualPosition } from "./playback.js";
import { visualDiameterM } from "./physics.js";

const Cesium = window.Cesium;

/**
 * Parámetros SOLO visuales.
 * - scale: factor de exageración del tamaño dibujado (globo y carga). Sin él, un globo de
 *   ~2–5 m sería invisible a kilómetros de distancia. No afecta posición, altitud ni trayectoria.
 * - visualSuspensionOffset / visualAntennaOffset: separaciones de renderizado, en metros de
 *   escena YA exagerados. Visual-only rendering offset. Not a measured physical length.
 *   No son datos de la misión y nunca se muestran al usuario como longitudes reales.
 */
export const VISUAL = {
  scale: 20,
  visualSuspensionOffset: 80,
  visualAntennaOffset: 30,
};

export function createBalloonAssembly(viewer, { flight, playback, diameterModel, payloadDimensionsM }) {
  const s = VISUAL.scale;
  const payload = {
    length: payloadDimensionsM.length * s,
    width: payloadDimensionsM.width * s,
    height: payloadDimensionsM.height * s,
  };

  // Pose calculada una vez por instante de reproducción (la usan varias entidades).
  let cachedOffset = null;
  let cachedPose = null;
  function getPose() {
    if (cachedPose && cachedOffset === playback.offset) return cachedPose;
    const p = visualPosition(flight, playback);
    const at = (altM) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, altM);

    // Carga útil: centrada exactamente en la posición GPS (interpolada).
    const payloadTop = p.altM + payload.height / 2;
    const payloadBottom = p.altM - payload.height / 2;

    // Globo: solo mientras la fase es de ascenso (después del máximo no se dibuja).
    const physicalDiameterM = visualDiameterM(diameterModel, playback.index, playback.fraction);
    const balloonVisible = physicalDiameterM !== null;
    const radius = balloonVisible ? (physicalDiameterM * s) / 2 : 0;
    const balloonBottomAlt = payloadTop + VISUAL.visualSuspensionOffset;

    cachedOffset = playback.offset;
    cachedPose = {
      balloonVisible,
      physicalDiameterM, // null si el globo no se representa
      visualRadiusM: radius,
      payloadCenter: at(p.altM),
      payloadCenterAltM: p.altM,
      payloadTop: at(payloadTop),
      payloadBottom: at(payloadBottom),
      antennaEnd: at(payloadBottom - VISUAL.visualAntennaOffset),
      balloonBottom: at(balloonBottomAlt),
      balloonCenter: at(balloonBottomAlt + radius),
      balloonCenterAltM: balloonBottomAlt + radius,
    };
    return cachedPose;
  }

  const body = viewer.entities.add({
    id: "balloon-body",
    position: new Cesium.CallbackProperty(() => getPose().balloonCenter, false),
    ellipsoid: {
      radii: new Cesium.CallbackProperty(() => {
        const r = Math.max(getPose().visualRadiusM, 0.01);
        return new Cesium.Cartesian3(r, r, r);
      }, false),
      material: Cesium.Color.WHITE.withAlpha(0.55),
      show: new Cesium.CallbackProperty(() => getPose().balloonVisible, false),
    },
  });

  // Línea de suspensión: une la carga con el globo, por lo que solo existe con globo.
  const suspensionLine = viewer.entities.add({
    id: "balloon-suspension",
    polyline: {
      positions: new Cesium.CallbackProperty(() => [getPose().payloadTop, getPose().balloonBottom], false),
      width: 2,
      material: Cesium.Color.LIGHTGRAY,
      arcType: Cesium.ArcType.NONE,
      show: new Cesium.CallbackProperty(() => getPose().balloonVisible, false),
    },
  });

  const payloadBox = viewer.entities.add({
    id: "balloon-payload",
    position: new Cesium.CallbackProperty(() => getPose().payloadCenter, false),
    box: {
      dimensions: new Cesium.Cartesian3(payload.length, payload.width, payload.height),
      material: Cesium.Color.fromCssColorString("#ff7a00"),
      outline: true,
      outlineColor: Cesium.Color.BLACK,
    },
  });

  // La antena cuelga desde la carga útil (no son tirantes estructurales).
  const antennaLine = viewer.entities.add({
    id: "balloon-antenna",
    polyline: {
      positions: new Cesium.CallbackProperty(() => [getPose().payloadBottom, getPose().antennaEnd], false),
      width: 3,
      material: Cesium.Color.LIME,
      arcType: Cesium.ArcType.NONE,
    },
  });

  return { getPose, body, suspensionLine, payloadBox, antennaLine, payload };
}
