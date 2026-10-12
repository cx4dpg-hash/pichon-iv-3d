// Punto real de rescate/recuperación de la carga (anotación COMPLEMENTARIA, no telemetría).
//
// Dibuja un marcador en el punto de rescate (data/vuelo/recovery.json) y un tramo especial
// punteado y de otro color desde el último punto de la trayectoria APRS principal (frame final
// del vuelo) hasta ese punto. No modifica transmissions.json ni la trayectoria principal: es una
// capa aparte, una línea recta de referencia que NO es una trayectoria medida.
// El estado del paracaídas (no abrió, confirmado por el usuario; no deriva de APRS) está en
// recovery.json → parachute y se muestra en el panel de la última transmisión, no en el mapa.

import { positionAtTime } from "./playback.js";

const Cesium = window.Cesium;

const COLOR = Cesium.Color.fromCssColorString("#c18bff");

export function addRecovery(viewer, { data, playback, map }) {
  const rescue = data.recovery.rescuePoint;
  const { flight, times } = data;
  let groundHeightM = 0; // altura de terreno consultada (solo representación); sin relieve, 0

  const rescueCartesian = () => Cesium.Cartesian3.fromDegrees(rescue.lon, rescue.lat, groundHeightM);
  // Último punto de la trayectoria principal tal como se dibuja (altura de render).
  const lastCartesian = () => {
    const p = positionAtTime(flight, times, times[times.length - 1], playback.displayAltM);
    return Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altM);
  };

  viewer.entities.add({
    id: "recovery-point",
    position: new Cesium.CallbackProperty(rescueCartesian, false),
    point: {
      pixelSize: 13,
      color: COLOR,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: `${rescue.label}\nPunto final de recuperación (no telemétrico)`,
      font: "12px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.TOP,
      pixelOffset: new Cesium.Cartesian2(0, 12),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  viewer.entities.add({
    id: "recovery-line",
    polyline: {
      positions: new Cesium.CallbackProperty(() => [lastCartesian(), rescueCartesian()], false),
      width: 3,
      material: new Cesium.PolylineDashMaterialProperty({ color: COLOR, gapColor: Cesium.Color.TRANSPARENT, dashLength: 12 }),
      arcType: Cesium.ArcType.NONE,
    },
  });

  // Etiqueta del tramo, solo visible a distancias moderadas para no saturar la vista general.
  viewer.entities.add({
    id: "recovery-line-label",
    position: new Cesium.CallbackProperty(
      () => Cesium.Cartesian3.midpoint(lastCartesian(), rescueCartesian(), new Cesium.Cartesian3()),
      false,
    ),
    label: {
      text: "tramo final no telemétrico",
      font: "11px sans-serif",
      fillColor: Cesium.Color.fromCssColorString("#e8dcff"),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -4),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 25000),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  // Con relieve activo se apoya el punto sobre el terreno consultado (solo representación).
  map.baseMap.ready.then(async () => {
    if (map.baseMap.mode !== "ion") return;
    try {
      const h = await map.baseMap.sampleHeight(rescue.lat, rescue.lon);
      if (h !== null) groundHeightM = h;
    } catch {
      /* sin relieve disponible: se queda en 0 */
    }
  });
}
