// Gráficos de telemetría (Chart.js, cargado por CDN) sincronizados con la reproducción.
//
// - Eje X común: packetTimestampUtc (hora de emisión de la trama) mostrado en hora local.
// - Un punto por transmisión real de "flight"; nada se interpola ni se inventa.
// - El cursor vertical sigue el tiempo de reproducción (continuo); los valores numéricos del
//   panel siguen siendo los de la transmisión real vigente.
// - Los gráficos se crean una sola vez; después solo se mueve el cursor y se resalta el punto
//   de la transmisión vigente cuando ésta cambia.

import { formatLocalTime, formatLocalTimeShort } from "./format.js";

const HALF_HOUR_MS = 30 * 60 * 1000; // Uruguay es UTC−3 (sin DST): las medias horas locales coinciden con las UTC.

const COLORS = {
  gps: "#ffb000",
  baro: "#5ec8ff",
  tempInt: "#ff6b6b",
  tempExt: "#4da3ff",
  pressure: "#c39bff",
  battery: "#7ee787",
  batteryV: "#d0d0d0",
  warning: "#ff9f1c",
  grid: "rgba(159,176,216,0.15)",
  text: "#9fb0d8",
  cursor: "#ffffff",
};

/** Dibuja la franja de la transición estimada y la línea de la transmisión de máxima altitud. */
const flightMarksPlugin = {
  id: "flightMarks",
  beforeDatasetsDraw(chart, _args, opts) {
    const { ctx, chartArea, scales } = chart;
    const xa = scales.x.getPixelForValue(opts.maxTime);
    const xb = scales.x.getPixelForValue(opts.nextTime);
    ctx.save();
    ctx.fillStyle = "rgba(255, 90, 90, 0.28)";
    ctx.fillRect(xa, chartArea.top, Math.max(xb - xa, 4), chartArea.bottom - chartArea.top);
    ctx.restore();
  },
  afterDatasetsDraw(chart, _args, opts) {
    const { ctx, chartArea, scales } = chart;
    const xa = scales.x.getPixelForValue(opts.maxTime);
    ctx.save();
    ctx.strokeStyle = "#ffe14d";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xa, chartArea.top);
    ctx.lineTo(xa, chartArea.bottom);
    ctx.stroke();
    if (opts.labels) {
      ctx.setLineDash([]);
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffe14d";
      ctx.fillText(opts.maxLabel, xa - 5, chartArea.bottom - 32);
      ctx.fillStyle = "#ff9a9a";
      ctx.fillText(opts.transitionLabel, xa - 5, chartArea.bottom - 18);
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

  const series = (label, color, valueOf, extra = {}) => ({
    label,
    data: points(valueOf),
    borderColor: color,
    backgroundColor: color,
    borderWidth: 1.5,
    showLine: true,
    tension: 0,
    parsing: false,
    normalized: true,
    pointRadius: (ctx) => (ctx.raw.i === state.index ? 6 : warnings[ctx.raw.i].length ? 4 : 2.5),
    pointStyle: (ctx) => (warnings[ctx.raw.i].length ? "triangle" : "circle"),
    pointBorderColor: (ctx) => (ctx.raw.i === state.index ? "#ffffff" : color),
    pointBorderWidth: (ctx) => (ctx.raw.i === state.index ? 2 : 1),
    pointHoverRadius: 6,
    pointHitRadius: 8,
    ...extra,
  });

  const yAxis = (title, extra = {}) => ({
    title: { display: true, text: title, color: COLORS.text, font: { size: 11 } },
    ticks: { color: COLORS.text, font: { size: 10 } },
    grid: { color: COLORS.grid },
    ...extra,
  });

  const xAxis = {
    type: "linear",
    min: t0,
    max: t1,
    grid: { color: COLORS.grid },
    ticks: { color: COLORS.text, font: { size: 10 }, callback: (v) => formatLocalTimeShort(v) },
    afterBuildTicks(scale) {
      const ticks = [];
      for (let t = Math.ceil(t0 / HALF_HOUR_MS) * HALF_HOUR_MS; t <= t1; t += HALF_HOUR_MS) ticks.push({ value: t });
      scale.ticks = ticks;
    },
  };

  const batteryRaws = flight.map((tx) => tx.telemetry.batteryRaw);
  const bMin = Math.floor(Math.min(...batteryRaws) / 100) * 100;
  const bMax = Math.ceil(Math.max(...batteryRaws) / 100) * 100;

  const definitions = [
    {
      canvasId: "chartAltitude",
      labels: true,
      datasets: [
        series("Altitud GPS (m)", COLORS.gps, (tx) => tx.altitudeGpsM),
        series("Altitud barométrica (m)", COLORS.baro, (tx) => tx.telemetry.barometricAltitudeM),
      ],
      scales: { y: yAxis("m") },
      format: (dataset, y) => `${dataset.label.replace(/ \(.*\)/, "")}: ${Math.round(y)} m`,
    },
    {
      canvasId: "chartTemperature",
      datasets: [
        series("Temp. interna (°C)", COLORS.tempInt, (tx) => tx.telemetry.internalTemperatureC),
        series("Temp. externa (°C)", COLORS.tempExt, (tx) => tx.telemetry.externalTemperatureC),
      ],
      scales: { y: yAxis("°C") },
      format: (dataset, y) => `${dataset.label.replace(/ \(.*\)/, "")}: ${y} °C`,
    },
    {
      canvasId: "chartPressure",
      datasets: [series("Presión (hPa)", COLORS.pressure, (tx) => tx.telemetry.pressureHpa)],
      scales: { y: yAxis("hPa") },
      format: (dataset, y) => `Presión: ${y} hPa`,
    },
    {
      canvasId: "chartBattery",
      datasets: [
        series("batteryRaw (original)", COLORS.battery, (tx) => tx.telemetry.batteryRaw),
        // Interpretación probable, no confirmada: línea punteada, sin puntos, eje derecho.
        series("≈ V (probable, raw/1000)", COLORS.batteryV, (tx) => tx.telemetry.batteryV, {
          yAxisID: "y1",
          borderDash: [5, 4],
          borderWidth: 1,
          pointRadius: 0,
          pointHoverRadius: 0,
          pointHitRadius: 0,
        }),
      ],
      scales: {
        y: yAxis("raw", { min: bMin, max: bMax }),
        y1: yAxis("≈ V (probable)", { position: "right", min: bMin / 1000, max: bMax / 1000, grid: { drawOnChartArea: false } }),
      },
      format: (dataset, y) => `batteryRaw: ${y} (≈ ${(y / 1000).toFixed(3)} V, interpretación probable)`,
    },
  ];

  const entries = definitions.map((def) => {
    const canvas = document.getElementById(def.canvasId);
    const cursor = canvas.parentElement.querySelector(".cursor");
    const entry = { chart: null, cursor };
    entry.chart = new Chart(canvas, {
      type: "line",
      data: { datasets: def.datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "nearest", intersect: true },
        layout: { padding: { right: 4 } },
        onResize: () => placeCursor(entry),
        onHover(event, elements) {
          event.native.target.style.cursor = elements.length ? "pointer" : "default";
        },
        // Clic en un punto real: salta a esa transmisión (no inicia Play).
        onClick(_event, elements) {
          if (elements.length) seekToIndex(elements[0].index);
        },
        scales: { x: xAxis, ...def.scales },
        plugins: {
          legend: { labels: { color: COLORS.text, boxWidth: 10, font: { size: 10 } } },
          flightMarks: { ...marks, labels: !!def.labels },
          tooltip: {
            filter: (item) => item.dataset.pointHitRadius !== 0,
            callbacks: {
              title: (items) => `Hora local: ${formatLocalTime(items[0].raw.x)}`,
              label: (item) => def.format(item.dataset, item.raw.y),
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

  // Cursor vertical: un <div> superpuesto que se reposiciona (no se redibuja el gráfico).
  function placeCursor(entry) {
    const { chart, cursor } = entry;
    if (!chart) return; // onResize puede dispararse durante la construcción
    const area = chart.chartArea;
    if (!area) return;
    const x = chart.scales.x.getPixelForValue(playback.absoluteMs);
    cursor.style.left = `${x}px`;
    cursor.style.top = `${area.top}px`;
    cursor.style.height = `${area.bottom - area.top}px`;
  }

  /** Llamar en cada cambio de reproducción. */
  function sync() {
    const index = playback.index;
    if (index !== state.index) {
      state.index = index;
      for (const { chart } of entries) chart.update("none"); // solo resalta el punto vigente
    }
    // Después del update: el layout puede cambiar y el cursor debe usar la escala vigente.
    for (const entry of entries) placeCursor(entry);
  }

  sync();
  return { charts: entries.map((e) => e.chart), sync, cursors: entries.map((e) => e.cursor) };
}
