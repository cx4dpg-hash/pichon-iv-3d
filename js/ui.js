// Interfaz: panel de información, controles temporales y timeline. Solo lee el estado.

import { SPEEDS } from "./playback.js";
import { describeFirstIgate } from "./stations.js";
import { currentEstimate, isAscentPhase } from "./physics.js";
import { formatLocalTime } from "./format.js";

const $ = (id) => document.getElementById(id);

function fmt(value, decimals) {
  return Number.isFinite(value) ? value.toFixed(decimals) : "—";
}

// Estado del globo según el perfil de vuelo. La ruptura es una INFERENCIA, no un hecho medido.
function balloonStateText(model, index) {
  if (isAscentPhase(model, index)) {
    return index === model.apogeeIndex
      ? "Ascenso; máxima altitud (última transmisión antes de la transición estimada)"
      : "Fase de ascenso; modelo de expansión aplicable";
  }
  const transition = model.estimatedBurstTransition;
  return transition && index === transition.firstDescentIndex
    ? "Transición de ruptura estimada (inferida del perfil de vuelo); fase de descenso; modelo de expansión no aplicable"
    : "Fase de descenso; modelo de expansión no aplicable";
}

export function initUi({ data, playback, map, diameterModel, verticalSpeeds }) {
  const { flight, stationByCallsign } = data;

  // --- Timeline ---
  const slider = $("slider");
  slider.min = "0";
  slider.max = String(Math.round(playback.duration));
  slider.step = "1000";
  $("tStart").textContent = formatLocalTime(playback.t0);
  $("tEnd").textContent = formatLocalTime(playback.t0 + playback.duration);

  let dragging = false;
  slider.addEventListener("pointerdown", () => (dragging = true));
  window.addEventListener("pointerup", () => (dragging = false));
  slider.addEventListener("input", () => playback.seek(Number(slider.value)));

  // --- Botones de reproducción ---
  const playButton = $("btnPlay");
  playButton.addEventListener("click", () => (playback.playing ? playback.pause() : playback.play()));
  $("btnPrev").addEventListener("click", () => playback.previous());
  $("btnNext").addEventListener("click", () => playback.next());

  // --- Velocidades ---
  const speedBox = $("speeds");
  const speedButtons = SPEEDS.map((speed) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${speed}x`;
    button.dataset.speed = String(speed);
    button.addEventListener("click", () => playback.setSpeed(speed));
    speedBox.appendChild(button);
    return button;
  });

  // --- Cámara ---
  const camButtons = {
    overview: $("btnOverview"),
    follow: $("btnFollow"),
  };
  for (const [mode, button] of Object.entries(camButtons)) {
    button.addEventListener("click", () => {
      map.setCameraMode(mode);
      renderCameraButtons();
    });
  }
  function renderCameraButtons() {
    for (const [mode, button] of Object.entries(camButtons)) {
      button.setAttribute("aria-pressed", String(map.cameraMode === mode));
    }
  }

  // --- Sección de telemetría plegable ---
  const telemetryToggle = $("btnTelemetry");
  telemetryToggle.addEventListener("click", () => {
    const open = telemetryToggle.getAttribute("aria-expanded") !== "true";
    telemetryToggle.setAttribute("aria-expanded", String(open));
    telemetryToggle.textContent = open ? "Telemetría ▾" : "Telemetría ▸";
    $("charts").hidden = !open;
  });

  // --- Panel de información (valores de la transmisión real vigente) ---
  let renderedIndex = -1;
  function renderPanel(index) {
    const tx = flight[index];
    $("pCount").textContent = `Transmisión ${index + 1} de ${flight.length}`;
    $("pFrame").textContent = String(tx.frameNumber);
    $("pFrameTime").textContent = formatLocalTime(Date.parse(tx.packetTimestampUtc));
    $("pLat").textContent = `${fmt(tx.position.lat, 5)}°`;
    $("pLon").textContent = `${fmt(tx.position.lon, 5)}°`;
    $("pAlt").textContent = `${fmt(tx.altitudeGpsM, 0)} m (${tx.altitudeGpsFt} ft)`;
    $("pSpeed").textContent = `${fmt(tx.speedKmh, 1)} km/h (${tx.speedAprsKnotsRaw} kt)`;
    $("pCourse").textContent = `${tx.courseDeg}°`;
    // Dato DERIVADO (no es telemetría original); en la primera transmisión no existe muestra anterior.
    const vs = verticalSpeeds[index];
    $("pVertical").textContent =
      vs === null ? "—" : `${vs >= 0 ? "+" : "−"}${Math.abs(vs).toFixed(1)} m/s (derivada)`;
    $("pMode").textContent = tx.telemetry.mode;
    $("pPressure").textContent = `${fmt(tx.telemetry.pressureHpa, 0)} hPa`;
    $("pExtTemp").textContent = `${fmt(tx.telemetry.externalTemperatureC, 0)} °C`;
    $("pIntTemp").textContent = `${fmt(tx.telemetry.internalTemperatureC, 0)} °C`;
    $("pBaroAlt").textContent = `${fmt(tx.telemetry.barometricAltitudeM, 0)} m`;
    $("pHumidity").textContent = `${fmt(tx.telemetry.humidityPercent, 0)} %`;
    // batteryRaw es el dato original; los voltios son una interpretación probable (no confirmada).
    $("pBatteryRaw").textContent = `${tx.telemetry.batteryRaw} raw`;
    $("pBatteryV").textContent =
      `≈ ${fmt(tx.telemetry.batteryV, 3)} V (interpretación ${tx.telemetry.batteryInterpretationStatus})`;
    // Códigos GPS en bruto: no están documentados semánticamente.
    $("pGpsQuality").textContent = String(tx.telemetry.gpsQuality);
    $("pSatellites").textContent = String(tx.telemetry.satellites);
    $("pGpsStatus").textContent = String(tx.telemetry.gpsStatus);
    const estimate = currentEstimate(diameterModel, index);
    if (estimate.diameterM === null) {
      $("pDiameter").textContent = "—";
    } else {
      $("pDiameter").textContent =
        `${fmt(estimate.diameterM, 1)} m` + (estimate.status === "computed" ? "" : ` (${estimate.status})`);
    }
    $("pBalloonState").textContent = balloonStateText(diameterModel, index);

    const igate = describeFirstIgate(tx.firstIgate, stationByCallsign);
    $("pIgate").textContent = igate.text;

    const warnings = [];
    for (const reception of tx.receptions) {
      for (const warning of reception.warnings) warnings.push(`${reception.igate}: ${warning}`);
    }
    const list = $("pWarnings");
    list.replaceChildren(
      ...warnings.map((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        return li;
      }),
    );
    $("warningsBox").hidden = warnings.length === 0;
    renderedIndex = index;
  }

  function render() {
    if (!dragging) slider.value = String(Math.round(playback.offset));
    const nowText = formatLocalTime(playback.absoluteMs);
    $("tNow").textContent = nowText;
    $("tNowPanel").textContent = nowText;
    playButton.textContent = playback.playing ? "Pausa" : "Play";
    for (const button of speedButtons) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.speed) === playback.speed));
    }
    const index = playback.index;
    if (index !== renderedIndex) renderPanel(index);
  }

  playback.onChange(render);
  render();
  renderCameraButtons();
}
