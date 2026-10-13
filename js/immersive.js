// "Vista inmersiva": conecta la cámara perseguidora (js/chasecam.js) con el visor de Cesium.
//
// En cada fotograma que Cesium dibuja (render bajo demanda) se coloca la cámara detrás de la carga
// con camera.setView, en función del instante simulado. No hay trackedEntity ni bucle propio de
// render: durante la reproducción map3d.js ya pide un fotograma por cambio de instante, y al pausar
// solo se piden los fotogramas que faltan para que el suavizado converja (después la escena queda
// estática). Los saltos del tiempo (scrub, Anterior/Siguiente, clic en gráficos, fase) reponen la
// cámara de inmediato en vez de arrastrar el suavizado desde la posición anterior.
//
// Interacción: el usuario puede orbitar (arrastrar con mouse o un dedo), inclinar (arrastrar
// arriba/abajo) y acercar/alejar (rueda o pellizco). No se usa el controlador de Cesium (que
// orbita alrededor del terreno y pelearía con la cámara de cada fotograma): los gestos se
// convierten en un ajuste RELATIVO a la cámara automática (azimut, elevación y factor de
// distancia respecto de la carga, ver manualCamera en chasecam.js). Ese ajuste se conserva al
// reproducir, pausar o saltar en el tiempo, así que la cámara sigue viajando con la carga con la
// nueva posición relativa. `enableInputs` queda activo (clic, brújula, etc.); solo se apagan los
// movimientos de cámara del controlador mientras dura la vista.

import { positionAtTime, finalPosition } from "./playback.js";
import { CHASE, motionDirection, viewTarget, stepChase, manualCamera, clampZoom, isTimeJump, wrapPi } from "./chasecam.js";

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
  const manual = { az: 0, el: 0, zoom: 1 };
  const GESTURE = { orbitRadPerPx: 0.005, tiltRadPerPx: 0.005, wheelPerPx: 0.0012 };
  const CONTROLS = ["enableRotate", "enableTranslate", "enableZoom", "enableTilt", "enableLook"];
  let savedControls = null;
  const compass = document.getElementById("compass");
  let savedCompass = null;
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
    const m = manualCamera(state.heading, state.pitch, camera.frustum.fovy, manual);
    const o = m.offset;
    Cesium.Cartesian3.fromElements(o.e, o.n, o.u, local);
    Cesium.Matrix4.multiplyByPoint(enu, local, eye);
    if (!Cesium.Matrix4.equals(camera.transform, Cesium.Matrix4.IDENTITY)) camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    camera.setView({ destination: eye, orientation: { heading: m.heading, pitch: m.pitch, roll: state.bank } });

    // Pausado: se piden fotogramas hasta que el suavizado converge; después la escena queda estática.
    const settled = Math.abs(wrapPi(target.heading - state.heading)) < 5e-4 && Math.abs(target.pitch - state.pitch) < 5e-4 && Math.abs(state.bank) < 5e-4;
    if (!settled) scene.requestRender();
  }

  scene.preRender.addEventListener(frame);

  // --- Gestos: rueda, arrastre (orbitar/inclinar) y pellizco ---
  const canvas = viewer.canvas;
  const pointers = new Map();
  let pinchDist = 0;
  const pinchSpan = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const changed = () => scene.requestRender();
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!active) return;
      e.preventDefault();
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      manual.zoom = clampZoom(manual.zoom * Math.exp(px * GESTURE.wheelPerPx));
      changed();
    },
    { passive: false },
  );
  canvas.addEventListener("pointerdown", (e) => {
    if (!active) return;
    if (e.pointerType === "mouse" && e.button !== 0) return; // derecho y central no orbitan
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* puntero ya liberado */
    }
    if (pointers.size === 2) pinchDist = pinchSpan();
  });
  canvas.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!active || !prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const span = pinchSpan();
      if (pinchDist > 0 && span > 0) manual.zoom = clampZoom(manual.zoom * (pinchDist / span));
      pinchDist = span;
    } else {
      manual.az += dx * GESTURE.orbitRadPerPx; // arrastrar a la derecha: la cámara gira hacia la izquierda de la escena
      manual.el += dy * GESTURE.tiltRadPerPx; // arrastrar hacia abajo: la cámara sube
      manual.el = Math.max(-1.4, Math.min(1.4, manual.el));
    }
    changed();
  });
  const release = (e) => {
    pointers.delete(e.pointerId);
    pinchDist = pointers.size === 2 ? pinchSpan() : 0;
  };
  for (const type of ["pointerup", "pointercancel"]) canvas.addEventListener(type, release);

  return {
    enable() {
      if (active) return;
      active = true;
      state = null;
      target = null;
      prevOffset = null;
      prevNow = 0;
      prevHeading = null;
      manual.az = 0;
      manual.el = 0;
      manual.zoom = 1;
      pointers.clear();
      // Los movimientos de cámara del controlador de Cesium se apagan (los reemplazan los gestos de
      // arriba); `enableInputs` global sigue activo.
      savedControls = Object.fromEntries(CONTROLS.map((k) => [k, controller[k]]));
      for (const k of CONTROLS) controller[k] = false;
      // La brújula rotaría la cámara, pero la cámara automática la sobrescribe: se deshabilita.
      if (compass) {
        savedCompass = { disabled: compass.disabled };
        compass.disabled = true; // el estilo atenuado sale de #compass:disabled
      }
      scene.requestRender();
    },
    disable() {
      if (!active) return;
      active = false;
      if (savedControls) for (const k of CONTROLS) controller[k] = savedControls[k];
      savedControls = null;
      if (compass && savedCompass) {
        compass.disabled = savedCompass.disabled;
      }
      savedCompass = null;
      pointers.clear();
    },
  };
}
