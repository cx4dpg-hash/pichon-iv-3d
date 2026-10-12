// Gráficos de telemetría (Chart.js, cargado por CDN) sincronizados con la reproducción.
//
// - Ocho gráficos creados UNA sola vez a partir de "flight": altitud, temperaturas, presión,
//   humedad, batería, velocidad GPS, curso GPS y recepción GPS.
// - Eje X común: packetTimestampUtc (hora de emisión de la trama) mostrado en hora local.
// - Un punto por transmisión real (155); nada se interpola ni se inventa. Las líneas son finas
//   y prácticamente rectas (tension 0); los puntos solo se dibujan en la transmisión vigente
//   y en las que tienen advertencias de APRS.fi, pero todos son seleccionables (hit radius).
// - El cursor vertical sigue el tiempo de reproducción (continuo); los valores numéricos del
//   panel siguen siendo los de la transmisión real vigente.
// - Durante la reproducción solo se mueven los cursores y se resalta el punto vigente cuando
//   cambia la transmisión; los gráficos no se recrean.

import { formatLocalTime, formatLocalTimeShort } from "./format.js";

const HALF_HOUR_MS = 30 * 60 * 1000; // Uruguay es UTC−3 (sin DST): las medias horas locales coinciden con las UTC.

const WARNING_COLOR = "#ff9f1c";
const GRID = "rgba(159,176,216,0.12)";
const TEXT = "#9fb0d8";

// Anchos de línea para datos normales (finos).
const LINE_MAIN = 1.5;
const LINE_THIN = 1.25;

/** Franja de la transición estimada y línea de la transmisión de máxima altitud (discretas). */
const flightMarksPlugin = {
  id: "flightMarks",
  beforeDatasetsDraw(chart, _args, opts) {
    const { ctx, chartArea, scales } = chart;
    const xa = scales.x.getPixelForValue(opts.maxTime);
    const xb = scales.x.getPixelForValue(opts.nextTime);
    ctx.save();
    ctx.fillStyle = "rgba(255, 90, 90, 0.16)";
    ctx.fillRect(xa, chartArea.top, Math.max(xb - xa, 3), chartArea.bottom - chartArea.top);
    ctx.restore();
  },
  afterDatasetsDraw(chart, _args, opts) {
    const { ctx, chartArea, scales } = chart;
    const xa = scales.x.getPixelForValue(opts.maxTime);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 225, 77, 0.55)";
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xa, chartArea.top);
    ctx.lineTo(xa, chartArea.bottom);
    ctx.stroke();
    if (opts.labels) {
      ctx.setLineDash([]);
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255, 225, 77, 0.85)";
      ctx.fillText(opts.maxLabel, xa - 5, chartArea.bottom - 22);
      ctx.fillStyle = "rgba(255, 154, 154, 0.9)";
      ctx.fillText(opts.transitionLabel, xa - 5, chartArea.bottom - 9);
    }
    ctx.restore();
  },
};

export function createCharts({ data, playback, diameterModel, seekToIndex }) {
  const Chart = window.Chart;
  if (!Chart) throw new Error("No se pudo cargar Chart.js desde el CDN (¿sin conexión a Internet?)");

  const { flight, times } = data;
  const t0 = times[0];
  const t1 = times[times.length - 1];

  // Advertencias de APRS.fi por transmisión (todas las recepciones), para marcador y tooltip.
  const warnings = flight.map((tx) =>
    tx.receptions.flatMap((r) => r.warnings.map((w) => `${r.igate}: ${w}`)),
  );

  const maxIndex = data.maxIndex;
  const transition = diameterModel.estimatedBurstTransition;
  const marks = {
    maxTime: times[maxIndex],
    nextTime: transition ? times[transition.firstDescentIndex] : times[maxIndex],
    maxLabel: `Máx. altitud · frame ${flight[maxIndex].frameNumber}`,
    transitionLabel: "Transición estimada de ruptura/descenso",
  };

  const state = { index: playback.index };

  const points = (valueOf) => flight.map((tx, i) => ({ x: times[i], y: valueOf(tx), i }));

  /**
   * Serie con línea fina. Opciones por serie (s): label, color, value(tx), unit, decimals,
   * axis, width, dash, segment, pickable.
   */
  const buildSeries = (s) => ({
    label: s.label,
    data: points(s.value),
    borderColor: s.color,
    backgroundColor: s.color,
    borderWidth: s.width ?? LINE_THIN,
    borderDash: s.dash ?? [],
    fill: false,
    tension: 0,
    yAxisID: s.axis ?? "y",
    // Puntos: solo la transmisión vigente y las que tienen advertencias (discretos).
    pointRadius: (ctx) => (ctx.raw.i === state.index ? 3.5 : warnings[ctx.raw.i].length ? 2.5 : 0),
    pointStyle: (ctx) => (warnings[ctx.raw.i].length ? "triangle" : "circle"),
    pointBackgroundColor: (ctx) =>
      ctx.raw.i === state.index ? s.color : warnings[ctx.raw.i].length ? WARNING_COLOR : s.color,
    pointBorderColor: (ctx) =>
      ctx.raw.i === state.index ? "#ffffff" : warnings[ctx.raw.i].length ? WARNING_COLOR : s.color,
    pointBorderWidth: (ctx) => (ctx.raw.i === state.index ? 1.5 : 1),
    pointHoverRadius: s.pickable === false ? 0 : 3,
    pointHitRadius: s.pickable === false ? 0 : 7,
    segment: s.segment,
    // metadatos para el tooltip
    _unit: s.unit ?? "",
    _decimals: s.decimals ?? 0,
    _pickable: s.pickable !== false,
  });

  const yAxis = (title, extra = {}) => ({
    title: { display: true, text: title, color: TEXT, font: { size: 10 } },
    ticks: { color: TEXT, font: { size: 10 } },
    grid: { color: GRID },
    ...extra,
  });

  const xAxis = {
    type: "linear",
    min: t0,
    max: t1,
    grid: { color: GRID },
    ticks: { color: TEXT, font: { size: 10 }, callback: (v) => formatLocalTimeShort(v) },
    afterBuildTicks(scale) {
      const ticks = [];
      for (let t = Math.ceil(t0 / HALF_HOUR_MS) * HALF_HOUR_MS; t <= t1; t += HALF_HOUR_MS) ticks.push({ value: t });
      scale.ticks = ticks;
    },
  };

  const batteryRaws = flight.map((tx) => tx.telemetry.batteryRaw);
  const bMin = Math.floor(Math.min(...batteryRaws) / 100) * 100;
  const bMax = Math.ceil(Math.max(...batteryRaws) / 100) * 100;

  // Curso: variable circular. El paso 359°→0° no se dibuja como una caída (segmento oculto) y
  // los puntos conservan su valor real.
  const hideWrap = {
    borderColor: (ctx) => (Math.abs(ctx.p1.parsed.y - ctx.p0.parsed.y) > 180 ? "rgba(0,0,0,0)" : undefined),
  };

  const tick = { color: TEXT, font: { size: 10 } };
  const definitions = [
    {
      canvasId: "chartAltitude",
      labels: true,
      series: [
        { label: "Altitud GPS", color: "#ffb000", value: (tx) => tx.altitudeGpsM, unit: "m", width: LINE_MAIN },
        { label: "Altitud barométrica", color: "#5ec8ff", value: (tx) => tx.telemetry.barometricAltitudeM, unit: "m" },
      ],
      scales: { y: yAxis("m") },
    },
    {
      canvasId: "chartTemperature",
      series: [
        { label: "Temp. interna", color: "#ff6b6b", value: (tx) => tx.telemetry.internalTemperatureC, unit: "°C" },
        { label: "Temp. externa", color: "#4da3ff", value: (tx) => tx.telemetry.externalTemperatureC, unit: "°C" },
      ],
      scales: { y: yAxis("°C") },
    },
    {
      canvasId: "chartPressure",
      series: [{ label: "Presión", color: "#b794f6", value: (tx) => tx.telemetry.pressureHpa, unit: "hPa", width: LINE_MAIN }],
      scales: { y: yAxis("hPa") },
    },
    {
      canvasId: "chartHumidity",
      series: [{ label: "Humedad externa", color: "#4dd6c1", value: (tx) => tx.telemetry.humidityPercent, unit: "%", width: LINE_MAIN }],
      scales: { y: yAxis("%", { min: 0, max: 100 }) },
    },
    {
      canvasId: "chartBattery",
      series: [
        { label: "batteryRaw (original)", color: "#7ee787", value: (tx) => tx.telemetry.batteryRaw, unit: "raw", width: LINE_MAIN },
        // Interpretación probable, no confirmada: línea punteada, sin selección, eje derecho.
        {
          label: "≈ V (probable, raw/1000)",
          color: "#d0d0d0",
          value: (tx) => tx.telemetry.batteryV,
          unit: "V",
          decimals: 3,
          axis: "y1",
          dash: [4, 3],
          width: 1,
          pickable: false,
        },
      ],
      scales: {
        y: yAxis("raw", { min: bMin, max: bMax }),
        y1: yAxis("≈ V (probable)", { position: "right", min: bMin / 1000, max: bMax / 1000, grid: { drawOnChartArea: false } }),
      },
    },
    {
      canvasId: "chartSpeed",
      series: [{ label: "Velocidad GPS", color: "#63e6be", value: (tx) => tx.speedKmh, unit: "km/h", decimals: 1, width: LINE_MAIN }],
      scales: { y: yAxis("km/h", { min: 0 }) },
    },
    {
      canvasId: "chartCourse",
      series: [{ label: "Curso GPS", color: "#f78fb3", value: (tx) => tx.courseDeg, unit: "°", segment: hideWrap, width: LINE_THIN }],
      scales: { y: yAxis("°", { min: 0, max: 360, ticks: { ...tick, stepSize: 90 } }) },
    },
    {
      canvasId: "chartGps",
      // Valores brutos: la semántica de calidad y estado no está documentada.
      series: [
        { label: "Satélites", color: "#ffd166", value: (tx) => tx.telemetry.satellites, unit: "", width: LINE_MAIN },
        { label: "Calidad GPS (valor bruto)", color: "#5ec8ff", value: (tx) => tx.telemetry.gpsQuality, unit: "", axis: "y1" },
        { label: "Estado GPS (valor bruto)", color: "#ff8fab", value: (tx) => tx.telemetry.gpsStatus, unit: "", axis: "y1", dash: [4, 3] },
      ],
      scales: {
        y: yAxis("satélites", { min: 0, max: 14, ticks: { ...tick, stepSize: 2 } }),
        y1: yAxis("calidad / estado (bruto)", {
          position: "right",
          min: 0,
          max: 3,
          ticks: { ...tick, stepSize: 1 },
          grid: { drawOnChartArea: false },
        }),
      },
    },
  ];

  const entries = definitions.map((def) => {
    const canvas = document.getElementById(def.canvasId);
    const cursor = canvas.parentElement.querySelector(".cursor");
    const entry = { chart: null, cursor, canvas, stale: false };
    entry.chart = new Chart(canvas, {
      type: "line",
      data: { datasets: def.series.map(buildSeries) },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "nearest", intersect: true },
        layout: { padding: { right: 4 } },
        onResize: () => refreshEntry(entry),
        onHover(event, elements) {
          event.native.target.style.cursor = elements.length ? "pointer" : "default";
        },
        // Clic en un punto real: salta a esa transmisión (no inicia Play).
        onClick(_event, elements) {
          if (elements.length) seekToIndex(elements[0].index);
        },
        scales: { x: xAxis, ...def.scales },
        plugins: {
          legend: {
            align: "end",
            labels: { color: TEXT, boxWidth: 14, boxHeight: 2, font: { size: 10 }, useBorderRadius: false },
          },
          flightMarks: { ...marks, labels: !!def.labels },
          tooltip: {
            filter: (item) => item.dataset._pickable,
            callbacks: {
              title: (items) => `Hora local: ${formatLocalTime(items[0].raw.x)}`,
              label(item) {
                const ds = item.dataset;
                const value = Number(item.raw.y).toFixed(ds._decimals);
                const unit = ds._unit ? ` ${ds._unit}` : "";
                let line = `${ds.label}: ${value}${unit}`;
                if (ds.label.startsWith("batteryRaw")) {
                  line += ` (≈ ${(item.raw.y / 1000).toFixed(3)} V, interpretación probable)`;
                }
                return line;
              },
              afterBody(items) {
                const i = items[0].raw.i;
                const tx = flight[i];
                const lines = [`Frame ${tx.frameNumber}`, `First IGate: ${tx.firstIgate}`];
                for (const w of warnings[i]) lines.push(`⚠ ${w}`);
                return lines;
              },
            },
          },
        },
      },
      plugins: [flightMarksPlugin],
    });
    return entry;
  });

  // Un gráfico está visible si su canvas tiene tamaño (página activa y sección desplegada).
  const isVisible = (entry) => entry.canvas.clientWidth > 0 && entry.canvas.clientHeight > 0;

  // Cursor vertical: un <div> superpuesto que se reposiciona (no se redibuja el gráfico).
  function placeCursor(entry) {
    const { chart, cursor } = entry;
    if (!chart || !isVisible(entry)) return; // onResize puede dispararse durante la construcción
    const area = chart.chartArea;
    if (!area) return;
    const x = chart.scales.x.getPixelForValue(playback.absoluteMs);
    cursor.style.left = `${x}px`;
    cursor.style.top = `${area.top}px`;
    cursor.style.height = `${area.bottom - area.top}px`;
  }

  // Pone al día un gráfico visible: si la transmisión vigente cambió mientras estaba oculto, solo
  // se actualiza el resaltado (sin reconstruir ni tocar datasets); luego se coloca el cursor.
  function refreshEntry(entry) {
    if (!entry.chart || !isVisible(entry)) return;
    if (entry.stale) {
      entry.stale = false;
      entry.chart.update("none");
    }
    placeCursor(entry);
  }

  /** Llamar en cada cambio de reproducción. Los 8 gráficos siguen sincronizados. */
  function sync() {
    const index = playback.index;
    if (index !== state.index) {
      state.index = index;
      for (const entry of entries) entry.stale = true; // los ocultos se actualizan al mostrarse
    }
    // Después del update: el layout puede cambiar y el cursor debe usar la escala vigente.
    for (const entry of entries) refreshEntry(entry);
  }

  // --- Paginación (4 gráficos por página): solo cambia la visibilidad de los grupos ---
  const pages = [...document.querySelectorAll("#charts .chartPage")];
  const dots = [...document.querySelectorAll("#chartsPager .dot")];
  let page = 0;
  function setPage(n) {
    page = Math.min(Math.max(n, 0), pages.length - 1);
    pages.forEach((p, i) => {
      p.hidden = i !== page;
    });
    dots.forEach((d, i) => d.classList.toggle("active", i === page));
    document.getElementById("chartsPageLabel").textContent = `Página ${page + 1} de ${pages.length}`;
    document.getElementById("chartsPrev").disabled = page === 0;
    document.getElementById("chartsNext").disabled = page === pages.length - 1;
    // Los gráficos que se hacen visibles se ajustan (resize) y se ponen al día, sin reconstruirlos.
    for (const entry of entries) {
      if (isVisible(entry)) {
        entry.chart.resize();
        entry.stale = true;
        refreshEntry(entry);
      }
    }
  }
  document.getElementById("chartsPrev").addEventListener("click", () => setPage(page - 1));
  document.getElementById("chartsNext").addEventListener("click", () => setPage(page + 1));
  for (let k = 0; k < dots.length; k++) dots[k].addEventListener("click", () => setPage(k));

  // Al desplegar la sección (o cambiar el tamaño de la ventana) los gráficos que vuelven a ser
  // visibles se ajustan y se ponen al día, sin reconstruirlos.
  new ResizeObserver(() => {
    for (const entry of entries) {
      if (isVisible(entry)) {
        entry.chart.resize();
        entry.stale = true;
        refreshEntry(entry);
      }
    }
  }).observe(document.getElementById("charts"));

  setPage(0);
  sync();
  return {
    charts: entries.map((e) => e.chart),
    sync,
    cursors: entries.map((e) => e.cursor),
    setPage,
    get page() {
      return page;
    },
  };
}
