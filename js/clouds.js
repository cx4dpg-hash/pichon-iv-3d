// "Nubosidad satelital 2D": capa de REFERENCIA con fotogramas satelitales GOES-19 (GeoColor, NASA GIBS)
// del vuelo del 2026-10-11, empaquetados como activos estáticos (assets/clouds/). Es una imagen real
// dibujada sobre el terreno: NO tiene altura ni volumen y NO son nubes 3D. NO es una simulación.
// El modelo meteorológico (base, tope, espesor) está en data/clouds/cloud-model.json.
//
// - Desactivada por defecto. No se descarga nada hasta que el usuario pulsa "Nubes".
// - Cada fotograma es una imagen georreferenciada (EPSG:4326) dibujada sobre el terreno
//   (SingleTileImageryProvider con su rectángulo). Dos capas activas a la vez: el fotograma real
//   vigente y el siguiente, con transparencia cruzada según el tiempo de reproducción
//   (transición VISUAL entre dos observaciones reales; no es una observación nueva).
// - Hora de cada fotograma = inicio del escaneo + ~6 min (el escaneo llega a Uruguay unos minutos
//   después). Cadencia real: 10 min.
// - Limitaciones: 1 km por píxel, sin corrección de paralaje (las nubes se ven desplazadas hacia
//   el sureste ≈ su altura), compuesto de color de CIRA. Ver docs/CLOUDS_FEASIBILITY.md.

import { formatLocalTimeShort } from "./format.js";

const Cesium = window.Cesium;

const MANIFEST_URL = "assets/clouds/manifest.json";
const BASE_ALPHA = 0.7;
const KEEP_RADIUS = 2; // fotogramas cargados alrededor del vigente

export function initClouds({ viewer, playback }) {
  const button = document.getElementById("btnClouds");
  const info = document.getElementById("cloudInfo");

  let manifest = null;
  let frames = []; // { url, obsMs }
  let enabled = false;
  const layers = new Map(); // índice → ImageryLayer (o promesa mientras carga)
  let lastKey = "";

  async function loadManifest() {
    if (manifest) return;
    const response = await fetch(MANIFEST_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = await response.json();
    const lagMs = manifest.observationLagMinutes * 60 * 1000;
    frames = manifest.frames
      .map((f) => ({ url: `assets/clouds/${f.file}`, obsMs: Date.parse(f.scanStartUtc) + lagMs }))
      .sort((a, b) => a.obsMs - b.obsMs);
  }

  async function ensureLayer(index) {
    if (index < 0 || index >= frames.length || layers.has(index)) return;
    const w = manifest.rectangleDeg;
    layers.set(index, null); // marca "cargando"
    try {
      const provider = await Cesium.SingleTileImageryProvider.fromUrl(frames[index].url, {
        rectangle: Cesium.Rectangle.fromDegrees(w.west, w.south, w.east, w.north),
        credit: manifest.credit,
      });
      if (!enabled) {
        layers.delete(index);
        return;
      }
      const layer = viewer.imageryLayers.addImageryProvider(provider);
      layer.alpha = 0;
      layers.set(index, layer);
      lastKey = ""; // fuerza reordenar y reaplicar transparencias
      update();
    } catch {
      layers.delete(index);
    }
  }

  function dispose(index) {
    const layer = layers.get(index);
    if (layer) viewer.imageryLayers.remove(layer, true);
    layers.delete(index);
  }

  function clearAll() {
    for (const index of [...layers.keys()]) dispose(index);
    lastKey = "";
  }

  /** Fotograma real vigente (k) y fracción hacia el siguiente. */
  function locate(ms) {
    let k = 0;
    for (let i = 0; i < frames.length; i++) if (frames[i].obsMs <= ms) k = i;
    const next = Math.min(k + 1, frames.length - 1);
    const span = frames[next].obsMs - frames[k].obsMs;
    const f = span > 0 ? Math.min(Math.max((ms - frames[k].obsMs) / span, 0), 1) : 0;
    return { k, next, f: ms < frames[0].obsMs ? 0 : f };
  }

  function update() {
    if (!enabled || !manifest) return;
    const { k, next, f } = locate(playback.absoluteMs);
    for (let i = k - KEEP_RADIUS; i <= next + KEEP_RADIUS; i++) ensureLayer(i);
    for (const index of [...layers.keys()]) if (index < k - KEEP_RADIUS || index > next + KEEP_RADIUS) dispose(index);

    const key = `${k}|${Math.round(f * 100)}|${layers.get(k) ? 1 : 0}${layers.get(next) ? 1 : 0}`;
    if (key === lastKey) return;
    lastKey = key;
    const base = layers.get(k);
    const top = next !== k ? layers.get(next) : null;
    if (base) {
      base.alpha = BASE_ALPHA;
      viewer.imageryLayers.raiseToTop(base);
    }
    if (top) {
      top.alpha = BASE_ALPHA * f;
      viewer.imageryLayers.raiseToTop(top);
    }
    const t = formatLocalTimeShort(frames[k].obsMs);
    const tn = formatLocalTimeShort(frames[next].obsMs);
    info.textContent = `Nubosidad satelital 2D (referencia, sin altura) · GOES-19 GeoColor · ${t} → ${tn} hora local · ${manifest.credit.replace("Nubes: ", "")}`;
  }

  async function setEnabled(value) {
    if (value === enabled) return;
    if (value) {
      button.disabled = true;
      try {
        await loadManifest();
      } catch {
        info.textContent = "No se pudo cargar la nubosidad satelital 2D (assets/clouds).";
        info.hidden = false;
        button.disabled = false;
        return;
      }
      button.disabled = false;
      enabled = true;
      button.setAttribute("aria-pressed", "true");
      info.hidden = false;
      update();
    } else {
      enabled = false;
      button.setAttribute("aria-pressed", "false");
      info.hidden = true;
      clearAll();
    }
  }

  button.addEventListener("click", () => setEnabled(!enabled));
  playback.onChange(update);

  return {
    setEnabled,
    get enabled() {
      return enabled;
    },
    get layerCount() {
      return layers.size;
    },
    locate: (ms) => (manifest ? locate(ms) : null),
  };
}
