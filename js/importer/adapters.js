// Adaptadores de formato para logs de recepción. Cada adaptador sabe reconocer un formato y
// convertir UNA línea en un paquete "parseado" con la forma común descrita abajo. Los campos
// que el log no trae quedan en null: nunca se inventan.
//
// Formato soportado (probado):
//   - "direwolf-csv": CSV decodificado de Dire Wolf (cabecera chan,utime,isotime,source,...).
//     Verificado con un log real (imports/source/cx4dpg-reception-2026-10-11.log).
//   - "aprs-packet": paquete APRS en texto plano ("CX1AA-11>APE002,...:..."), con cualquier
//     texto antes/después en la línea. Verificado solo con fixtures derivados del maestro y con
//     el formato de APRS.fi; NO se ha probado con logs reales de otros programas.
//
// Forma común de un paquete parseado:
//   lineNumber, line, adapter,
//   externalTimestamp, externalTimezoneKnown, externalTimezone, externalEpochMs,
//   rawPacket, path, igate,
//   aprsTime ("HHMMSS" UTC) , frameNumber, lat, lon, altitudeGpsFt, altitudeGpsM,
//   courseDeg, speedRaw, telemetry, logicalPayload, trailingNotes, extra, parseNotes

export const MAX_STORED_LINE_CHARS = 2000;

// --- utilidades comunes -----------------------------------------------------------------

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

function emptyPacket(lineNumber, line, adapter) {
  return {
    lineNumber,
    line: line.length > MAX_STORED_LINE_CHARS ? `${line.slice(0, MAX_STORED_LINE_CHARS)}…` : line,
    adapter,
    externalTimestamp: null,
    externalTimezoneKnown: false,
    externalTimezone: null,
    externalEpochMs: null,
    rawPacket: null,
    path: null,
    igate: null,
    aprsTime: null,
    frameNumber: null,
    lat: null,
    lon: null,
    altitudeGpsFt: null,
    altitudeGpsM: null,
    courseDeg: null,
    speedRaw: null,
    telemetry: null,
    logicalPayload: null,
    trailingNotes: [],
    extra: {},
    parseNotes: [],
  };
}

const TELEMETRY_FULL =
  /;(\d+);([GP]);(-?\d+);(-?\d+);(-?\d+);(-?\d+);(-?\d+);(\d+);(\d+);(\d+);(\d+)/;
const TELEMETRY_FRAME_ONLY = /;(\d+);([GP])(?=;|$)/;

/** Extrae frame y telemetría del texto (payload APRS o columna "comment"). */
function parseTelemetry(text) {
  const full = TELEMETRY_FULL.exec(text);
  if (full) {
    const n = (i) => Number(full[i]);
    return {
      end: full.index + full[0].length,
      frameNumber: n(1),
      telemetry: {
        mode: full[2],
        internalTemperatureC: n(3),
        externalTemperatureC: n(4),
        pressureHpa: n(5),
        humidityPercent: n(6),
        barometricAltitudeM: n(7),
        batteryRaw: n(8),
        gpsQuality: n(9),
        satellites: n(10),
        gpsStatus: n(11),
      },
    };
  }
  const partial = TELEMETRY_FRAME_ONLY.exec(text);
  if (partial) {
    return { end: partial.index + partial[0].length, frameNumber: Number(partial[1]), telemetry: null };
  }
  return null;
}

/** Marca de tiempo externa (antes del paquete). No se asume zona horaria si no está indicada. */
function parseExternalTimestamp(prefix, packet) {
  const iso = /(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?\s*(Z|UTC|[+-]\d{2}(?::?\d{2})?)?/i.exec(prefix);
  if (iso) {
    packet.externalTimestamp = iso[0].trim();
    setTimezone(packet, iso[1], iso[2], iso[3] ?? null);
    return;
  }
  const timeOnly = /\b\d{2}:\d{2}:\d{2}\b/.exec(prefix);
  if (timeOnly) packet.externalTimestamp = timeOnly[0];
}

function setTimezone(packet, date, time, tzText) {
  if (!tzText) {
    packet.externalTimezoneKnown = false;
    return;
  }
  packet.externalTimezone = tzText.toUpperCase();
  packet.externalTimezoneKnown = true;
  let offset = "Z";
  const t = /^([+-])(\d{2}):?(\d{2})?$/.exec(tzText);
  if (t) offset = `${t[1]}${t[2]}:${t[3] ?? "00"}`;
  const ms = Date.parse(`${date}T${time}${offset}`);
  packet.externalEpochMs = Number.isNaN(ms) ? null : ms;
}

/** Parte "estructurada" del info field de un paquete de posición APRS. */
function parseAprsInfo(info, packet) {
  let pos = -1;
  const dti = info[0];
  if (dti === "/" || dti === "@") {
    pos = 1;
    const t = /^(\d{6})([hz/])/.exec(info.slice(1));
    if (t) {
      if (t[2] === "h") packet.aprsTime = t[1];
      else packet.parseNotes.push(`formato de hora APRS no soportado (${t[2]})`);
      pos = 1 + t[0].length;
    }
  } else if (dti === "!" || dti === "=") {
    pos = 1;
  }

  let cursor = 0; // fin de lo reconocido dentro de `info`
  if (pos >= 0) {
    const p = /^(\d{2})(\d{2}\.\d{2})([NS])(.)(\d{3})(\d{2}\.\d{2})([EW])(.)/.exec(info.slice(pos));
    if (p) {
      const lat = Number(p[1]) + Number(p[2]) / 60;
      const lon = Number(p[5]) + Number(p[6]) / 60;
      packet.lat = round6(p[3] === "S" ? -lat : lat);
      packet.lon = round6(p[7] === "W" ? -lon : lon);
      cursor = pos + p[0].length;
      const cs = /^(\d{3})\/(\d{3})/.exec(info.slice(cursor));
      if (cs) {
        packet.courseDeg = Number(cs[1]);
        packet.speedRaw = Number(cs[2]);
        cursor += cs[0].length;
      }
    }
  }
  const alt = /\/A=(-?\d{6})/.exec(info.slice(cursor));
  if (alt) {
    packet.altitudeGpsFt = Number(alt[1]);
    cursor += alt.index + alt[0].length;
  }
  const tel = parseTelemetry(info.slice(cursor));
  if (tel) {
    packet.frameNumber = tel.frameNumber;
    packet.telemetry = tel.telemetry;
    cursor += tel.end;
  }
  // Parte lógica del payload: lo reconocido, sin el path ni el texto libre posterior.
  packet.logicalPayload = cursor > 0 ? info.slice(0, cursor) : null;
}

// --- adaptador: paquete APRS en texto plano --------------------------------------------------

export function createAprsPacketAdapter(targetCallsign) {
  const escaped = targetCallsign.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const finder = new RegExp(`(?<![A-Za-z0-9-])${escaped}>`, "i");
  return {
    id: "aprs-packet",
    name: "Paquete APRS en texto (CALL>PATH:payload)",
    detect: () => true, // adaptador genérico: se usa si ningún formato específico aplica
    parseLine(line, lineNumber) {
      const idx = line.search(finder);
      if (idx < 0) return null;
      const packet = emptyPacket(lineNumber, line, "aprs-packet");
      parseExternalTimestamp(line.slice(0, idx), packet);

      // Fin del paquete: si venía entre comillas (CSV), hasta la comilla de cierre.
      let tail = line.slice(idx);
      const quote = idx > 0 ? line[idx - 1] : "";
      if (quote === '"' || quote === "'") {
        const close = tail.indexOf(quote);
        if (close >= 0) tail = tail.slice(0, close);
      }
      // Advertencias de APRS.fi al final: "[...]" (se conservan aparte).
      const bracket = /(\s*\[[^\]]*\])+\s*$/.exec(tail);
      if (bracket) {
        packet.trailingNotes = [...bracket[0].matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]);
        tail = tail.slice(0, bracket.index);
      }
      packet.rawPacket = tail.trim();

      const header = /^([^>\s]+)>([^:]*):/.exec(packet.rawPacket);
      if (!header) {
        packet.parseNotes.push("no se pudo separar cabecera y payload");
        return packet;
      }
      packet.path = header[2];
      const q = header[2].split(",");
      const qi = q.findIndex((p) => /^qA[A-Za-z]$/.test(p));
      if (qi >= 0 && q[qi + 1]) packet.igate = q[qi + 1];
      parseAprsInfo(packet.rawPacket.slice(header[0].length), packet);
      return packet;
    },
  };
}

// --- adaptador: CSV de Dire Wolf ------------------------------------------------------------

/** Divide una línea CSV respetando comillas dobles (RFC 4180 básico). */
export function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const DIREWOLF_REQUIRED = ["isotime", "source", "latitude", "longitude", "altitude", "comment"];

export function createDirewolfCsvAdapter(targetCallsign) {
  const target = targetCallsign.toUpperCase();
  let columns = null; // nombre → índice
  let headerLine = -1;
  return {
    id: "direwolf-csv",
    name: "CSV decodificado de Dire Wolf",
    detect(lines) {
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const names = splitCsvLine(lines[i].replace(/^﻿/, "")).map((s) => s.trim().toLowerCase());
        if (names[0] === "chan" && DIREWOLF_REQUIRED.every((r) => names.includes(r))) {
          columns = Object.fromEntries(names.map((n, k) => [n, k]));
          headerLine = i;
          return true;
        }
        return false; // solo se mira la primera línea no vacía
      }
      return false;
    },
    parseLine(line, lineNumber) {
      if (lineNumber - 1 === headerLine || !line.trim()) return null;
      const f = splitCsvLine(line);
      const col = (name) => (columns[name] !== undefined ? (f[columns[name]] ?? "").trim() : "");
      if (col("source").toUpperCase() !== target) return null;

      const packet = emptyPacket(lineNumber, line, "direwolf-csv");
      if (f.length !== Object.keys(columns).length) {
        packet.parseNotes.push(`número de columnas inesperado (${f.length})`);
      }
      const iso = col("isotime");
      if (iso) {
        packet.externalTimestamp = iso;
        const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(iso);
        if (m) setTimezone(packet, m[1], m[2], m[3] ?? null);
      }
      const lat = col("latitude");
      const lon = col("longitude");
      if (lat !== "" && lon !== "" && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
        packet.lat = round6(Number(lat));
        packet.lon = round6(Number(lon));
      }
      const alt = col("altitude");
      if (alt !== "" && Number.isFinite(Number(alt))) {
        // El CSV trae metros (1 decimal); el campo APRS original es A= en pies.
        packet.altitudeGpsM = Number(alt);
        packet.altitudeGpsFt = Math.round(Number(alt) / 0.3048);
        packet.parseNotes.push("altitud en pies derivada de metros del CSV (redondeo)");
      }
      if (col("course") !== "") packet.courseDeg = Number(col("course"));
      if (col("speed") !== "") packet.speedRaw = Number(col("speed"));

      const tel = parseTelemetry(col("comment"));
      if (tel) {
        packet.frameNumber = tel.frameNumber;
        packet.telemetry = tel.telemetry;
      }
      // Este formato no contiene el paquete crudo ni la hora interna APRS (hhmmssh).
      for (const name of ["chan", "utime", "heard", "level", "error", "dti", "symbol"]) {
        if (col(name) !== "") packet.extra[name] = col(name);
      }
      return packet;
    },
  };
}

/** Adaptadores en orden de preferencia (los específicos primero). */
export function createAdapters(targetCallsign) {
  return [createDirewolfCsvAdapter(targetCallsign), createAprsPacketAdapter(targetCallsign)];
}
