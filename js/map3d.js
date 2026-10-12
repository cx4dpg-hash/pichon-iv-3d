// Visualización 3D (CesiumJS): globo base, trayectoria, marcadores, globo y enlace al primer IGate.

import { visualPosition, trajectorySamples } from "./playback.js";
import { addStationEntities, describeFirstIgate } from "./stations.js";
import { createBalloonAssembly, VISUAL_AID } from "./balloon.js";
import { createBaseMap } from "./terrain.js";
import { fitOverview, safeRect } from "./overview.js";

const Cesium = window.Cesium;

// Base cartográfica por defecto, sin credenciales: teselas de OpenStreetMap sobre el elipsoide.
// Con token de Cesium Ion (config.local.js) js/terrain.js la reemplaza por imaginería satelital
// y relieve 3D; si falla, se conserva esta base.
const OSM_URL = "https://tile.openstreetmap.org/";

// El marcador simple del globo solo se ve con la cámara lejos; de cerca se ve el conjunto 3D.
// Los marcadores de inicio/fin/máximo se ocultan de muy cerca para no tapar el conjunto 3D.
const HIDE_WHEN_NEAR = new Cesium.DistanceDisplayCondition(300, Number.MAX_VALUE);

const MARKER_FAR_ONLY = new Cesium.DistanceDisplayCondition(VISUAL_AID.maxAidDistanceM, Number.MAX_VALUE);

function cartesianArray(lat, lon, altM) {
  const c = Cesium.Cartesian3.fromDegrees(lon, lat, altM);
  return [c.x, c.y, c.z];
}

function toCartesian(lat, lon, altM) {
  return Cesium.Cartesian3.fromDegrees(lon, lat, altM);
}

function labelledPoint(viewer, { id, position, text, color, pixelSize = 12 }) {
  return viewer.entities.add({
    id,
    position,
    point: {
      pixelSize,
      color,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: HIDE_WHEN_NEAR,
    },
    label: {
      text,
      font: "13px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -14),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: HIDE_WHEN_NEAR,
    },
  });
}

export function createMap(containerId, data, playback, diameterModel, config = {}) {
  const { flight, stations, stationByCallsign, maxIndex } = data;

  const osmLayer = new Cesium.ImageryLayer(new Cesium.OpenStreetMapImageryProvider({ url: OSM_URL }));
  const viewer = new Cesium.Viewer(containerId, {
    baseLayer: osmLayer,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
  });
  viewer.scene.globe.depthTestAgainstTerrain = false;
  const baseMap = createBaseMap(viewer, osmLayer, { token: config.cesiumIonToken, flight, stations });

  // --- Trayectoria completa (altitud GPS real, sin exageración vertical) ---
  // La posición APRS/GPS es la de la carga útil: esta trayectoria es la de la carga.
  // Posiciones reales (marcadores, encuadre) y geometría visible: la línea es un remuestreo de la
  // MISMA función positionAtTime que mueve la carga, por lo que la carga siempre queda sobre ella.
  const pathCartesians = flight.map((tx) => toCartesian(tx.position.lat, tx.position.lon, tx.altitudeGpsM));
  // Altura mostrada de cada transmisión: bruta, salvo la corrección visual al terreno (solo render).
  const displayAlt = (i) => playback.displayAltM?.[i] ?? flight[i].altitudeGpsM;
  const samplePositions = () =>
    trajectorySamples(flight, data.times, 2000, playback.displayAltM).map((s) => toCartesian(s.lat, s.lon, s.altM));
  const pathEntity = viewer.entities.add({
    id: "flight-path",
    polyline: {
      positions: samplePositions(),
      width: 3,
      material: Cesium.Color.fromCssColorString("#ffb000"),
      arcType: Cesium.ArcType.NONE,
    },
  });

  const first = flight[0];
  const last = flight[flight.length - 1];
  const max = flight[maxIndex];
  labelledPoint(viewer, {
    id: "marker-start",
    position: new Cesium.CallbackProperty(() => toCartesian(first.position.lat, first.position.lon, displayAlt(0)), false),
    text: `Liberación · frame ${first.frameNumber}`,
    color: Cesium.Color.LIME,
  });
  labelledPoint(viewer, {
    id: "marker-end",
    position: new Cesium.CallbackProperty(
      () => toCartesian(last.position.lat, last.position.lon, displayAlt(flight.length - 1)),
      false,
    ),
    text: `Fin · frame ${last.frameNumber}`,
    color: Cesium.Color.RED,
  });
  labelledPoint(viewer, {
    id: "marker-max",
    position: new Cesium.CallbackProperty(() => toCartesian(max.position.lat, max.position.lon, displayAlt(maxIndex)), false),
    text: `Máx. altitud · frame ${max.frameNumber} · ${max.altitudeGpsM.toFixed(0)} m`,
    color: Cesium.Color.YELLOW,
  });

  // Punto de lanzamiento: sitio de la primera posición GPS válida (flight.json → actualLaunch).
  // Marca de "preparación en tierra": no forma parte de la trayectoria aérea principal.
  const launch = data.flightMeta.actualLaunch;
  let launchGroundM = data.preLaunch[0]?.altitudeGpsM ?? flight[0].altitudeGpsM;
  labelledPoint(viewer, {
    id: "marker-launch",
    position: new Cesium.CallbackProperty(() => toCartesian(launch.lat, launch.lon, launchGroundM), false),
    text: "Lanzamiento · primera posición GPS válida (en tierra)",
    color: Cesium.Color.WHITE,
    pixelSize: 9,
  });
  baseMap.ready.then(async () => {
    if (baseMap.mode !== "ion") return;
    try {
      const h = await baseMap.sampleHeight(launch.lat, launch.lon);
      if (h !== null) launchGroundM = h; // sobre el terreno consultado (solo representación)
    } catch {
      /* sin relieve disponible */
    }
  });

  // Si cambia la geometría de render (corrección visual al terreno), se vuelve a dibujar la línea
  // con el mismo remuestreo de positionAtTime; los marcadores y la carga la leen en cada fotograma.
  playback.onGeometryChange(() => {
    pathEntity.polyline.positions = samplePositions();
  });

  // --- Estaciones terrestres fijas ---
  addStationEntities(viewer, stations);

  // --- Marcador de la posición GPS (carga útil); se interpola solo visualmente ---
  const balloonPosition = () => {
    const p = visualPosition(flight, playback);
    return toCartesian(p.lat, p.lon, p.altM);
  };
  const balloon = viewer.entities.add({
    id: "balloon",
    position: new Cesium.CallbackProperty(balloonPosition, false),
    // Offset ENU (este, norte, arriba) desde la carga: ≈ 35 m. El conjunto se dibuja con tamaño
    // físico, así que hay que estar cerca para verlo; el usuario puede acercar/alejar libremente.
    viewFrom: new Cesium.Cartesian3(-14, -28, 14),
    point: {
      pixelSize: 14,
      color: Cesium.Color.fromCssColorString("#ff4d4d"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: MARKER_FAR_ONLY,
    },
    label: {
      text: "CX1AA-11",
      font: "13px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -16),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: MARKER_FAR_ONLY,
    },
  });

  // Conjunto aproximado: carga útil en la posición GPS, antena debajo y globo encima (en ascenso).
  const assembly = createBalloonAssembly(viewer, {
    flight,
    playback,
    diameterModel,
    payloadDimensionsM: data.payloadDimensionsM,
  });

  // --- Enlace temporal estación → globo (solo el de la transmisión vigente) ---
  const currentLinkStation = () => {
    const tx = flight[playback.index];
    return describeFirstIgate(tx.firstIgate, stationByCallsign).cartesian;
  };
  const link = viewer.entities.add({
    id: "first-igate-link",
    polyline: {
      positions: new Cesium.CallbackProperty(() => {
        const from = currentLinkStation();
        return from ? [from, balloonPosition()] : [];
      }, false),
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.CYAN, dashLength: 16 }),
      arcType: Cesium.ArcType.NONE,
      // La línea es una recepción APRS real de una transmisión real: se oculta en la fase visual
      // final no telemétrica (no hay transmisión ni recepción en ese tramo).
      show: new Cesium.CallbackProperty(() => !playback.inFinalPhase && currentLinkStation() !== null, false),
    },
  });

  // --- Cámara ---
  // "Vista general": encuadre calculado (js/overview.js) para que lanzamiento, liberación, toda la
  // trayectoria, apogeo, frame 157 y punto de rescate (con el tramo violeta) queden dentro del área
  // visible del mapa, excluyendo el ANCHO REAL del panel izquierdo cuando está visible.
  const OVERVIEW_PITCH_DEG = -40;
  const launchPoint = data.flightMeta.actualLaunch;
  const rescuePoint = data.recovery?.rescuePoint;
  const lastTx = flight[flight.length - 1];
  const overviewPoints = [
    ...flight.map((tx) => ({ p: cartesianArray(tx.position.lat, tx.position.lon, tx.altitudeGpsM), padL: 10, padR: 10, padT: 10, padB: 10 })),
    // etiquetas (centradas sobre el punto): holgura aproximada de su ancho/alto en px
    { p: cartesianArray(launchPoint.lat, launchPoint.lon, data.preLaunch[0]?.altitudeGpsM ?? flight[0].altitudeGpsM), padL: 165, padR: 165, padT: 34, padB: 10 },
    { p: cartesianArray(flight[0].position.lat, flight[0].position.lon, flight[0].altitudeGpsM), padL: 70, padR: 70, padT: 34, padB: 10 },
    { p: cartesianArray(max.position.lat, max.position.lon, max.altitudeGpsM), padL: 110, padR: 110, padT: 34, padB: 10 },
    { p: cartesianArray(lastTx.position.lat, lastTx.position.lon, lastTx.altitudeGpsM), padL: 55, padR: 55, padT: 34, padB: 10 },
  ];
  if (rescuePoint) {
    overviewPoints.push({ p: cartesianArray(rescuePoint.lat, rescuePoint.lon, 12), padL: 125, padR: 125, padT: 10, padB: 50 });
  }
  const overviewCenter = Cesium.BoundingSphere.fromPoints(overviewPoints.map((q) => new Cesium.Cartesian3(...q.p))).center;
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(overviewCenter);
  const column = (i) => [enu[i * 4], enu[i * 4 + 1], enu[i * 4 + 2]];
  const overviewFrame = { east: column(0), north: column(1), up: column(2) };
  const sphere = Cesium.BoundingSphere.fromPoints(pathCartesians);
  let mode = "overview";
  let userMoved = false; // el usuario movió la cámara a mano desde el último encuadre

  function panelInsetPx() {
    const panel = document.getElementById("infoPanel");
    const app = document.getElementById("app");
    if (!panel || panel.hidden || app?.classList.contains("presentation")) return 0;
    return Math.max(0, panel.getBoundingClientRect().right - viewer.canvas.getBoundingClientRect().left);
  }

  /** Pose de la Vista general para el tamaño actual del visor y el ancho real del panel. */
  function overviewPose() {
    const width = viewer.canvas.clientWidth;
    const height = viewer.canvas.clientHeight;
    return fitOverview({
      points: overviewPoints,
      frame: overviewFrame,
      center: [overviewCenter.x, overviewCenter.y, overviewCenter.z],
      pitchDeg: OVERVIEW_PITCH_DEG,
      width,
      height,
      fovy: viewer.camera.frustum.fovy,
      safe: safeRect({ width, height, leftInsetPx: panelInsetPx() }),
    });
  }

  function applyOverview(duration) {
    const pose = overviewPose();
    userMoved = false;
    const target = {
      destination: new Cesium.Cartesian3(...pose.eye),
      orientation: { direction: new Cesium.Cartesian3(...pose.direction), up: new Cesium.Cartesian3(...pose.up) },
    };
    viewer.camera.cancelFlight();
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    if (duration > 0) viewer.camera.flyTo({ ...target, duration });
    else viewer.camera.setView(target);
  }

  function flyToOverview(duration) {
    viewer.trackedEntity = undefined;
    applyOverview(duration);
  }

  function setCameraMode(newMode) {
    mode = newMode;
    if (newMode === "follow") {
      viewer.camera.cancelFlight();
      viewer.trackedEntity = balloon;
    } else {
      flyToOverview(1.5);
    }
  }

  // Vista general inicial inmediata.
  applyOverview(0);

  // Si cambia el tamaño del visor o el ancho del panel (ventana, panel ocultable, Presentación) y la
  // cámara sigue en la Vista general sin intervención del usuario, se vuelve a encuadrar.
  let refitTimer = null;
  const scheduleRefit = () => {
    clearTimeout(refitTimer);
    refitTimer = setTimeout(() => {
      if (mode === "overview" && !userMoved && !viewer.trackedEntity) applyOverview(0);
    }, 120);
  };
  const wrap = document.getElementById("viewerWrap");
  const panelEl = document.getElementById("infoPanel");
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(scheduleRefit);
    if (wrap) observer.observe(wrap);
    if (panelEl) observer.observe(panelEl);
  }
  const markMoved = () => {
    userMoved = true;
  };
  for (const type of ["pointerdown", "wheel", "touchstart"]) viewer.canvas.addEventListener(type, markMoved, { passive: true });
  document.getElementById("compass")?.addEventListener("click", markMoved);

  return {
    viewer,
    baseMap,
    balloon,
    assembly,
    link,
    setCameraMode,
    get cameraMode() {
      return mode;
    },
  };
}
