// Brújula / control de orientación de la CÁMARA (no de la trayectoria del globo).
//
// - La aguja "N" rota con viewer.camera.heading: señala dónde está el Norte respecto de la vista.
// - Clic (o Enter/Espacio con el foco) = "Norte arriba": heading = 0 conservando la posición
//   aproximada de la cámara, la distancia al punto observado y la inclinación (pitch). No es un
//   flyTo a la vista general: es una rotación breve (~0.45 s) alrededor del punto observado.
// - Funciona en Vista general (cámara libre) y en Seguir globo (trackedEntity), sin cancelar el
//   seguimiento: en seguimiento se rota la cámara alrededor de la carga dentro de su propio marco
//   local (el que usa Cesium para el seguimiento).
// - Indicador discreto de inclinación: 0° = vista cenital (pitch −90°), 90° = horizonte.

const Cesium = window.Cesium;

const TWEEN_MS = 450;
const HEADING_EPS_DEG = 0.05;

const normalizePi = (a) => {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  if (x < -Math.PI) x += 2 * Math.PI;
  return x;
};

export function initCompass({ viewer }) {
  const button = document.getElementById("compass");
  const dial = document.getElementById("compassDial");
  const pitchLabel = document.getElementById("compassPitch");
  const camera = viewer.camera;
  const scene = viewer.scene;
  let lastHeadingDeg = null;
  let lastPitchDeg = null;
  let tween = null;

  // --- Indicador: se actualiza en cada fotograma solo si cambió ---
  function update() {
    const headingDeg = Cesium.Math.toDegrees(camera.heading);
    const pitchDeg = Cesium.Math.toDegrees(camera.pitch);
    if (lastHeadingDeg === null || Math.abs(normalizePi(Cesium.Math.toRadians(headingDeg - lastHeadingDeg))) > Cesium.Math.toRadians(HEADING_EPS_DEG)) {
      lastHeadingDeg = headingDeg;
      // El Norte queda a −heading respecto del "arriba" de la pantalla.
      dial.style.transform = `rotate(${(-headingDeg).toFixed(2)}deg)`;
      const shown = Math.round(((headingDeg % 360) + 360) % 360) % 360;
      button.title = `Orientación de la cámara: ${shown}°. Clic: Norte arriba`;
    }
    if (lastPitchDeg === null || Math.abs(pitchDeg - lastPitchDeg) >= 0.5) {
      lastPitchDeg = pitchDeg;
      pitchLabel.textContent = `Incl. ${Math.round(90 + pitchDeg)}°`;
    }
  }
  scene.preRender.addEventListener(update);

  // --- Reset a Norte arriba ---
  function stopTween() {
    if (!tween) return;
    cancelAnimationFrame(tween.raf);
    if (tween.releaseTransform) camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    tween = null;
  }

  function animate(step, releaseTransform) {
    stopTween();
    const t0 = performance.now();
    tween = { raf: 0, releaseTransform };
    const frame = (now) => {
      const u = Math.min((now - t0) / TWEEN_MS, 1);
      const eased = u * u * (3 - 2 * u);
      step(eased, u === 1);
      if (u < 1) tween.raf = requestAnimationFrame(frame);
      else {
        if (releaseTransform) camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        tween = null;
      }
    };
    tween.raf = requestAnimationFrame(frame);
  }

  /** Cámara libre: rota alrededor del punto del terreno/globo que hay en el centro de la pantalla. */
  function resetFree() {
    const canvas = scene.canvas;
    const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const target = scene.globe.pick(camera.getPickRay(center), scene);
    if (!target) {
      // Mirando al cielo o al horizonte: no hay punto observado; se gira sobre la propia cámara.
      camera.setView({ orientation: { heading: 0, pitch: camera.pitch, roll: 0 } });
      return;
    }
    const camPos = Cesium.Cartesian3.clone(camera.positionWC);
    const toTarget = Cesium.Cartesian3.subtract(target, camPos, new Cesium.Cartesian3());
    const range = Cesium.Cartesian3.magnitude(toTarget);
    const dir = Cesium.Cartesian3.normalize(toTarget, new Cesium.Cartesian3());
    const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(target, new Cesium.Cartesian3());
    const pitch = Math.asin(Cesium.Math.clamp(Cesium.Cartesian3.dot(dir, up), -1, 1));
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(target);
    const local = Cesium.Matrix4.multiplyByPointAsVector(Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4()), dir, new Cesium.Cartesian3());
    const h0 = Math.atan2(local.x, local.y);
    const delta = normalizePi(0 - h0);
    animate((e, done) => {
      let h = h0 + delta * e;
      camera.lookAt(target, new Cesium.HeadingPitchRange(h, pitch, range));
      if (done) {
        // El heading de la cámara se mide en su propia posición (los meridianos convergen):
        // un par de correcciones lo dejan en 0 con error despreciable.
        for (let k = 0; k < 2; k++) {
          const err = normalizePi(camera.heading);
          if (Math.abs(err) < 1e-4) break;
          h -= err;
          camera.lookAt(target, new Cesium.HeadingPitchRange(h, pitch, range));
        }
      }
    }, true);
  }

  /** Seguir globo: se rota la cámara dentro del marco local (ENU) de la entidad seguida. */
  function resetTracked() {
    const frame = Cesium.Matrix4.clone(camera.transform);
    const d = camera.direction; // en el marco de la transformación actual (ENU de la carga)
    const range = Cesium.Cartesian3.magnitude(camera.position);
    const pitch = Math.asin(Cesium.Math.clamp(d.z, -1, 1));
    const h0 = Math.atan2(d.x, d.y);
    const delta = normalizePi(0 - h0);
    animate((e) => {
      // El marco se vuelve a leer en cada paso: la carga puede estar moviéndose (reproducción).
      camera.lookAtTransform(Cesium.Matrix4.clone(camera.transform ?? frame), new Cesium.HeadingPitchRange(h0 + delta * e, pitch, range));
    }, false);
  }

  function resetNorth() {
    if (viewer.trackedEntity) resetTracked();
    else resetFree();
  }

  button.addEventListener("click", resetNorth);
  // Si el usuario toma el control, se cancela la animación de reset.
  for (const type of ["pointerdown", "wheel"]) scene.canvas.addEventListener(type, stopTween, { passive: true });

  update();
  return { resetNorth, update };
}
