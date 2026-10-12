// Interfaz limpia: ocultar/mostrar el panel izquierdo y modo presentación (Fullscreen API real).
// Solo cambia la visibilidad de elementos (clases/atributo hidden). No toca la reproducción, la
// cámara, el seguimiento ni ningún dato: el estado de tiempo/velocidad/cámara se conserva porque
// nada de eso se reinicia al entrar o salir. Sin persistencia entre sesiones.

const $ = (id) => document.getElementById(id);

/** Botón para ocultar/mostrar el panel "PICHÓN IV — CX1AA-11" (reversible). */
export function initPanelToggle() {
  const panel = $("infoPanel");
  const button = $("btnPanelToggle");
  const wrap = $("viewerWrap");

  function set(visible) {
    panel.hidden = !visible;
    wrap.classList.toggle("panelHidden", !visible);
    button.setAttribute("aria-expanded", String(visible));
    button.textContent = visible ? "◂ Ocultar panel" : "▸ Mostrar panel";
    button.title = visible ? "Ocultar el panel de información" : "Mostrar el panel de información";
  }
  button.addEventListener("click", () => set(panel.hidden));
  set(true);
  return {
    set,
    get visible() {
      return !panel.hidden;
    },
  };
}

/**
 * Modo presentación: pone la aplicación (#app) en pantalla completa real y oculta panel,
 * gráficos y textos auxiliares; quedan visor, brújula, línea de tiempo y controles. Escape (o el
 * botón) sale y restaura el diseño anterior. Si el navegador lo impide, no se cambia nada.
 */
export function initPresentation({ viewer }) {
  const app = $("app");
  const button = $("btnPresent");
  const status = $("status");
  const supported = Boolean(document.fullscreenEnabled && app.requestFullscreen);
  let active = false;

  function apply(value) {
    active = value;
    app.classList.toggle("presentation", value);
    button.setAttribute("aria-pressed", String(value));
    button.textContent = value ? "Salir de presentación" : "Presentación";
    button.title = value
      ? "Salir del modo presentación (Esc)"
      : "Modo presentación: pantalla completa con el visor y los controles principales";
    // El tamaño del contenedor cambia: se pide a Cesium que lo recalcule (no mueve la cámara).
    requestAnimationFrame(() => viewer.resize());
  }

  async function enter() {
    try {
      await app.requestFullscreen({ navigationUI: "hide" });
    } catch (error) {
      status.textContent = `No se pudo entrar en pantalla completa: ${error.message}`;
      status.hidden = false;
      setTimeout(() => (status.hidden = true), 4000);
    }
  }

  function toggle() {
    if (document.fullscreenElement) document.exitFullscreen();
    else enter();
  }

  // Fuente de verdad: el estado real del navegador (Escape, F11, botón, API).
  document.addEventListener("fullscreenchange", () => apply(document.fullscreenElement === app));

  if (supported) {
    button.addEventListener("click", toggle);
  } else {
    button.disabled = true;
    button.title = "Este navegador no permite pantalla completa";
  }
  apply(false);
  return {
    enter,
    exit: () => document.fullscreenElement && document.exitFullscreen(),
    get active() {
      return active;
    },
    get supported() {
      return supported;
    },
  };
}
