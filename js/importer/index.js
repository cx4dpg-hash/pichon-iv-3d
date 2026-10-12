// Orquestador de la importación: parseo → matching → índice de recepciones → estadísticas.
// Sin DOM y sin red: todo ocurre en memoria, en el navegador (o en Node para las pruebas).

import { parseLog } from "./parser.js";
import { createMatcher } from "./matcher.js";
import { annotateAndIndex, computeStats } from "./stats.js";

export { COORD_TOLERANCE_DEG, MIN_MATCHED_FIELDS } from "./matcher.js";

const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * @param {string} text contenido del archivo (ya leído localmente con la File API)
 * @param {{master: object, targetCallsign: string, stationPosition?: object|null}} options
 *   master: { flight, postFlight, preFlight } de transmissions.json (no se modifica)
 */
export async function importLog(text, { master, targetCallsign, stationPosition = null }) {
  const parsed = await parseLog(text, { targetCallsign, shouldYield: yieldToBrowser });
  const matcher = createMatcher(master);

  const results = [];
  for (let i = 0; i < parsed.packets.length; i++) {
    const packet = parsed.packets[i];
    results.push({ packet, ...matcher.match(packet) });
    if (i % 5000 === 4999) await yieldToBrowser();
  }

  const index = annotateAndIndex(results);
  const stats = computeStats({ parsed, results, master, index, stationPosition });
  return { parsed, results, index, stats };
}

/** Recalcula solo las estadísticas (p. ej. al cambiar la posición de la estación). */
export function recomputeStats(imported, { master, stationPosition = null }) {
  return computeStats({
    parsed: imported.parsed,
    results: imported.results,
    master,
    index: imported.index,
    stationPosition,
  });
}
