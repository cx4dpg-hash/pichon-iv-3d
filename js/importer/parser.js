// Parser de logs de recepción: elige un adaptador de formato y convierte cada línea en un
// paquete parseado (ver adapters.js). No hace ninguna petición de red ni interpreta el
// contenido más allá de extraer campos; el contenido del archivo es no confiable.

import { createAdapters } from "./adapters.js";

/** Divide el texto en líneas aceptando CRLF, LF y CR; ignora BOM y el salto final. */
export function splitLines(text) {
  if (text === "") return [];
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n|\r/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * @param {string} text contenido del archivo
 * @param {{targetCallsign: string, shouldYield?: () => Promise<void>, chunkSize?: number}} options
 * @returns {Promise<{adapterId:string|null, adapterName:string|null, fileLines:number,
 *   emptyLines:number, ignoredLines:number, packets:object[]}>}
 */
export async function parseLog(text, { targetCallsign, shouldYield, chunkSize = 5000 }) {
  const lines = splitLines(text);
  const result = {
    adapterId: null,
    adapterName: null,
    fileLines: lines.length,
    emptyLines: 0,
    ignoredLines: 0,
    packets: [],
  };
  if (lines.length === 0) return result;

  const adapter = createAdapters(targetCallsign).find((a) => a.detect(lines));
  result.adapterId = adapter.id;
  result.adapterName = adapter.name;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      result.emptyLines++;
    } else {
      const packet = adapter.parseLine(line, i + 1);
      if (packet) result.packets.push(packet);
      else result.ignoredLines++; // otra estación, cabecera, comentario o texto ajeno
    }
    // Cede el control al navegador en archivos grandes para no bloquear la interfaz.
    if (shouldYield && i % chunkSize === chunkSize - 1) await shouldYield();
  }
  // La cabecera de un CSV no es un paquete ni una línea ajena "de datos", pero sí una línea ignorada.
  return result;
}
