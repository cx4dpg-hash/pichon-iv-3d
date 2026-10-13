// Representación 3D del conjunto de vuelo: carga útil, antena y (solo en ascenso) línea de
// suspensión, cuello y globo. TODO es una aproximación visual; no son mediciones.
//
// La posición APRS/GPS (lat, lon, altitudeGpsM) corresponde a la electrónica de la CARGA ÚTIL:
// la carga se dibuja centrada en esa posición (interpolada visualmente entre transmisiones).
// El globo se dibuja por encima de la carga mientras dura la fase de ascenso.
//
// TAMAÑO FÍSICO Y AYUDA DE VISIBILIDAD (solo a distancia)
// De cerca, el conjunto se dibuja con dimensiones físicas/modeladas: el globo con su diámetro
// estimado (estimatedBalloonDiameterM) y la carga con 0.45 × 0.25 × 0.18 m (modelo procedural de payload.js: espuma, tapa, cordeles, antena). NO se intenta
// mantener un tamaño angular constante en pantalla: al hacer zoom, el conjunto crece o
// disminuye de forma natural junto con la escena.
//
// Solo cuando el conjunto ya sería demasiado pequeño para verse se aplica una ayuda de
// visibilidad MUY gradual y limitada, la MISMA para todo el conjunto (así la proporción
// globo/carga no cambia nunca):
//
//     t       = clamp( (d − dCerca) / (dLejos − dCerca) , 0 , 1 )
//     escala  = 1 + (escalaMax − 1) · t² · (3 − 2t)          (smoothstep)
//
//   d        distancia cámara → carga útil (m)
//   dCerca   300 m: hasta aquí escala = 1 (tamaño físico)
//   dLejos   2500 m: a partir de aquí la escala se congela en escalaMax (8) y toma el relevo el
//            marcador puntual del indicativo (CX1AA-11); el modelo 3D no se sigue inflando
//
// La ayuda no es el tamaño físico y no altera posición, altitud ni trayectoria.
// `estimatedBalloonDiameterM` nunca se modifica.

import { visualPosition, positionAtTime } from "./playback.js";
import { visualDiameterM } from "./physics.js";
import { buildPayloadModel } from "./payload.js";
import { foamCanvas, labelCanvas } from "./payloadtextures.js";
import { BURST, FRAGMENTS, SHARDS, burstPhase, burstWindowMs, expansionFactor, fragmentProgress, fragmentState, flashState } from "./burst.js";

const Cesium = window.Cesium;

/**
 * Parámetros SOLO visuales (ninguno es un dato de la misión).
 * Las separaciones de suspensión y antena también son visuales: Visual-only rendering offset.
 * Not a measured physical length. Nunca se muestran al usuario como longitudes reales.
 */
export const VISUAL_AID = {
  nearDistanceM: 300, // hasta aquí: escala 1 (tamaño físico)
  farDistanceM: 2500, // desde aquí: escala máxima congelada y marcador puntual del indicativo
  maxScale: 8,
  // visualSuspensionOffset = clamp(0.6 · diámetro estimado, 0.8, 4) m (globo ↔ carga), × escala
  suspensionPerBalloonDiameter: 0.6,
  suspensionMinM: 0.8,
  suspensionMaxM: 4,
  // Forma del globo: elipsoide de revolución algo alargado (alto = 1.12 × ancho) con el mismo
  // volumen que la esfera del diámetro estimado, más un pequeño cuello inferior.
  eggElongation: 1.12,
  neckLengthFactor: 0.35, // largo del cuello respecto del radio horizontal
};

// Compatibilidad con map3d.js: distancia a partir de la cual se muestra el marcador lejano.
VISUAL_AID.maxAidDistanceM = VISUAL_AID.farDistanceM;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/**
 * Escala visual del conjunto completo en función de la distancia de cámara d (m).
 * Vale 1 hasta nearDistanceM, crece suavemente y se congela en maxScale desde farDistanceM.
 */
export function assemblyScale(distanceM) {
  const t = clamp((distanceM - VISUAL_AID.nearDistanceM) / (VISUAL_AID.farDistanceM - VISUAL_AID.nearDistanceM), 0, 1);
  return 1 + (VISUAL_AID.maxScale - 1) * t * t * (3 - 2 * t);
}

const eggCubeRoot = Math.cbrt(VISUAL_AID.eggElongation);

/**
 * Geometría vertical del globo sobre la carga: radios, cuello y línea de suspensión para un
 * diámetro físico estimado (null = sin globo), la escala visual y un factor de expansión (1 =
 * tamaño normal; > 1 solo durante la expansión súbita de la ruptura).
 */
function layoutBalloon(payloadTopAltM, diameterM, scale, expansion = 1) {
  let radiusH = 0; // radio horizontal visual
  let radiusV = 0; // radio vertical visual
  let neckLength = 0;
  let suspensionOffset = 0; // sin globo no hay línea de suspensión
  if (diameterM !== null) {
    const sphereRadius = (diameterM * scale * expansion) / 2;
    radiusH = sphereRadius / eggCubeRoot; // mismo volumen que la esfera del diámetro estimado
    radiusV = radiusH * VISUAL_AID.eggElongation;
    neckLength = radiusH * VISUAL_AID.neckLengthFactor;
    suspensionOffset =
      clamp(VISUAL_AID.suspensionPerBalloonDiameter * diameterM, VISUAL_AID.suspensionMinM, VISUAL_AID.suspensionMaxM) * scale;
  }
  const neckBottomAlt = payloadTopAltM + suspensionOffset;
  const neckTopAlt = neckBottomAlt + neckLength;
  return { radiusH, radiusV, neckLength, suspensionOffset, neckBottomAlt, neckTopAlt, balloonBottomAlt: neckTopAlt, balloonCenterAlt: neckTopAlt + radiusV };
}

export function createBalloonAssembly(viewer, { flight, playback, diameterModel, payloadDimensionsM }) {
  const camera = viewer.camera;
  const scene = viewer.scene;
  const payloadModel = buildPayloadModel(payloadDimensionsM);
  // La caja cuelga de canto: su altura vertical es el lado de 0,25 m (payloadModel.hanging).
  const payloadPhysical = payloadModel.hanging;

  // Ruptura (visual): coincide con la transmisión de máxima altitud. Sin descenso no hay ruptura.
  const transition = diameterModel.estimatedBurstTransition;
  const burstMs = transition ? playback.times[transition.lastAscentIndex] : null;
  const maxDiameterM = transition ? diameterModel.entries[transition.lastAscentIndex].diameterM : null;

  // Estado reutilizable de la animación de rotura (se escribe en cada pose, no se reasigna).
  const frags = FRAGMENTS.map(() => ({
    show: false,
    position: new Cesium.Cartesian3(),
    width: 1,
    height: 1,
    rotation: 0,
    color: new Cesium.Color(1, 1, 1, 1),
  }));
  const burstFrame = new Cesium.Matrix4();
  const local = new Cesium.Cartesian3();
  const fragOut = { x: 0, y: 0, z: 0, angle: 0, flip: 1, shade: 1, scale: 1, alpha: 1 };
  const flashOut = { sizePx: 0, alpha: 0 };

  // Pose calculada para el instante de reproducción y la posición actual de la cámara. Las ~15
  // propiedades dinámicas de las entidades la piden en cada fotograma: se memoiza por
  // (instante, altitudes de render, fase final, posición de cámara); el objeto es de solo lectura.
  let cached = null;
  const cachedKey = { offset: NaN, speed: NaN, alt: null, final: null, x: NaN, y: NaN, z: NaN };
  function getPose() {
    const cam = camera.positionWC;
    const k = cachedKey;
    if (cached && k.offset === playback.offset && k.speed === playback.speed && k.alt === playback.displayAltM && k.final === playback.final && k.x === cam.x && k.y === cam.y && k.z === cam.z) {
      return cached;
    }
    cached = computePose();
    k.offset = playback.offset;
    k.speed = playback.speed; // la duración de la rotura depende de la velocidad elegida
    k.alt = playback.displayAltM;
    k.final = playback.final;
    k.x = cam.x;
    k.y = cam.y;
    k.z = cam.z;
    return cached;
  }

  function computePose() {
    const p = visualPosition(flight, playback);
    let altM = p.altM; // copia local: p es el objeto compartido/memoizado
    const finalF = playback.final ? playback.finalFraction : 0;
    const at = (a) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, a);
    let payloadCenter = at(altM);
    const d = Cesium.Cartesian3.distance(camera.positionWC, payloadCenter);

    // Una única escala para todo el conjunto (proporción globo/carga constante): 1 de cerca.
    const scale = assemblyScale(d);

    // Carga útil: tamaño físico × escala; centrada en la posición GPS.
    const payload = {
      length: payloadPhysical.length * scale,
      width: payloadPhysical.width * scale,
      height: payloadPhysical.height * scale,
    };
    // Fase final no telemétrica: la carga acaba APOYADA en el terreno (centro = terreno + mitad de su
    // altura visual), sea cual sea la escala de visualización; el ajuste crece con la fase.
    if (finalF > 0) {
      altM += finalF * (payload.height / 2 + 0.02 - playback.final.offsetM);
      payloadCenter = at(altM);
    }
    const payloadTop = altM + payload.height / 2;

    // Globo: intacto en el ascenso; en la ruptura se expande y estalla (burst.js); después del
    // estallido no se dibuja (los fragmentos se ven aparte).
    const phase = burstPhase(playback.absoluteMs, burstMs, playback.speed);
    let physicalDiameterM = null;
    let expansion = 1;
    if (phase.state === "intact") {
      physicalDiameterM = visualDiameterM(diameterModel, playback.index, playback.fraction);
    } else if (phase.state === "expanding") {
      physicalDiameterM = maxDiameterM; // tamaño máximo estimado, inflándose
      expansion = expansionFactor(phase.p);
    }
    const balloonVisible = physicalDiameterM !== null;
    const { radiusH, radiusV, neckLength, neckBottomAlt, balloonBottomAlt, balloonCenterAlt } = layoutBalloon(
      payloadTop,
      physicalDiameterM,
      scale,
      expansion,
    );
    const burst =
      phase.state === "expanding" || phase.state === "fragments"
        ? computeBurst(phase, scale, payload, at(balloonCenterAlt), p)
        : null;
    if (!burst) for (const f of frags) f.show = false;

    return {
      cameraDistanceM: d,
      balloonVisible,
      physicalDiameterM, // m físicos estimados; null si el globo no se representa
      assemblyScale: scale,
      payload,
      radiusH,
      radiusV,
      neckLength,
      payloadCenter,
      payloadCenterAltM: altM,
      // Vértice donde confluyen los cordeles de la carga: de aquí parte la línea de suspensión.
      payloadTop: at(payloadTop + payloadModel.riseAboveTopM * scale),
      neckBottom: at(neckBottomAlt),
      neckCenter: at(neckBottomAlt + neckLength / 2),
      balloonCenter: at(balloonCenterAlt),
      balloonCenterAltM: balloonCenterAlt,
      balloonBottomAltM: balloonBottomAlt,
      burstState: phase.state,
      burst, // null fuera de la rotura; { state, p, anchor, flash }
    };
  }

  /**
   * Rotura en curso: durante la expansión el ancla es el globo (unido a la carga). Desde el
   * estallido los fragmentos se desplazan con la carga (misma masa de aire: horizontalmente
   * por completo y, en vertical, la fracción BURST.followVertical de su descenso) y se calculan
   * como función pura del progreso (burst.js).
   */
  function computeBurst(phase, scale, payload, liveCenter, payloadPos) {
    const hasFlash = flashState(phase.p, flashOut);
    const out = {
      state: phase.state,
      p: phase.p,
      anchor: liveCenter,
      flash: hasFlash ? { sizePx: flashOut.sizePx, alpha: flashOut.alpha } : null,
    };
    if (phase.state !== "fragments") {
      for (const f of frags) f.show = false;
      return out;
    }
    // Dónde estaba el globo al estallar (fin de la expansión): se calcula con la misma geometría.
    const tBurst = burstMs + BURST.expandFrac * burstWindowMs(playback.speed);
    const at0 = positionAtTime(flight, playback.times, tBurst, playback.displayAltM);
    const lay = layoutBalloon(at0.altM + payload.height / 2, maxDiameterM, scale, expansionFactor(BURST.expandFrac));
    // Los restos caen en el mismo aire fino que la carga: acompañan la mayor parte de su descenso.
    const sinceBurstM = payloadPos.altM - at0.altM;
    const anchor = Cesium.Cartesian3.fromDegrees(
      payloadPos.lon,
      payloadPos.lat,
      lay.balloonCenterAlt + BURST.followVertical * sinceBurstM,
    );
    const R = lay.radiusH;
    out.anchor = anchor;
    Cesium.Transforms.eastNorthUpToFixedFrame(anchor, undefined, burstFrame);
    const q = fragmentProgress(phase.p);
    FRAGMENTS.forEach((def, i) => {
      const f = frags[i];
      fragmentState(def, q, fragOut);
      local.x = fragOut.x * R;
      local.y = fragOut.y * R;
      local.z = fragOut.z * R;
      Cesium.Matrix4.multiplyByPoint(burstFrame, local, f.position);
      // Lámina plana (sprite): el volteo estrecha el ancho y el giro la rota en pantalla.
      f.width = def.width * R * fragOut.scale * fragOut.flip;
      f.height = def.length * R * fragOut.scale;
      f.rotation = fragOut.angle;
      f.color.red = f.color.green = f.color.blue = fragOut.shade;
      f.color.alpha = fragOut.alpha;
      f.show = fragOut.alpha > 0;
    });
    return out;
  }

  const creamBalloon = Cesium.Color.fromCssColorString("#fff3d6").withAlpha(0.82);
  const creamNeck = Cesium.Color.fromCssColorString("#e9dcb8").withAlpha(0.92);
  const polystyrene = Cesium.Color.fromCssColorString("#f4efe2");

  const body = viewer.entities.add({
    id: "balloon-body",
    position: new Cesium.CallbackProperty(() => getPose().balloonCenter, false),
    ellipsoid: {
      radii: new Cesium.CallbackProperty(() => {
        const pose = getPose();
        const a = Math.max(pose.radiusH, 0.01);
        return new Cesium.Cartesian3(a, a, Math.max(pose.radiusV, 0.01));
      }, false),
      material: creamBalloon,
      show: new Cesium.CallbackProperty(() => getPose().balloonVisible, false),
    },
  });

  const neck = viewer.entities.add({
    id: "balloon-neck",
    position: new Cesium.CallbackProperty(() => getPose().neckCenter, false),
    cylinder: {
      length: new Cesium.CallbackProperty(() => Math.max(getPose().neckLength, 0.01), false),
      topRadius: new Cesium.CallbackProperty(() => Math.max(getPose().radiusH * 0.14, 0.005), false),
      bottomRadius: new Cesium.CallbackProperty(() => Math.max(getPose().radiusH * 0.05, 0.005), false),
      material: creamNeck,
      show: new Cesium.CallbackProperty(() => getPose().balloonVisible, false),
    },
  });

  // Línea de suspensión: une la carga con el cuello del globo, por lo que solo existe con globo.
  const suspensionLine = viewer.entities.add({
    id: "balloon-suspension",
    polyline: {
      positions: new Cesium.CallbackProperty(() => [getPose().payloadTop, getPose().neckBottom], false),
      width: 1.5,
      material: Cesium.Color.fromCssColorString("#d8d8d8"),
      arcType: Cesium.ArcType.NONE,
      show: new Cesium.CallbackProperty(() => getPose().balloonVisible, false),
    },
  });

  // Carga útil y antena: geometría procedural (payload.js) construida UNA vez en coordenadas
  // locales; solo se mueve la matriz de modelo (ENU en la posición GPS × escala visual). Son 5
  // objetos de dibujo (espuma con grano, cajas de color, aristas, etiqueta y una colección de
  // líneas), sin entidades dinámicas.
  const foamInstances = [];
  const solidInstances = [];
  const outlineInstances = [];
  const colorAttr = (css, alpha = 1) =>
    Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString(css).withAlpha(alpha));
  const texturedFormat = Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat;
  for (const b of payloadModel.boxes) {
    const dimensions = new Cesium.Cartesian3(...b.size);
    const center = new Cesium.Cartesian3(...b.center);
    const modelMatrix = Cesium.Matrix4.fromRotationTranslation(Cesium.Matrix3.fromRotationY(Cesium.Math.toRadians(b.rotY)), center);
    if (b.foam) {
      foamInstances.push(
        new Cesium.GeometryInstance({ geometry: Cesium.BoxGeometry.fromDimensions({ dimensions, vertexFormat: texturedFormat }), modelMatrix }),
      );
    } else {
      solidInstances.push(
        new Cesium.GeometryInstance({
          geometry: Cesium.BoxGeometry.fromDimensions({ dimensions, vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT }),
          modelMatrix,
          attributes: { color: colorAttr(b.color) },
        }),
      );
    }
    if (b.outline) {
      outlineInstances.push(
        new Cesium.GeometryInstance({
          geometry: Cesium.BoxOutlineGeometry.fromDimensions({ dimensions }),
          modelMatrix,
          attributes: { color: colorAttr("#b4b0a3") },
        }),
      );
    }
  }
  const payloadFoam = scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: foamInstances,
      appearance: new Cesium.MaterialAppearance({
        material: Cesium.Material.fromType("Image", { image: foamCanvas(), repeat: new Cesium.Cartesian2(2, 1.4) }),
        materialSupport: Cesium.MaterialAppearance.MaterialSupport.TEXTURED,
        translucent: false,
        closed: true,
      }),
      asynchronous: false,
      allowPicking: false,
    }),
  );
  const payloadSolids = scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: solidInstances,
      appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true }),
      asynchronous: false,
      allowPicking: false,
    }),
  );
  const payloadOutlines = outlineInstances.length
    ? scene.primitives.add(
        new Cesium.Primitive({
          geometryInstances: outlineInstances,
          appearance: new Cesium.PerInstanceColorAppearance({ flat: true, translucent: false }),
          asynchronous: false,
          allowPicking: false,
        }),
      )
    : null; // los cantos suaves de la espuma no llevan contorno dibujado
  const payloadLines = scene.primitives.add(new Cesium.PolylineCollection());
  for (const l of payloadModel.lines) {
    payloadLines.add({
      positions: l.points.map((pt) => new Cesium.Cartesian3(...pt)),
      width: l.width,
      material: Cesium.Material.fromType("Color", { color: Cesium.Color.fromCssColorString(l.color) }),
    });
  }

  // Etiqueta: cuadrilátero con textura pegado a la cara lateral y < 0 (visto desde afuera, +x a la
  // derecha). Se crea cuando cargan los logos; hasta entonces la cara queda de espuma lisa.
  let payloadLabel = null;
  const frameMatrix = new Cesium.Matrix4();
  const lastMatrix = new Cesium.Matrix4();
  labelCanvas().then((canvas) => {
    const { center: c, width, height } = payloadModel.label;
    const x0 = c[0] - width / 2;
    const x1 = c[0] + width / 2;
    const z0 = c[2] - height / 2;
    const z1 = c[2] + height / 2;
    const geometry = new Cesium.Geometry({
      attributes: {
        position: new Cesium.GeometryAttribute({
          componentDatatype: Cesium.ComponentDatatype.DOUBLE,
          componentsPerAttribute: 3,
          values: [x0, c[1], z0, x1, c[1], z0, x1, c[1], z1, x0, c[1], z1],
        }),
        normal: new Cesium.GeometryAttribute({
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          componentsPerAttribute: 3,
          values: [0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0],
        }),
        st: new Cesium.GeometryAttribute({
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          componentsPerAttribute: 2,
          values: [0, 0, 1, 0, 1, 1, 0, 1],
        }),
      },
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      boundingSphere: Cesium.BoundingSphere.fromPoints([new Cesium.Cartesian3(x0, c[1], z0), new Cesium.Cartesian3(x1, c[1], z1)]),
    });
    payloadLabel = scene.primitives.add(
      new Cesium.Primitive({
        geometryInstances: new Cesium.GeometryInstance({ geometry }),
        appearance: new Cesium.MaterialAppearance({
          material: Cesium.Material.fromType("Image", { image: canvas }),
          materialSupport: Cesium.MaterialAppearance.MaterialSupport.TEXTURED,
          translucent: false,
          closed: false,
        }),
        asynchronous: false,
        allowPicking: false,
      }),
    );
    Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY, lastMatrix); // fuerza asignar la matriz en el próximo fotograma
    lastMatrix[0] = NaN;
    scene.requestRender();
  });

  // La matriz se actualiza en cada fotograma que Cesium dibuja (render bajo demanda: en pausa no
  // hay trabajo). Solo se reasigna si cambió.
  scene.preUpdate.addEventListener(() => {
    const pose = getPose();
    Cesium.Transforms.eastNorthUpToFixedFrame(pose.payloadCenter, undefined, frameMatrix);
    Cesium.Matrix4.multiplyByUniformScale(frameMatrix, pose.assemblyScale, frameMatrix);
    if (Cesium.Matrix4.equals(frameMatrix, lastMatrix)) return;
    Cesium.Matrix4.clone(frameMatrix, lastMatrix);
    for (const prim of [payloadFoam, payloadSolids, payloadOutlines, payloadLines, payloadLabel]) {
      if (prim) Cesium.Matrix4.clone(frameMatrix, prim.modelMatrix);
    }
  });

  // --- Rotura: trozos de látex y destello para la vista lejana ---
  // Cada trozo es un sprite (billboard) con una silueta irregular dibujada una vez en un lienzo:
  // mate, de dos tonos separados por un pliegue, sin brillos. Sin assets externos.
  const SHARD_TONES = [
    ["#f3eddf", "#d8d0bf"], // crema
    ["#e9e4d8", "#c4c0b5"], // gris crema
    ["#f6f3ec", "#dad6cc"], // blanco suave
  ];
  const shardImages = new Map();
  function shardImage(shape, tone) {
    const key = `${shape}-${tone}`;
    if (shardImages.has(key)) return shardImages.get(key);
    const size = 96;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const g = canvas.getContext("2d");
    const s = SHARDS[shape];
    const [light, dark] = SHARD_TONES[tone];
    const map = ([x, y]) => [size / 2 + x * (size - 8), size / 2 + y * (size - 8)];
    const outline = () => {
      g.beginPath();
      s.pts.forEach((pt, k) => {
        const [px, py] = map(pt);
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.closePath();
    };
    outline();
    g.fillStyle = light;
    g.fill();
    // Segunda mitad, más oscura, a un lado del pliegue
    g.save();
    outline();
    g.clip();
    g.translate(size / 2, size / 2);
    g.rotate(s.fold);
    g.fillStyle = dark;
    g.fillRect(0, -size, size, size * 2);
    g.restore();
    // Pliegue y borde finos (mate: sin degradados brillantes)
    g.strokeStyle = "rgba(110,104,92,0.55)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(size / 2 - Math.cos(s.fold + Math.PI / 2) * size * 0.45, size / 2 - Math.sin(s.fold + Math.PI / 2) * size * 0.45);
    g.lineTo(size / 2 + Math.cos(s.fold + Math.PI / 2) * size * 0.45, size / 2 + Math.sin(s.fold + Math.PI / 2) * size * 0.45);
    g.stroke();
    outline();
    g.stroke();
    shardImages.set(key, canvas);
    return canvas;
  }

  // Precalentamiento: Cesium crea el sprite, sube su textura y compila las variantes de shader
  // (opaca/translúcida y con rotación) la primera vez que se usan, lo que causaba un único tirón
  // (~100 ms) en el primer estallido. Durante unos fotogramas iniciales se "muestran" con tamaño de
  // 1 cm sobre la carga (imperceptible, dentro del cuadro) para hacerlo antes.
  let warmFrames = 4;
  const stopWarm = scene.postRender.addEventListener(() => {
    if (--warmFrames <= 0) stopWarm();
  });
  // Mitad opacos y mitad translúcidos: Cesium compila una variante de shader por cada pasada.
  const warmOpaque = new Cesium.Color(1, 1, 1, 1);
  const warmTranslucent = new Cesium.Color(1, 1, 1, 0.5);

  const fragmentEntities = FRAGMENTS.map((def, i) =>
    viewer.entities.add({
      id: `balloon-fragment-${i}`,
      position: new Cesium.CallbackProperty(() => (warmFrames > 0 ? getPose().payloadCenter : (getPose(), frags[i].position)), false),
      billboard: {
        image: shardImage(def.shape, def.tone),
        sizeInMeters: true,
        width: new Cesium.CallbackProperty(() => (warmFrames > 0 ? 0.01 : frags[i].width), false),
        height: new Cesium.CallbackProperty(() => (warmFrames > 0 ? 0.01 : frags[i].height), false),
        // Rotación no nula durante el precalentamiento: Cesium recompila el shader de la colección
        // la primera vez que algún sprite rota (era el tirón de ~100 ms del primer estallido).
        rotation: new Cesium.CallbackProperty(() => (warmFrames > 0 ? 0.3 : frags[i].rotation), false),
        color: new Cesium.CallbackProperty(() => (warmFrames > 0 ? (i % 2 ? warmTranslucent : warmOpaque) : frags[i].color), false),
        show: new Cesium.CallbackProperty(() => (getPose(), warmFrames > 0 || frags[i].show), false),
      },
    }),
  );

  // Destello: solo con la cámara lejos (donde el globo 3D no se distingue); desaparece en ~1 s.
  const flashColor = new Cesium.Color(1, 0.953, 0.839, 1);
  const flash = viewer.entities.add({
    id: "balloon-burst-flash",
    position: new Cesium.CallbackProperty(() => getPose().burst?.anchor, false),
    point: {
      pixelSize: new Cesium.CallbackProperty(() => getPose().burst?.flash?.sizePx ?? 1, false),
      color: new Cesium.CallbackProperty(() => {
        flashColor.alpha = getPose().burst?.flash?.alpha ?? 0;
        return flashColor;
      }, false),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(VISUAL_AID.farDistanceM, Number.MAX_VALUE),
      show: new Cesium.CallbackProperty(() => Boolean(getPose().burst?.flash), false),
    },
  });

  /**
   * Extensión de la rotura respecto de la carga (m): hacia arriba y a los lados, para encuadrarla.
   * Usa el tamaño máximo del globo con su expansión, a la escala visual dada.
   */
  function burstFraming(scale) {
    if (maxDiameterM === null) return null;
    const lay = layoutBalloon((payloadPhysical.height * scale) / 2, maxDiameterM, scale, 1 + BURST.expansion);
    return { upM: lay.balloonCenterAlt + 3.4 * lay.radiusH, sideM: 5 * lay.radiusH };
  }

  return { getPose, scaleAt: assemblyScale, body, neck, suspensionLine, payloadModel, payloadFoam, payloadSolids, payloadOutlines, payloadLines, fragmentEntities, flash, burstMs, burstFraming };
}
