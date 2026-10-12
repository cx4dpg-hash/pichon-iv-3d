// Presentación móvil: conecta la lógica pura de js/layout.js con la interfaz.
//
// - `initLayout()` (se llama lo antes posible) fija #app[data-layout] según el tamaño real y el
//   tipo de puntero, y gestiona el bottom sheet (estados, pestañas, handle, arrastre).
// - `initMobileControls()` completa la barra compacta: contador de transmisión, velocidad por
//   ciclo, botón de información y pestañas de gráficos.
// En escritorio (data-layout="desktop") nada de esto tiene efecto visible: los elementos solo
// móviles están ocultos por CSS y no se registra ningún observador. Solo escuchan `resize`,
// limitado a un fotograma de animación.

import { detectLayout, isMobileLayout, sheetHeights, toggleSheet, stepSheet, stateOnTabSelect, dragHeight, snapSheetState } from "./layout.js";
import { SPEEDS } from "./playback.js";
import { formatLocalTime } from "./format.js";

const $ = (id) => document.getElementById(id);
const DRAG_THRESHOLD_PX = 8;

export function initLayout() {
  const app = $("app");
  const bar = $("sheetBar");
  const handle = $("sheetHandle");
  const step = $("sheetStep");
  const tabs = [...bar.querySelectorAll(".sheetTabs [role=tab]")];
  const coarse = window.matchMedia?.("(pointer: coarse)");
  const listeners = new Set();

  let layout = "desktop";
  let sheet = "collapsed";
  let tab = "data";
  let heights = { collapsed: 0, medium: 0, expanded: 0 };

  const chromePx = () => ($("mobileHeader")?.offsetHeight ?? 0) + ($("controls")?.offsetHeight ?? 0) + bar.offsetHeight;

  function emit() {
    for (const fn of listeners) fn({ layout, sheet, tab });
    window.dispatchEvent(new CustomEvent("pichon:layoutchange", { detail: { layout, sheet, tab } }));
  }

  function paintSheet() {
    app.dataset.sheet = sheet;
    app.dataset.sheetTab = tab;
    app.style.setProperty("--sheet-h", `${heights[sheet]}px`);
    handle.setAttribute("aria-expanded", String(sheet !== "collapsed"));
    step.textContent = sheet === "expanded" ? "⌄" : "⌃";
    step.setAttribute("aria-label", sheet === "expanded" ? "Reducir el panel" : "Ampliar el panel");
    for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.tab === tab));
  }

  function setSheet(next) {
    if (sheet === next) return;
    sheet = next;
    paintSheet();
    emit();
  }

  function setTab(next) {
    tab = next;
    const open = stateOnTabSelect(sheet);
    if (open !== sheet) sheet = open;
    paintSheet();
    emit();
  }

  function apply() {
    const next = detectLayout({ width: window.innerWidth, height: window.innerHeight, coarsePointer: Boolean(coarse?.matches) });
    const changed = next !== layout;
    layout = next;
    app.dataset.layout = layout;
    if (isMobileLayout(layout)) {
      heights = sheetHeights(layout, window.innerHeight, chromePx());
      paintSheet();
    } else {
      app.style.removeProperty("--sheet-h");
      app.style.removeProperty("--drag-y");
    }
    if (changed || isMobileLayout(layout)) emit();
  }

  // --- resize / orientación (un cálculo por fotograma como máximo) ---
  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      apply();
    });
  };
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);

  // --- handle, botón y pestañas ---
  let suppressClick = false;
  handle.addEventListener("click", () => {
    if (!suppressClick) setSheet(toggleSheet(sheet));
  });
  step.addEventListener("click", () => {
    if (!suppressClick) setSheet(stepSheet(sheet));
  });
  for (const t of tabs) {
    t.addEventListener("click", () => {
      if (!suppressClick) setTab(t.dataset.tab);
    });
  }

  // --- arrastre del sheet: sin captura hasta superar el umbral, para no romper los toques ---
  let drag = null;
  bar.addEventListener("pointerdown", (event) => {
    if (!isMobileLayout(layout) || (event.pointerType === "mouse" && event.button !== 0)) return;
    drag = { id: event.pointerId, y0: event.clientY, h0: heights[sheet], started: false, last: { y: event.clientY, t: event.timeStamp }, v: 0 };
  });
  bar.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = event.clientY - drag.y0;
    if (!drag.started) {
      if (Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      drag.started = true;
      bar.setPointerCapture(event.pointerId);
      app.classList.add("sheetDragging");
      // El contenido se maqueta una sola vez a la altura máxima y se desplaza con transform
      // (sin reflujo ni redibujado de gráficos durante el gesto).
      app.dataset.sheet = "expanded";
      app.style.setProperty("--sheet-h", `${heights.expanded}px`);
    }
    const dt = event.timeStamp - drag.last.t;
    if (dt > 0) drag.v = ((drag.last.y - event.clientY) / dt) * 0.6 + drag.v * 0.4; // px/ms, + = crece
    drag.last = { y: event.clientY, t: event.timeStamp };
    drag.h = dragHeight(drag.h0, dy, heights);
    app.style.setProperty("--drag-y", `${heights.expanded - drag.h}px`);
  });
  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.started) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    app.classList.remove("sheetDragging");
    app.style.removeProperty("--drag-y");
    const stale = performance.now() - d.last.t > 120; // pausó antes de soltar: sin inercia
    const target = snapSheetState({ heightPx: d.h ?? d.h0, velocityPxPerMs: stale ? 0 : d.v, heights });
    sheet = target;
    paintSheet(); // repinta siempre: durante el gesto el DOM quedó a la altura máxima
    emit();
  };
  bar.addEventListener("pointerup", endDrag);
  bar.addEventListener("pointercancel", endDrag);

  apply();
  return {
    get layout() {
      return layout;
    },
    get sheet() {
      return sheet;
    },
    get tab() {
      return tab;
    },
    get isMobile() {
      return isMobileLayout(layout);
    },
    setSheet,
    setTab,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** Barra compacta y gráficos en móvil. Seguro de llamar en escritorio (los controles están ocultos). */
export function initMobileControls({ playback, charts, panelToggle, total, layoutController }) {
  // Información: el botón de la cabecera móvil reutiliza el de siempre (misma ventana).
  $("btnInfoMobile").addEventListener("click", () => $("btnInfo").click());

  // Velocidad: un solo botón que recorre las velocidades disponibles.
  const speedButton = $("btnSpeedM");
  speedButton.addEventListener("click", () => {
    const i = SPEEDS.indexOf(playback.speed);
    playback.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
  });

  // Posición actual (transmisión n/total y hora local), solo se escribe si cambia.
  const tx = $("mTx");
  const time = $("mTime");
  const last = { tx: "", time: "", speed: "" };
  function update() {
    const txText = `${playback.index + 1}/${total}`;
    const timeText = formatLocalTime(playback.absoluteMs);
    const speedText = `${playback.speed}x`;
    if (txText !== last.tx) tx.textContent = last.tx = txText;
    if (timeText !== last.time) time.textContent = last.time = timeText;
    if (speedText !== last.speed) {
      speedButton.textContent = last.speed = speedText;
      speedButton.setAttribute("aria-label", `Velocidad de reproducción ${speedText}. Tocar para cambiar`);
    }
  }
  playback.onChange(update);
  update();

  // Pestañas de gráficos (los 4 grupos de siempre).
  const chartTabs = [...$("chartTabs").querySelectorAll("[role=tab]")];
  const syncChartTabs = () => chartTabs.forEach((b) => b.setAttribute("aria-selected", String(Number(b.dataset.page) === charts.page)));
  for (const b of chartTabs) {
    b.addEventListener("click", () => {
      charts.setPage(Number(b.dataset.page));
      syncChartTabs();
    });
  }
  syncChartTabs();

  // Al entrar en móvil se asegura que el panel de datos y los gráficos no estén ocultos por los
  // interruptores de escritorio.
  const onLayout = ({ layout }) => {
    if (layout === "desktop") return;
    if (panelToggle && !panelToggle.visible) panelToggle.set(true);
    if ($("charts").hidden) $("btnTelemetry").click();
    syncChartTabs();
  };
  layoutController.onChange(onLayout);
  onLayout({ layout: layoutController.layout });
}
