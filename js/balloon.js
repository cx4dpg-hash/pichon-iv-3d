// Representación 3D del conjunto de vuelo: globo, línea de suspensión, carga útil y antena.
// TODO lo dibujado es una aproximación visual; no son mediciones. La posición del conjunto
// (centro del globo = posición GPS interpolada) no se altera por la escala visual.

import { visualPosition } from "./playback.js";
import { visualDiameterM } from "./physics.js";

const Cesium = window.Cesium;

/**
 * Parámetros SOLO visuales.
 * - scale: factor de exageración del tamaño dibujado (globo, carga y longitudes). Sin él, un
 *   globo de ~2–5 m sería invisible a kilómetros de distancia. No afecta posición, altitud
 *   ni trayectoria.
 * - suspensionLengthM / antennaLengthM: longitudes NOMINALES (no medidas; en flight.json son
 *   null), antes de aplicar `scale`.
 */
export const VISUAL = {
  scale: 20,
  suspensionLengthM: 4,
  antennaLengthM: 1.5,
};

export function createBalloonAssembly(viewer, { flight, playback, diameterModel, payloadDimensionsM }) {
  const s = VISUAL.scale;
  const payload = {
    length: payloadDimensionsM.length * s,
    width: payloadDimensionsM.width * s,
    height: payloadDimensionsM.height * s,
  };
  const suspension = VISUAL.suspensionLengthM * s;
  const antenna = VISUAL.antennaLengthM * s;

  // Pose calculada una vez por instante de reproducción (la usan varias entidades).
  let cachedOffset = null;
  let cachedPose = null;
  function getPose() {
    if (cachedPose && cachedOffset === playback.offset) return cachedPose;
    const p = visualPosition(flight, playback);
    const physicalDiameterM = visualDiameterM(diameterModel, playback.index, playback.fraction);
    const radius = (physicalDiameterM * s) / 2;
    const at = (altM) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, altM);

    const balloonBottom = p.altM - radius;
    const payloadTop = balloonBottom - suspension;
    const payloadBottom = payloadTop - payload.height;
    cachedOffset = playback.offset;
    cachedPose = {
      physicalDiameterM,
      visualRadiusM: radius,
      centerAltM: p.altM,
      balloonCenter: at(p.altM),
      balloonBottom: at(balloonBottom),
      payloadTop: at(payloadTop),
      payloadCenter: at(payloadTop - payload.height / 2),
      payloadBottom: at(payloadBottom),
      antennaEnd: at(payloadBottom - antenna),
      payloadCenterAltM: payloadTop - payload.height / 2,
      antennaEndAltM: payloadBottom - antenna,
    };
    return cachedPose;
  }

  const body = viewer.entities.add({
    id: "balloon-body",
    position: new Cesium.CallbackProperty(() => getPose().balloonCenter, false),
    ellipsoid: {
      radii: new Cesium.CallbackProperty(() => {
        const r = getPose().visualRadiusM;
        return new Cesium.Cartesian3(r, r, r);
      }, false),
      material: Cesium.Color.WHITE.withAlpha(0.55),
    },
  });

  const suspensionLine = viewer.entities.add({
    id: "balloon-suspension",
    polyline: {
      positions: new Cesium.CallbackProperty(() => [getPose().balloonBottom, getPose().payloadTop], false),
      width: 2,
      material: Cesium.Color.LIGHTGRAY,
      arcType: Cesium.ArcType.NONE,
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

  return { getPose, body, suspensionLine, payloadBox, antennaLine, payload, suspension, antenna };
}
