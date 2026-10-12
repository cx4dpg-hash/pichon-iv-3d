// Nubes 3D (reconstrucción APROXIMADA basada en GOES-19 + METAR). Ver docs/CLOUD_MODEL.md.
//
// Usa Cesium.CloudCollection / CumulusCloud: volúmenes reales (ray-marching) con posición 3D,
// altura y espesor, que se ven con paralaje al mover la cámara y que el globo puede atravesar.
// Los límites verticales salen de data/clouds/cloud-model.json (base = techo METAR, tope = ACHA,
// por zona y hora, con transición suave entre zonas y entre estados). La geometría está en
// cloudfield.js. Apagado por defecto: el modelo JSON se pide solo al activar el botón.
//
// Limitación: CumulusCloud tiende a formas de cúmulo y se orienta hacia la cámara; se usan
// elementos anchos, bajos y muy solapados para aproximar una capa estratiforme. No hay viento ni
// estructura interna respaldados por datos.

import { FIELD, buildField, parseModel, paramsAtTime, elementGeometry } from "./cloudfield.js";

const Cesium = window.Cesium;

const MODEL_URL = "data/clouds/cloud-model.json";
// CumulusCloud es un sprite orientado a la cámara (tamaño en metros = `scale`) cuyo interior se
// calcula como volumen con ray-marching en un espacio normalizado (`maximumSize`, unidades
// arbitrarias de decenas, no metros). `scale` fija el tamaño real; `maximumSize` la forma y el
// relieve interno.
export const CLOUD_TUNING = {
  footprintM: 16000, // ancho de cada elemento (se multiplica por widthK)
  heightK: 2.4, // alto del sprite visto de canto = espesor de la capa × heightK
  depthK: 0.75, // alto del sprite visto desde arriba = ancho × depthK
  unitsX: 30, // maximumSize.x (unidades normalizadas)
  unitsYMin: 14,
  unitsZ: 50, // profundidad / relieve interno (más = nube más densa y opaca)
  brightness: 0.95,
  noiseDetail: 16,
};

export function initClouds3D({ viewer, playback }) {
  const button = document.getElementById("btnClouds3d");
  const note = document.getElementById("cloudNote");
  const scene = viewer.scene;

  let states = null;
  let elements = null;
  let collection = null;
  let clouds = []; // CumulusCloud por elemento
  let enabled = false;
  let lastKey = "";
  let updates = 0;

  async function load() {
    if (states) return;
    const response = await fetch(MODEL_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    states = parseModel(await response.json());
    elements = buildField();
  }

  function create() {
    if (collection) return;
    collection = new Cesium.CloudCollection({ noiseDetail: CLOUD_TUNING.noiseDetail, noiseOffset: Cesium.Cartesian3.ZERO });
    scene.primitives.add(collection);
    const color = new Cesium.Color(0.93, 0.95, 0.97, 1);
    clouds = elements.map((el) =>
      collection.add({
        position: Cesium.Cartesian3.fromDegrees(el.lon, el.lat, 800),
        scale: new Cesium.Cartesian2(1000, 500),
        maximumSize: new Cesium.Cartesian3(30, 10, 14),
        color,
        brightness: CLOUD_TUNING.brightness,
        slice: -1,
        show: false,
      }),
    );
  }

  /** Aplica los parámetros del instante actual solo cuando cambian de forma apreciable (5 m). */
  function update(force = false) {
    if (!enabled || !collection) return;
    const params = paramsAtTime(states, playback.absoluteMs);
    const elevBin = Math.round(Math.abs(Cesium.Math.toDegrees(viewer.camera.pitch)) / 3);
    const elev = Cesium.Math.toRadians(elevBin * 3);
    const cosE = Math.cos(elev);
    const sinE = Math.sin(elev);
    const key = elevBin + "|" + ["Z1", "Z2"]
      .map((z) => ["base", "top", "topP10", "topP90", "coverage"].map((k) => Math.round(params[z][k] * (k === "coverage" ? 200 : 0.2))).join(","))
      .join("|");
    if (!force && key === lastKey) return;
    lastKey = key;
    updates++;
    elements.forEach((el, i) => {
      const g = elementGeometry(el, params);
      const c = clouds[i];
      c.show = g.visible;
      if (!g.visible) return;
      if (c.color.alpha !== g.alpha) c.color = new Cesium.Color(0.93, 0.95, 0.97, g.alpha);
      const widthM = CLOUD_TUNING.footprintM * el.widthK;
      // Alto aparente del sprite: de canto = espesor de la capa; desde arriba = su extensión
      // horizontal en profundidad. Se interpola con el ángulo de elevación de la cámara.
      const heightM = Math.max(
        g.thicknessM * CLOUD_TUNING.heightK * cosE,
        widthM * el.depthK * CLOUD_TUNING.depthK * sinE,
        g.thicknessM * 1.2,
      );
      const aspect = heightM / widthM;
      c.position = Cesium.Cartesian3.fromDegrees(el.lon, el.lat, g.centerAltM, undefined, c.position);
      c.scale = new Cesium.Cartesian2(widthM, heightM);
      c.maximumSize = new Cesium.Cartesian3(
        CLOUD_TUNING.unitsX,
        Math.max(CLOUD_TUNING.unitsX * aspect * 1.5, CLOUD_TUNING.unitsYMin),
        CLOUD_TUNING.unitsZ,
      );
    });
  }

  async function setEnabled(value) {
    if (value === enabled) return;
    if (value) {
      button.disabled = true;
      try {
        await load();
      } catch {
        note.textContent = "No se pudo cargar el modelo de nubes (data/clouds/cloud-model.json).";
        note.hidden = false;
        button.disabled = false;
        return;
      }
      button.disabled = false;
      create();
      enabled = true;
      collection.show = true;
      button.setAttribute("aria-pressed", "true");
      note.textContent = "Nubes 3D · reconstrucción aproximada basada en GOES-19 + METAR";
      note.hidden = false;
      update(true);
    } else {
      enabled = false;
      if (collection) collection.show = false;
      button.setAttribute("aria-pressed", "false");
      note.hidden = true;
    }
  }

  button.addEventListener("click", () => setEnabled(!enabled));
  playback.onChange(() => update());
  // El alto aparente de cada sprite depende de la elevación de la cámara: se recalcula al cambiar ≥ 3°.
  scene.preRender.addEventListener(() => {
    if (enabled && Math.round(Math.abs(Cesium.Math.toDegrees(viewer.camera.pitch)) / 3) !== Number(lastKey.split("|")[0])) update();
  });

  return {
    setEnabled,
    update,
    get enabled() {
      return enabled;
    },
    get cloudCount() {
      return clouds.length;
    },
    get visibleCount() {
      return clouds.filter((c) => c.show).length;
    },
    get updates() {
      return updates;
    },
    get clouds() {
      return clouds;
    },
    get collection() {
      return collection;
    },
    get field() {
      return FIELD;
    },
  };
}
