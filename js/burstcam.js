// Encuadre de la cámara de "Seguir globo" durante la rotura del globo.
//
// En Seguir globo la cámara mira a la carga y el globo queda arriba, recortado por el borde. Para
// que la rotura (globo inflándose y fragmentos) se vea completa, la cámara se aleja un poco y
// apunta algo más arriba (de modo que la carga quede abajo y la rotura arriba) con suavidad poco
// antes de romper; se mantiene mientras dura y vuelve después. Es una función pura del instante
// simulado (burstCameraBlend en burst.js): fuera de la ventana no se toca nada, y pausar,
// retroceder o saltar deja siempre el encuadre correcto.
//
// Se aplica como cambios INCREMENTALES (factor de distancia e inclinación) sobre la cámara tal
// como la tiene el usuario, de modo que su zoom y su orientación se respetan. No actúa en Vista
// general ni con la cámara libre.

import { burstCameraBlend } from "./burst.js";
import { assemblyScale } from "./balloon.js";

const Cesium = window.Cesium;

const MARGIN = 1.35; // holgura sobre la extensión estricta de la rotura (la carga queda dentro, abajo)
const MAX_FACTOR = 3.5; // tope del alejamiento

export function initBurstCamera({ viewer, playback, assembly, balloon }) {
  const scene = viewer.scene;
  const camera = viewer.camera;
  let applied = 1; // factor de distancia actualmente aplicado
  let tilt = 0; // inclinación hacia arriba actualmente aplicada (rad)

  scene.preRender.addEventListener(() => {
    const tracking = viewer.trackedEntity === balloon && !Cesium.Matrix4.equals(camera.transform, Cesium.Matrix4.IDENTITY);
    if (!tracking) {
      applied = 1; // al volver a seguir, Cesium parte de su encuadre por defecto
      tilt = 0;
      return;
    }
    const blend = burstCameraBlend(playback.absoluteMs, assembly.burstMs, playback.speed);
    if (blend === 0 && applied === 1 && tilt === 0) return; // camino normal: no se toca la cámara

    let targetFactor = 1;
    let targetTilt = 0;
    if (blend > 0) {
      const base = Cesium.Cartesian3.magnitude(camera.position) / applied; // distancia sin el factor
      const framing = assembly.burstFraming(assemblyScale(base));
      if (framing) {
        // La rotura ocupa desde la carga hasta upM por encima: se centra la vista a media altura.
        const centerUp = framing.upM / 2;
        const tanV = Math.tan(camera.frustum.fovy / 2);
        const tanH = tanV * camera.frustum.aspectRatio;
        const needed = MARGIN * Math.max(centerUp / tanV, framing.sideM / tanH);
        const full = Math.min(Math.max(needed / base, 1), MAX_FACTOR);
        targetFactor = 1 + (full - 1) * blend;
        targetTilt = blend * Math.atan(centerUp / (base * full));
      }
    }
    if (Math.abs(targetFactor - applied) > 1e-6) {
      Cesium.Cartesian3.multiplyByScalar(camera.position, targetFactor / applied, camera.position);
      applied = targetFactor;
    }
    if (Math.abs(targetTilt - tilt) > 1e-6) {
      camera.look(camera.right, -(targetTilt - tilt)); // equivale a lookUp(delta)
      tilt = targetTilt;
    }
  });

  return {
    get factor() {
      return applied;
    },
    get tilt() {
      return tilt;
    },
  };
}
