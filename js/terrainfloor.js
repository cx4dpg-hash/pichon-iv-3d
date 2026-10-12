// Aplica la corrección VISUAL de altura al terreno (ver js/floor.js) cuando hay relieve activo.
// Solo cambia las altitudes de render (playback.displayAltM); nunca los datos.

import { terrainFloorAltitudes } from "./floor.js";

export function initTerrainFloor({ data, playback, map }) {
  const raw = data.flight.map((tx) => tx.altitudeGpsM);
  map.baseMap.ready.then(() => {
    const heights = map.baseMap.terrainHeights;
    if (map.baseMap.mode !== "ion" || !heights) return; // sin relieve no hay corrección
    const { display, corrections } = terrainFloorAltitudes(raw, heights);
    playback.setDisplayAltitudes(display, corrections);
    const applied = corrections.map((c, i) => [data.flight[i].frameNumber, c]).filter(([, c]) => c > 0.05);
    if (applied.length) {
      console.info(
        `Corrección visual al terreno aplicada (solo render) en ${applied.length} transmisiones; máx. ${Math.max(...applied.map(([, c]) => c)).toFixed(1)} m.`,
      );
    }
  });
}
