// "Vista inmersiva": conecta la cámara perseguidora (js/chasecam.js) con el visor de Cesium.
//
// En cada fotograma que Cesium dibuja (render bajo demanda) se coloca la cámara detrás de la carga
// con camera.setView, en función del instante simulado. No hay trackedEntity ni bucle propio de
// render: durante la reproducción map3d.js ya pide un fotograma por cambio de instante, y al pausar
// solo se piden los fotogramas que faltan para que el suavizado converja (después la escena queda
// estática). Los saltos del tiempo (scrub, Anterior/Siguiente, clic en gráficos, fase) reponen la
// cámara de inmediato en vez de arrastrar el suavizado desde la posición anterior.

import { positionAtTime, finalPosition } from "./playback.js";
import { CHASE, motionDirection, viewTarget, stepChase, cameraOffsetENU, isTimeJump, wrapPi } from "./chasecam.js";

const Cesium = window.Cesium;

export function initImmersiveCamera({ viewer, playback, flight }) {
  const scene = viewer.scene;
  const camera = viewer.camera;
  const controller = scene.screenSpaceCameraController;
  let active = false;
  let state = null;
  let target = null;
  let prevOffset = null;
  let prevNow = 0;
  let prevHeading = null;
  const enu = new Cesium.Matrix4();
  const payload = new Cesium.Cartesian3();
  const eye = new Cesium.Cartesian3();
  const local = new Cesium.Cartesian3();

  /** Misma geometría que mueve la carga (PCHIP en telemetría; recta en la fase final). */
  const posAt = (offset) => {
    if (offset > playback.duration && playback.final) {
      return finalPosition(flight, playback, Math.min((offset - playback.duration) / playback.finalMs, 1));
    }
    return positionAtTime(flight, playback.times, playback.t0 + Math.min(offset, playback.duration), playback.displayAltM);
  };

  function frame() {
    if (!active) return;
    const now = performance.now();
    const offset = playback.offset;
    const speed = playback.playing ? playback.speed : 1;
    const dtMs = prevNow ? now - prevNow : Infinity;
    const jump = isTimeJump({ prevOffsetMs: prevOffset, offsetMs: offset, dtRealMs: dtMs, playing: playback.playing, speed });
    if (offset === prevOffset && !jump && state && target) {
      // Mismo instante: solo se sigue convergiendo hacia el objetivo ya calculado.
    } else {
      const half = CHASE.windowMs * Math.sqrt(Math.max(1, speed));
      target = viewTarget(motionDirection(posAt, offset, playback.totalDuration, half), prevHeading) ?? target;
    }
    if (!target) return;
    prevOffset = offset;
    prevNow = now;
    state = stepChase(state, target, Math.min(dtMs, 250) / 1000, speed, jump || dtMs > 400);
    prevHeading = state.heading;

    const p = posAt(offset);
    Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altM, undefined, payload);
    Cesium.Transforms.eastNorthUpToFixedFrame(payload, undefined, enu);
    const o = cameraOffsetENU(state.heading, state.pitch, camera.frustum.fovy);
    Cesium.Cartesian3.fromElements(o.e, o.n, o.u, local);
    Cesium.Matrix4.multiplyByPoint(enu, local, eye);
    if (!Cesium.Matrix4.equals(camera.transform, Cesium.Matrix4.IDENTITY)) camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    camera.setView({ destination: eye, orientation: { heading: state.heading, pitch: state.pitch, roll: state.bank } });

    // Pausado: se piden fotogramas hasta que el suavizado converge; después la escena queda estática.
    const settled = Math.abs(wrapPi(target.heading - state.heading)) < 5e-4 && Math.abs(target.pitch - state.pitch) < 5e-4 && Math.abs(state.bank) < 5e-4;
    if (!settled) scene.requestRender();
  }

  scene.preRender.addEventListener(frame);

  return {
    enable() {
      if (active) return;
      active = true;
      state = null;
      target = null;
      prevOffset = null;
      prevNow = 0;
      prevHeading = null;
      controller.enableInputs = false; // la cámara la gobierna la trayectoria; los gestos no la pelean
      scene.requestRender();
    },
    disable() {
      if (!active) return;
      active = false;
      controller.enableInputs = true;
    },
  };
}
