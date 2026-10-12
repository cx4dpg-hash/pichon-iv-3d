// Punto de entrada: carga los datos y conecta motor temporal, mapa 3D e interfaz.

import { loadData } from "./data.js";
import { Playback } from "./playback.js";
import { createMap } from "./map3d.js";
import { initUi } from "./ui.js";

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
  const map = createMap("cesiumContainer", data, playback);
  initUi({ data, playback, map });
  // Acceso para depuración desde la consola del navegador.
  window.pichon = { data, playback, map };
}

main().catch((error) => {
  console.error(error);
  showStatus(`Error: ${error.message}`);
});
