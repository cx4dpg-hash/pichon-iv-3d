// "Mi recepción": carga local de un log, resultados, resaltado sobre la trayectoria y estado
// por transmisión durante la reproducción.
//
// Todo se procesa en el navegador con la File API: el contenido del archivo no se envía a
// ningún servidor ni se guarda (ni en localStorage). El contenido es no confiable, así que
// todo texto derivado del archivo se inserta con textContent (nunca innerHTML).
//
// La recepción local es independiente de firstIgate: que mi estación haya recibido una trama
// no implica que fuera la primera en llevarla a APRS-IS (ni que la enviara).

import { importLog, recomputeStats } from "./importer/index.js";
import { formatLocalTime } from "./format.js";

const Cesium = window.Cesium;

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".log", ".txt", ".csv"];
const MAX_TABLE_ROWS = 500;
const STATUS_LABEL = {
  exact: "exacta",
  probable: "probable",
  ambiguous: "ambigua",
  unmatched: "sin coincidencia",
};

const $ = (id) => document.getElementById(id);

function hhmmss(raw) {
  return raw ? `${raw.slice(0, 2)}:${raw.slice(2, 4)}:${raw.slice(4, 6)} UTC` : "—";
}

function validCoords(latText, lonText) {
  if (latText.trim() === "" || lonText.trim() === "") return null;
  const lat = Number(latText.replace(",", "."));
  const lon = Number(lonText.replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function initReception({ data, playback, map }) {
  const { flight } = data;
  const master = { flight: data.flight, postFlight: data.postFlight, preFlight: data.preFlight, preLaunch: data.preLaunch };
  const viewer = map.viewer;

  const state = {
    fileName: null,
    imported: null,
    showMine: true,
    type: "unknown",
    callsign: "",
    station: null, // { lat, lon } solo si es fija y las coordenadas son válidas
  };

  // --- Capa 3D: puntos sobre la trayectoria maestra (no la reemplazan) ---
  const points = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
  const pointByIndex = flight.map((tx) =>
    points.add({
      position: Cesium.Cartesian3.fromDegrees(tx.position.lon, tx.position.lat, tx.altitudeGpsM),
      pixelSize: 10,
      color: Cesium.Color.fromCssColorString("#ff3df2"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 1,
      show: false,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    }),
  );

  // Estación fija del usuario y su enlace (solo si es fija y con coordenadas válidas).
  // Con relieve activo se usa la altura de terreno consultada (solo representación); si no, 0.
  const stationCartesian = () =>
    state.station
      ? Cesium.Cartesian3.fromDegrees(state.station.lon, state.station.lat, state.station.heightM ?? 0)
      : undefined;
  let heightTimer = null;
  function requestStationHeight() {
    clearTimeout(heightTimer);
    if (!state.station || map.baseMap.mode !== "ion") return;
    const target = state.station;
    heightTimer = setTimeout(async () => {
      try {
        const h = await map.baseMap.sampleHeight(target.lat, target.lon);
        if (h !== null && state.station === target) target.heightM = h;
      } catch {
        /* sin relieve disponible: se queda en 0 */
      }
    }, 400);
  }
  const stationEntity = viewer.entities.add({
    id: "my-station",
    show: false,
    position: new Cesium.CallbackProperty(stationCartesian, false),
    point: {
      pixelSize: 11,
      color: Cesium.Color.fromCssColorString("#ff3df2"),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 1,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: new Cesium.CallbackProperty(() => state.callsign || "Mi estación", false),
      font: "13px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -14),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
  const receivedNow = () => {
    if (!state.imported) return false;
    return state.imported.index.received.has(flight[playback.index].id);
  };
  const linkEntity = viewer.entities.add({
    id: "my-station-link",
    polyline: {
      positions: new Cesium.CallbackProperty(() => {
        const from = stationCartesian();
        return from ? [from, map.assembly.getPose().payloadCenter] : [];
      }, false),
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.fromCssColorString("#ff3df2"),
        dashLength: 10,
      }),
      arcType: Cesium.ArcType.NONE,
      show: new Cesium.CallbackProperty(
        () => !playback.inFinalPhase && state.showMine && state.type === "fixed" && !!state.station && receivedNow(),
        false,
      ),
    },
  });

  playback.onGeometryChange(() => {
    flight.forEach((tx, i) => {
      pointByIndex[i].position = Cesium.Cartesian3.fromDegrees(
        tx.position.lon,
        tx.position.lat,
        playback.displayAltM?.[i] ?? tx.altitudeGpsM,
      );
    });
  });

  function refreshMap() {
    const received = state.imported?.index.received;
    flight.forEach((tx, i) => {
      pointByIndex[i].show = !!received && received.has(tx.id);
    });
    points.show = state.showMine;
    stationEntity.show = state.showMine && state.type === "fixed" && !!state.station;
  }

  // --- Fila "Mi estación" del panel (recepción local; distinta de First IGate) ---
  function renderPanelRow() {
    const cell = $("pMyStation");
    if (!state.imported) {
      cell.textContent = "— (sin log cargado)";
      return;
    }
    const id = flight[playback.index].id;
    const rec = state.imported.index.received.get(id);
    let text;
    if (!rec) text = "no registrada";
    else if (rec.count === 1) text = "recibida";
    else text = `Recibida · ${rec.count} registros`;
    const amb = state.imported.index.ambiguous.get(id);
    if (amb) text += ` (posible coincidencia ambigua en ${amb} línea${amb > 1 ? "s" : ""})`;
    cell.textContent = text;
  }

  // --- Estadísticas y tabla ---
  function renderStats() {
    const box = $("importStats");
    if (!state.imported) {
      box.hidden = true;
      return;
    }
    const stats = recomputeStats(state.imported, { master, stationPosition: state.station });
    const tx = (t) => `frame ${t.frameNumber} · ${formatLocalTime(Date.parse(t.packetTimestampUtc))}`;
    const rows = [
      ["Transmisiones del vuelo", String(stats.flightTotal)],
      ["Recibidas por mi estación", `${stats.flightReceived} (cobertura ${stats.coveragePercent.toFixed(1)} %)`],
      ["Primera recibida", stats.first ? tx(stats.first) : "—"],
      ["Última recibida", stats.last ? tx(stats.last) : "—"],
      ["Frame más alto recibido", stats.highestFrame ? String(stats.highestFrame.frameNumber) : "—"],
      [
        "Altitud GPS máxima recibida",
        stats.maxAltitude ? `${stats.maxAltitude.altitudeGpsM.toFixed(0)} m (frame ${stats.maxAltitude.frameNumber})` : "—",
      ],
      ["Líneas del archivo", `${stats.fileLines} (${stats.packetLines} de CX1AA-11, ${stats.ignoredLines} ignoradas, ${stats.emptyLines} vacías)`],
      ["Duplicados del archivo", String(stats.duplicateLines)],
      ["Exactas / probables", `${stats.byStatus.exact} / ${stats.byStatus.probable}`],
      ["Ambiguas / sin coincidencia", `${stats.byStatus.ambiguous} / ${stats.byStatus.unmatched}`],
    ];
    if (stats.postFlightReceived || stats.preFlightReceived || stats.preLaunchReceived) {
      rows.push([
        "Fuera del vuelo efectivo",
        `${stats.postFlightReceived} post-vuelo, ${stats.preLaunchReceived} en tierra (preLaunch), ${stats.preFlightReceived} sin GPS (no cuentan en la cobertura)`,
      ]);
    }
    if (state.type === "fixed" && state.station) {
      rows.push([
        "Distancia horizontal máxima",
        stats.maxDistance
          ? `≈ ${stats.maxDistance.km.toFixed(1)} km (frame ${stats.maxDistance.tx.frameNumber}; sobre la superficie, sin altitud)`
          : "—",
      ]);
    }
    box.replaceChildren(
      ...rows.flatMap(([k, v]) => {
        const dt = document.createElement("dt");
        dt.textContent = k;
        const dd = document.createElement("dd");
        dd.textContent = v;
        return [dt, dd];
      }),
    );
    box.hidden = false;
  }

  function renderTable() {
    const details = $("importResults");
    const table = $("resultsTable");
    if (!state.imported) {
      details.hidden = true;
      return;
    }
    const { results } = state.imported;
    $("resultsSummary").textContent = `Resultados (${results.length} paquetes de CX1AA-11)`;
    const head = document.createElement("tr");
    for (const h of ["Línea", "Frame", "Hora APRS", "Estado", "Transmisión", "Notas"]) {
      const th = document.createElement("th");
      th.textContent = h;
      head.appendChild(th);
    }
    const body = results.slice(0, MAX_TABLE_ROWS).map((r) => {
      const tr = document.createElement("tr");
      tr.className = `status-${r.status}`;
      let target = "—";
      if (r.match) {
        const t = data[r.match.group][r.match.index];
        target = `${r.match.group} · frame ${t.frameNumber} · ${formatLocalTime(Date.parse(t.packetTimestampUtc ?? t.firstReceivedAtLocal))}`;
      } else if (r.candidates.length > 1) target = `${r.candidates.length} posibles`;
      const notes = [...r.notes];
      if (r.duplicateOfLine !== null) notes.unshift(`duplicado de la línea ${r.duplicateOfLine}`);
      if (r.packet.externalTimestamp) {
        notes.push(
          `hora externa: ${r.packet.externalTimestamp}${r.packet.externalTimezoneKnown ? "" : " (zona desconocida)"}; no se usa para decidir`,
        );
      }
      const cells = [
        r.packet.lineNumber,
        r.packet.frameNumber ?? "—",
        hhmmss(r.packet.aprsTime),
        STATUS_LABEL[r.status],
        target,
        notes.join(" · "),
      ];
      for (const c of cells) {
        const td = document.createElement("td");
        td.textContent = String(c);
        tr.appendChild(td);
      }
      return tr;
    });
    table.replaceChildren(head, ...body);
    $("resultsNote").textContent =
      results.length > MAX_TABLE_ROWS ? `Mostrando ${MAX_TABLE_ROWS} de ${results.length} filas.` : "";
    details.hidden = false;
  }

  function renderAll() {
    refreshMap();
    renderPanelRow();
    renderStats();
    renderTable();
  }

  function setMessage(text, isError = false) {
    const el = $("importMessage");
    el.textContent = text;
    el.className = isError ? "error" : "";
  }

  // --- Entrada del usuario ---
  const fileInput = $("logFile");
  $("btnLoadLog").addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const name = file.name;
    const lower = name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      setMessage(`Formato no soportado: se aceptan ${ALLOWED_EXTENSIONS.join(", ")}.`, true);
      fileInput.value = "";
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setMessage("El archivo supera el máximo de 50 MB.", true);
      fileInput.value = "";
      return;
    }
    state.fileName = name;
    $("logFileName").textContent = name;
    setMessage("Procesando localmente…");
    try {
      const text = await file.text(); // lectura local; no hay ninguna petición de red
      state.imported = await importLog(text, { master, targetCallsign: data.flightMeta.callsign });
      const { parsed, results } = state.imported;
      if (parsed.fileLines === 0) setMessage("El archivo está vacío.");
      else if (results.length === 0) {
        setMessage(`No se encontraron paquetes de ${data.flightMeta.callsign} en el archivo.`);
      } else {
        setMessage(`Formato detectado: ${parsed.adapterName}.`);
      }
      renderAll();
    } catch (error) {
      console.error(error);
      state.imported = null;
      setMessage(`No se pudo procesar el archivo: ${error.message}`, true);
      renderAll();
    } finally {
      fileInput.value = ""; // permite volver a cargar el mismo archivo
    }
  });

  function readStationInputs() {
    state.callsign = $("myCallsign").value.trim().toUpperCase();
    state.type = $("myType").value;
    $("fixedCoords").hidden = state.type !== "fixed";
    // Móvil o desconocida: nunca se inventa ni se usa una posición.
    state.station =
      state.type === "fixed" ? validCoords($("myLat").value, $("myLon").value) : null;
    requestStationHeight();
    const coordsGiven = $("myLat").value.trim() !== "" || $("myLon").value.trim() !== "";
    $("coordsMessage").textContent =
      state.type === "fixed" && coordsGiven && !state.station ? "Coordenadas no válidas: se ignoran." : "";
    if (state.imported) renderAll();
    else refreshMap();
  }
  for (const id of ["myCallsign", "myType", "myLat", "myLon"]) $(id).addEventListener("input", readStationInputs);

  $("toggleMine").addEventListener("change", (event) => {
    state.showMine = event.target.checked;
    refreshMap();
  });

  const toggle = $("btnReception");
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Mi recepción ▾" : "Mi recepción ▸";
    $("receptionBody").hidden = !open;
  });

  playback.onChange(renderPanelRow);
  readStationInputs();
  renderPanelRow();

  return { state, refresh: renderAll };
}
