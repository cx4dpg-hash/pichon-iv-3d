// Visualización 3D (CesiumJS): globo base, trayectoria, marcadores, globo y enlace al primer IGate.

import { visualPosition } from "./playback.js";
import { addStationEntities, describeFirstIgate } from "./stations.js";
import { createBalloonAssembly, VISUAL_AID } from "./balloon.js";
import { createBaseMap } from "./terrain.js";

const Cesium = window.Cesium;

// Base cartográfica por defecto, sin credenciales: teselas de OpenStreetMap sobre el elipsoide.
// Con token de Cesium Ion (config.local.js) js/terrain.js la reemplaza por imaginería satelital
// y relieve 3D; si falla, se conserva esta base.
const OSM_URL = "https://tile.openstreetmap.org/";

// El marcador simple del globo solo se ve con la cámara lejos; de cerca se ve el conjunto 3D.
// Los marcadores de inicio/fin/máximo se ocultan de muy cerca para no tapar el conjunto 3D.
const HIDE_WHEN_NEAR = new Cesium.DistanceDisplayCondition(300, Number.MAX_VALUE);

const MARKER_FAR_ONLY = new Cesium.DistanceDisplayCondition(VISUAL_AID.maxAidDistanceM, Number.MAX_VALUE);

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
  const pathCartesians = flight.map((tx) => toCartesian(tx.position.lat, tx.position.lon, tx.altitudeGpsM));
  viewer.entities.add({
    id: "flight-path",
    polyline: {
      positions: pathCartesians,
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
    position: pathCartesians[0],
    text: `Inicio · frame ${first.frameNumber}`,
    color: Cesium.Color.LIME,
  });
  labelledPoint(viewer, {
    id: "marker-end",
    position: pathCartesians[pathCartesians.length - 1],
    text: `Fin · frame ${last.frameNumber}`,
    color: Cesium.Color.RED,
  });
  labelledPoint(viewer, {
    id: "marker-max",
    position: pathCartesians[maxIndex],
    text: `Máx. altitud · frame ${max.frameNumber} · ${max.altitudeGpsM.toFixed(0)} m`,
    color: Cesium.Color.YELLOW,
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
      show: new Cesium.CallbackProperty(() => currentLinkStation() !== null, false),
    },
  });

  // --- Cámara ---
  const sphere = Cesium.BoundingSphere.fromPoints(pathCartesians);
  let mode = "overview";

  function flyToOverview(duration) {
    viewer.trackedEntity = undefined;
    viewer.camera.flyToBoundingSphere(sphere, {
      duration,
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-40), sphere.radius * 3),
    });
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
  viewer.camera.cancelFlight();
  viewer.camera.viewBoundingSphere(
    sphere,
    new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-40), sphere.radius * 3),
  );
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

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
