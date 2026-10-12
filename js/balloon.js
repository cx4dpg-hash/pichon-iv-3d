// Representación 3D del conjunto de vuelo: carga útil, antena y (solo en ascenso) línea de
// suspensión, cuello y globo. TODO es una aproximación visual; no son mediciones.
//
// La posición APRS/GPS (lat, lon, altitudeGpsM) corresponde a la electrónica de la CARGA ÚTIL:
// la carga se dibuja centrada en esa posición (interpolada visualmente entre transmisiones).
// El globo se dibuja por encima de la carga mientras dura la fase de ascenso.
//
// TAMAÑO FÍSICO vs AYUDA DE VISIBILIDAD
// No hay un factor de exageración fijo. Cada elemento (globo, carga) se dibuja con su tamaño
// físico (diámetro estimado del globo; 0.45 × 0.25 × 0.18 m la carga) multiplicado por una
// escala visual que depende de la distancia de la cámara y vale 1 cuando se está cerca:
//
//     escala(L, θ) = clamp( min(d, dMax) · θ / L , 1 , escalaMax )
//
//   d      distancia cámara → carga útil (m)
//   L      tamaño físico característico del elemento (m): diámetro estimado del globo, o la
//          mayor dimensión de la carga (0.45 m)
//   θ      tamaño angular mínimo deseado en pantalla (rad)
//   dMax   distancia a partir de la cual la ayuda deja de crecer (la ayuda se "congela" y toma el
//          relevo el marcador puntual del indicativo)
//
// Es decir: de cerca (d·θ ≤ L) el elemento mide lo que mide físicamente; de lejos se agranda lo
// justo para no bajar de θ en pantalla. La ayuda NO es el tamaño físico y no altera posición,
// altitud ni trayectoria. `estimatedBalloonDiameterM` nunca se modifica.

import { visualPosition } from "./playback.js";
import { visualDiameterM } from "./physics.js";

const Cesium = window.Cesium;

/**
 * Parámetros SOLO visuales (ninguno es un dato de la misión).
 * Las separaciones de suspensión y antena también son visuales: Visual-only rendering offset.
 * Not a measured physical length. Se calculan en metros de escena a partir de la distancia de
 * la cámara (aprox. ángulo constante) y nunca se muestran al usuario como longitudes reales.
 */
export const VISUAL_AID = {
  balloonMinAngularSizeRad: 0.015, // ≈ 0.86° (≈ 9 px en un visor de 600 px con FOV vertical de 60°)
  payloadMinAngularSizeRad: 0.02, // ≈ 1.15°
  balloonMaxScale: 30,
  payloadMaxScale: 40,
  maxAidDistanceM: 2500, // por encima, la ayuda se congela y se muestra el marcador puntual
  // visualSuspensionOffset(d) = clamp(0.035·d, 3, 40) m de escena (globo ↔ carga)
  suspensionOffset: { perMeter: 0.035, min: 3, max: 40 },
  // visualAntennaOffset(d) = clamp(0.015·d, 1.5, 18) m de escena (hacia abajo desde la carga)
  antennaOffset: { perMeter: 0.015, min: 1.5, max: 18 },
  // Forma del globo: elipsoide de revolución algo alargado (alto = 1.12 × ancho) con el mismo
  // volumen que la esfera del diámetro estimado, más un pequeño cuello inferior.
  eggElongation: 1.12,
  neckLengthFactor: 0.35, // largo del cuello respecto del radio horizontal
};

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** Escala visual dependiente de la distancia (fórmula en el encabezado del archivo). */
export function visualScale(physicalSizeM, minAngularSizeRad, distanceM, maxScale) {
  const d = Math.min(distanceM, VISUAL_AID.maxAidDistanceM);
  return clamp((d * minAngularSizeRad) / physicalSizeM, 1, maxScale);
}

const offsetFor = (rule, d) => clamp(rule.perMeter * d, rule.min, rule.max);

export function createBalloonAssembly(viewer, { flight, playback, diameterModel, payloadDimensionsM }) {
  const camera = viewer.camera;
  const payloadPhysical = payloadDimensionsM;
  const payloadLargestM = Math.max(payloadPhysical.length, payloadPhysical.width, payloadPhysical.height);
  const eggCubeRoot = Math.cbrt(VISUAL_AID.eggElongation);

  // Pose calculada para el instante de reproducción y la posición actual de la cámara.
  function getPose() {
    const p = visualPosition(flight, playback);
    const at = (altM) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, altM);
    const payloadCenter = at(p.altM);
    const d = Cesium.Cartesian3.distance(camera.positionWC, payloadCenter);

    // Carga útil: tamaño físico × ayuda de visibilidad; centrada en la posición GPS.
    const sPayload = visualScale(payloadLargestM, VISUAL_AID.payloadMinAngularSizeRad, d, VISUAL_AID.payloadMaxScale);
    const payload = {
      length: payloadPhysical.length * sPayload,
      width: payloadPhysical.width * sPayload,
      height: payloadPhysical.height * sPayload,
    };
    const payloadTop = p.altM + payload.height / 2;
    const payloadBottom = p.altM - payload.height / 2;
    const antennaOffset = offsetFor(VISUAL_AID.antennaOffset, d);
    const suspensionOffset = offsetFor(VISUAL_AID.suspensionOffset, d);

    // Globo: solo mientras la fase es de ascenso (después del máximo no se dibuja).
    const physicalDiameterM = visualDiameterM(diameterModel, playback.index, playback.fraction);
    const balloonVisible = physicalDiameterM !== null;
    let sBalloon = 1;
    let radiusH = 0; // radio horizontal visual
    let radiusV = 0; // radio vertical visual
    let neckLength = 0;
    if (balloonVisible) {
      sBalloon = visualScale(physicalDiameterM, VISUAL_AID.balloonMinAngularSizeRad, d, VISUAL_AID.balloonMaxScale);
      const sphereRadius = (physicalDiameterM * sBalloon) / 2;
      radiusH = sphereRadius / eggCubeRoot; // mismo volumen que la esfera del diámetro estimado
      radiusV = radiusH * VISUAL_AID.eggElongation;
      neckLength = radiusH * VISUAL_AID.neckLengthFactor;
    }
    const neckBottomAlt = payloadTop + suspensionOffset;
    const neckTopAlt = neckBottomAlt + neckLength;
    const balloonBottomAlt = neckTopAlt;
    const balloonCenterAlt = balloonBottomAlt + radiusV;

    return {
      cameraDistanceM: d,
      balloonVisible,
      physicalDiameterM, // m físicos estimados; null si el globo no se representa
      balloonScale: sBalloon,
      payloadScale: sPayload,
      payload,
      radiusH,
      radiusV,
      neckLength,
      payloadCenter,
      payloadCenterAltM: p.altM,
      payloadTop: at(payloadTop),
      payloadBottom: at(payloadBottom),
      antennaEnd: at(payloadBottom - antennaOffset),
      neckBottom: at(neckBottomAlt),
      neckCenter: at(neckBottomAlt + neckLength / 2),
      balloonCenter: at(balloonCenterAlt),
      balloonCenterAltM: balloonCenterAlt,
      balloonBottomAltM: balloonBottomAlt,
    };
  }

  const creamBalloon = Cesium.Color.fromCssColorString("#fff3d6").withAlpha(0.82);
  const creamNeck = Cesium.Color.fromCssColorString("#e9dcb8").withAlpha(0.92);
  const polystyrene = Cesium.Color.fromCssColorString("#f4efe2");

  const body = viewer.entities.add({
    id: "balloon-body",
    position: new Cesium.CallbackProperty(() => getPose().balloonCenter, false),
    ellipsoid: {
      radii: new Cesium.CallbackProperty(() => {
        const pose = getPose();
        const a = Math.max(pose.radiusH, 0.01);
        return new Cesium.Cartesian3(a, a, Math.max(pose.radiusV, 0.01));
      }, false),
      material: creamBalloon,
      show: new Cesium.CallbackProperty(() => getPose().balloonVisible, false),
    },
  });

  const neck = viewer.entities.add({
    id: "balloon-neck",
    position: new Cesium.CallbackProperty(() => getPose().neckCenter, false),
    cylinder: {
      length: new Cesium.CallbackProperty(() => Math.max(getPose().neckLength, 0.01), false),
      topRadius: new Cesium.CallbackProperty(() => Math.max(getPose().radiusH * 0.14, 0.005), false),
      bottomRadius: new Cesium.CallbackProperty(() => Math.max(getPose().radiusH * 0.05, 0.005), false),
      material: creamNeck,
      show: new Cesium.CallbackProperty(() => getPose().balloonVisible, false),
    },
  });

  // Línea de suspensión: une la carga con el cuello del globo, por lo que solo existe con globo.
  const suspensionLine = viewer.entities.add({
    id: "balloon-suspension",
    polyline: {
      positions: new Cesium.CallbackProperty(() => [getPose().payloadTop, getPose().neckBottom], false),
      width: 1.5,
      material: Cesium.Color.fromCssColorString("#d8d8d8"),
      arcType: Cesium.ArcType.NONE,
      show: new Cesium.CallbackProperty(() => getPose().balloonVisible, false),
    },
  });

  const payloadBox = viewer.entities.add({
    id: "balloon-payload",
    position: new Cesium.CallbackProperty(() => getPose().payloadCenter, false),
    box: {
      dimensions: new Cesium.CallbackProperty(() => {
        const { payload } = getPose();
        return new Cesium.Cartesian3(payload.length, payload.width, payload.height);
      }, false),
      material: polystyrene,
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString("#3a3a3a"),
    },
  });

  // La antena cuelga desde la carga útil (no son tirantes estructurales).
  const antennaLine = viewer.entities.add({
    id: "balloon-antenna",
    polyline: {
      positions: new Cesium.CallbackProperty(() => [getPose().payloadBottom, getPose().antennaEnd], false),
      width: 2,
      material: Cesium.Color.fromCssColorString("#8fe36f"),
      arcType: Cesium.ArcType.NONE,
    },
  });

  return { getPose, body, neck, suspensionLine, payloadBox, antennaLine };
}
