// Base cartográfica: mapa básico (OpenStreetMap, elipsoide) o, con token de Cesium Ion,
// imaginería satelital + relieve 3D (Cesium World Imagery / World Terrain).
//
// - Sin token, o con un token inválido, la aplicación sigue funcionando con el mapa básico.
// - El token nunca se imprime, no se muestra en la interfaz ni se guarda en el repositorio.
// - El relieve es SOLO de representación: no modifica lat, lon, altitudeGpsM ni la trayectoria.
//   Las alturas de terreno consultadas en tiempo de ejecución (estaciones, informe de
//   separación) no se guardan en ningún JSON ni se presentan como mediciones.

import { setStationHeight } from "./stations.js";

const Cesium = window.Cesium;

const LABEL_BASIC = "Mapa básico · sin relieve";
const LABEL_ION = "Satélite + relieve 3D";

export function createBaseMap(viewer, osmLayer, { token, flight, stations }) {
  const badge = document.getElementById("mapMode");
  const state = {
    mode: "basic",
    terrainProvider: null,
    terrainReport: null,
    ready: Promise.resolve(),
    /** Altura de terreno (m, elipsoidal) en un punto, o null si no hay relieve. */
    sampleHeight: async () => null,
  };

  function setBadge(text, title = "") {
    if (!badge) return;
    badge.textContent = text;
    badge.title = title;
  }
  setBadge(LABEL_BASIC, "Sin token de Cesium Ion: OpenStreetMap sobre elipsoide, sin relieve.");

  if (typeof token === "string" && token.trim() !== "") {
    state.ready = activateIon(token.trim());
  }

  async function activateIon(ionToken) {
    try {
      Cesium.Ion.defaultAccessToken = ionToken;
      const [imagery, terrain] = await Promise.all([
        Cesium.createWorldImageryAsync(),
        Cesium.createWorldTerrainAsync(),
      ]);
      viewer.imageryLayers.addImageryProvider(imagery, 0); // al fondo, bajo cualquier otra capa
      viewer.imageryLayers.remove(osmLayer, true);
      viewer.scene.globe.terrainProvider = terrain;
      viewer.scene.globe.depthTestAgainstTerrain = true;
      viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
      state.mode = "ion";
      state.terrainProvider = terrain;
      state.sampleHeight = async (lat, lon) => {
        const [c] = await Cesium.sampleTerrainMostDetailed(terrain, [
          Cesium.Cartographic.fromDegrees(lon, lat),
        ]);
        return Number.isFinite(c.height) ? c.height : null;
      };
      setBadge(LABEL_ION, "Cesium World Imagery + World Terrain (Cesium Ion).");
    } catch {
      // No se registra el error: podría contener la URL con el token.
      console.info("Cesium Ion no disponible (token ausente, inválido o sin conexión): se usa el mapa básico.");
      return;
    }

    try {
      await sampleStations();
      await buildTerrainReport();
    } catch {
      console.info("No se pudieron consultar alturas de terreno; se mantienen valores por defecto.");
    }
  }

  // Alturas de terreno de las estaciones fijas: solo para representación.
  async function sampleStations() {
    const known = stations.filter((s) => s.position.lat !== null && s.position.lon !== null);
    const cartographics = known.map((s) => Cesium.Cartographic.fromDegrees(s.position.lon, s.position.lat));
    const sampled = await Cesium.sampleTerrainMostDetailed(state.terrainProvider, cartographics);
    known.forEach((s, i) => {
      if (Number.isFinite(sampled[i].height)) setStationHeight(s.callsign, sampled[i].height);
    });
  }

  // Informe de separación entre la altitud GPS de la carga y el terreno bajo ella.
  // No corrige nada: solo informa posibles inconsistencias (p. ej. a baja altitud).
  async function buildTerrainReport() {
    const cartographics = flight.map((tx) => Cesium.Cartographic.fromDegrees(tx.position.lon, tx.position.lat));
    const sampled = await Cesium.sampleTerrainMostDetailed(state.terrainProvider, cartographics);
    let min = null;
    const below = [];
    flight.forEach((tx, i) => {
      const h = sampled[i].height;
      if (!Number.isFinite(h)) return;
      const clearance = tx.altitudeGpsM - h;
      if (!min || clearance < min.clearanceM) min = { clearanceM: clearance, frame: tx.frameNumber, terrainM: h };
      if (clearance < 0) below.push(tx.frameNumber);
    });
    state.terrainReport = { samples: flight.length, min, belowTerrainFrames: below };
    if (min) {
      const text =
        `Separación GPS–terreno mínima: ${min.clearanceM.toFixed(0)} m (frame ${min.frame}).` +
        (below.length ? ` Carga bajo el terreno en los frames: ${below.join(", ")}.` : "");
      setBadge(LABEL_ION, `${text} La altitud GPS no se modifica; no se corrige geoide/elipsoide.`);
      console.info(text);
    }
  }

  return state;
}
