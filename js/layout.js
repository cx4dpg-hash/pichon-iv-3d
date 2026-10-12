// Lógica pura (sin DOM) de la presentación móvil: detección de layout y estados del bottom sheet.
// js/mobile.js la conecta con la interfaz; aquí solo hay funciones probables en Node.

/** Ancho máximo (CSS px) considerado "teléfono" aunque el puntero no sea táctil. */
export const PHONE_MAX_WIDTH = 600;
/** Lado corto máximo (CSS px) de un teléfono con puntero táctil (cubre el modo horizontal). */
export const PHONE_MAX_SHORT_SIDE = 520;

/**
 * "desktop" | "mobile-portrait" | "mobile-landscape".
 * No depende solo del ancho: un teléfono apaisado (p. ej. 932×430) tiene mucho ancho pero lado
 * corto pequeño y puntero táctil, y NO debe pasar a la disposición de escritorio. Una tablet
 * (lado corto > 520) y una ventana de escritorio baja sin puntero táctil se quedan en escritorio.
 */
export function detectLayout({ width, height, coarsePointer = false }) {
  const shortSide = Math.min(width, height);
  const phone = width <= PHONE_MAX_WIDTH || (coarsePointer && shortSide <= PHONE_MAX_SHORT_SIDE);
  if (!phone) return "desktop";
  return width > height ? "mobile-landscape" : "mobile-portrait";
}

export const isMobileLayout = (layout) => layout === "mobile-portrait" || layout === "mobile-landscape";

export const SHEET_STATES = ["collapsed", "medium", "expanded"];

/**
 * Alturas (px) del contenido del bottom sheet por estado. `chromePx` es la altura de la UI fija
 * (cabecera + barra de controles + barra del sheet): el panel expandido nunca la rebasa.
 */
export function sheetHeights(layout, viewportHeight, chromePx = 0) {
  const landscape = layout === "mobile-landscape";
  const room = Math.max(0, viewportHeight - chromePx - (landscape ? 12 : 24));
  const medium = landscape ? viewportHeight * 0.46 : Math.min(Math.max(viewportHeight * 0.4, 240), 420);
  const expanded = landscape ? viewportHeight * 0.62 : viewportHeight * 0.72;
  const expandedPx = Math.round(Math.min(expanded, room));
  return { collapsed: 0, medium: Math.round(Math.min(medium, expandedPx)), expanded: expandedPx };
}

/** Tocar el handle: abre (mediano) si está colapsado; si está abierto, colapsa. */
export const toggleSheet = (state) => (state === "collapsed" ? "medium" : "collapsed");

/** Botón de ampliar/reducir: colapsado → medio → expandido → medio. */
export const stepSheet = (state) => (state === "collapsed" ? "medium" : state === "medium" ? "expanded" : "medium");

/** Elegir una pestaña con el panel colapsado lo abre al tamaño medio; abierto no cambia de tamaño. */
export const stateOnTabSelect = (state) => (state === "collapsed" ? "medium" : state);

/** Altura del panel durante un arrastre: sigue el dedo (dy > 0 = hacia abajo), acotada al rango. */
export function dragHeight(startHeightPx, dyPx, heights) {
  return Math.min(Math.max(startHeightPx - dyPx, 0), heights.expanded);
}

/**
 * Estado al soltar el arrastre: el más cercano a la altura proyectada con la velocidad
 * (px/ms, positiva = el panel crece), de modo que un gesto rápido corto también cambia de estado.
 */
export function snapSheetState({ heightPx, velocityPxPerMs = 0, heights }) {
  const projected = heightPx + velocityPxPerMs * 150;
  let best = "collapsed";
  for (const state of SHEET_STATES) {
    if (Math.abs(heights[state] - projected) < Math.abs(heights[best] - projected)) best = state;
  }
  return best;
}
