// Punto de entrada: carga los datos y conecta motor temporal, mapa 3D e interfaz.

import { loadData } from "./data.js";
import { Playback } from "./playback.js";
import { buildDiameterModel } from "./physics.js";
import { createMap } from "./map3d.js";
import { initUi } from "./ui.js";
import { createCharts } from "./charts.js";
import { initReception } from "./reception.js";
import { verticalSpeedsMs } from "./derived.js";
import { initCompass } from "./compass.js";
import { addRecovery } from "./recovery.js";
import { initTerrainFloor } from "./terrainfloor.js";
import { initClouds3D } from "./clouds3d.js";
import { initPanelToggle, initPresentation } from "./presentation.js";

function showStatus(message) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.hidden = false;
}

async function main() {
  if (!window.Cesium) {
    throw new Error("No se pudo cargar CesiumJS desde el CDN (¿sin conexión a Internet?)");
  }
  const data = await loadData();
  const playback = new Playback(data.times);
  const diameterModel = buildDiameterModel(data.flight, data.initialBalloonDiameterM, data.maxIndex);
  const map = createMap("cesiumContainer", data, playback, diameterModel, window.PICHON_CONFIG ?? {});
  const verticalSpeeds = verticalSpeedsMs(data.flight, data.times);
  initUi({ data, playback, map, diameterModel, verticalSpeeds });
  const charts = createCharts({
    data,
    playback,
    diameterModel,
    // Clic en un punto: salta a esa transmisión sin iniciar Play.
    seekToIndex: (index) => playback.seekToIndex(index),
  });
  playback.onChange(() => charts.sync());
  const reception = initReception({ data, playback, map });
  const compass = initCompass({ viewer: map.viewer });
  addRecovery(map.viewer, { data, playback, map });
  initTerrainFloor({ data, playback, map });
  const clouds3d = initClouds3D({ viewer: map.viewer, playback });
  const panelToggle = initPanelToggle();
  const presentation = initPresentation({ viewer: map.viewer });
  // Acceso para depuración desde la consola del navegador.
  window.pichon = { data, playback, map, diameterModel, charts, reception, verticalSpeeds, compass, clouds3d, panelToggle, presentation };
}

main().catch((error) => {
  console.error(error);
  showStatus(`Error: ${error.message}`);
});
