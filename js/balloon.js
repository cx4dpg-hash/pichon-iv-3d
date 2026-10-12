// Representación 3D del conjunto de vuelo: carga útil, antena y (solo en ascenso) línea de
// suspensión, cuello y globo. TODO es una aproximación visual; no son mediciones.
//
// La posición APRS/GPS (lat, lon, altitudeGpsM) corresponde a la electrónica de la CARGA ÚTIL:
// la carga se dibuja centrada en esa posición (interpolada visualmente entre transmisiones).
// El globo se dibuja por encima de la carga mientras dura la fase de ascenso.
//
// TAMAÑO FÍSICO Y AYUDA DE VISIBILIDAD (solo a distancia)
// De cerca, el conjunto se dibuja con dimensiones físicas/modeladas: el globo con su diámetro
// estimado (estimatedBalloonDiameterM) y la carga con 0.45 × 0.25 × 0.18 m. NO se intenta
// mantener un tamaño angular constante en pantalla: al hacer zoom, el conjunto crece o
// disminuye de forma natural junto con la escena.
//
// Solo cuando el conjunto ya sería demasiado pequeño para verse se aplica una ayuda de
// visibilidad MUY gradual y limitada, la MISMA para todo el conjunto (así la proporción
// globo/carga no cambia nunca):
//
//     t       = clamp( (d − dCerca) / (dLejos − dCerca) , 0 , 1 )
//     escala  = 1 + (escalaMax − 1) · t² · (3 − 2t)          (smoothstep)
//
//   d        distancia cámara → carga útil (m)
//   dCerca   300 m: hasta aquí escala = 1 (tamaño físico)
//   dLejos   2500 m: a partir de aquí la escala se congela en escalaMax (8) y toma el relevo el
//            marcador puntual del indicativo (CX1AA-11); el modelo 3D no se sigue inflando
//
// La ayuda no es el tamaño físico y no altera posición, altitud ni trayectoria.
// `estimatedBalloonDiameterM` nunca se modifica.

import { visualPosition } from "./playback.js";
import { visualDiameterM } from "./physics.js";

const Cesium = window.Cesium;

/**
 * Parámetros SOLO visuales (ninguno es un dato de la misión).
 * Las separaciones de suspensión y antena también son visuales: Visual-only rendering offset.
 * Not a measured physical length. Nunca se muestran al usuario como longitudes reales.
 */
export const VISUAL_AID = {
  nearDistanceM: 300, // hasta aquí: escala 1 (tamaño físico)
  farDistanceM: 2500, // desde aquí: escala máxima congelada y marcador puntual del indicativo
  maxScale: 8,
  // visualSuspensionOffset = clamp(0.6 · diámetro estimado, 0.8, 4) m (globo ↔ carga), × escala
  suspensionPerBalloonDiameter: 0.6,
  suspensionMinM: 0.8,
  suspensionMaxM: 4,
  // visualAntennaOffset = 0.8 m hacia abajo desde la base de la carga, × escala
  antennaOffsetM: 0.8,
  // Forma del globo: elipsoide de revolución algo alargado (alto = 1.12 × ancho) con el mismo
  // volumen que la esfera del diámetro estimado, más un pequeño cuello inferior.
  eggElongation: 1.12,
  neckLengthFactor: 0.35, // largo del cuello respecto del radio horizontal
};

// Compatibilidad con map3d.js: distancia a partir de la cual se muestra el marcador lejano.
VISUAL_AID.maxAidDistanceM = VISUAL_AID.farDistanceM;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/**
 * Escala visual del conjunto completo en función de la distancia de cámara d (m).
 * Vale 1 hasta nearDistanceM, crece suavemente y se congela en maxScale desde farDistanceM.
 */
export function assemblyScale(distanceM) {
  const t = clamp((distanceM - VISUAL_AID.nearDistanceM) / (VISUAL_AID.farDistanceM - VISUAL_AID.nearDistanceM), 0, 1);
  return 1 + (VISUAL_AID.maxScale - 1) * t * t * (3 - 2 * t);
}

export function createBalloonAssembly(viewer, { flight, playback, diameterModel, payloadDimensionsM }) {
  const camera = viewer.camera;
  const payloadPhysical = payloadDimensionsM;
  const eggCubeRoot = Math.cbrt(VISUAL_AID.eggElongation);

  // Pose calculada para el instante de reproducción y la posición actual de la cámara.
  function getPose() {
    const p = visualPosition(flight, playback);
    const at = (altM) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, altM);
    const payloadCenter = at(p.altM);
    const d = Cesium.Cartesian3.distance(camera.positionWC, payloadCenter);

    // Una única escala para todo el conjunto (proporción globo/carga constante): 1 de cerca.
    const scale = assemblyScale(d);

    // Carga útil: tamaño físico × escala; centrada en la posición GPS.
    const payload = {
      length: payloadPhysical.length * scale,
      width: payloadPhysical.width * scale,
      height: payloadPhysical.height * scale,
    };
    const payloadTop = p.altM + payload.height / 2;
    const payloadBottom = p.altM - payload.height / 2;
    const antennaOffset = VISUAL_AID.antennaOffsetM * scale;

    // Globo: solo mientras la fase es de ascenso (después del máximo no se dibuja).
    const physicalDiameterM = visualDiameterM(diameterModel, playback.index, playback.fraction);
    const balloonVisible = physicalDiameterM !== null;
    let radiusH = 0; // radio horizontal visual
    let radiusV = 0; // radio vertical visual
    let neckLength = 0;
    let suspensionOffset = 0; // sin globo no hay línea de suspensión
    if (balloonVisible) {
      const sphereRadius = (physicalDiameterM * scale) / 2;
      radiusH = sphereRadius / eggCubeRoot; // mismo volumen que la esfera del diámetro estimado
      radiusV = radiusH * VISUAL_AID.eggElongation;
      neckLength = radiusH * VISUAL_AID.neckLengthFactor;
      suspensionOffset =
        clamp(
          VISUAL_AID.suspensionPerBalloonDiameter * physicalDiameterM,
          VISUAL_AID.suspensionMinM,
          VISUAL_AID.suspensionMaxM,
        ) * scale;
    }
    const neckBottomAlt = payloadTop + suspensionOffset;
    const neckTopAlt = neckBottomAlt + neckLength;
    const balloonBottomAlt = neckTopAlt;
    const balloonCenterAlt = balloonBottomAlt + radiusV;

    return {
      cameraDistanceM: d,
      balloonVisible,
      physicalDiameterM, // m físicos estimados; null si el globo no se representa
      assemblyScale: scale,
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

  return { getPose, scaleAt: assemblyScale, body, neck, suspensionLine, payloadBox, antennaLine };
}
