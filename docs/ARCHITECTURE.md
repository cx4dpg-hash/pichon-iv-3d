# Arquitectura preliminar

Documento preliminar. Describe la separación conceptual en módulos; **nada de esto está implementado todavía** y puede cambiar por decisión de Pedro y ChatGPT.

Principios: sitio estático, sin backend, rutas relativas, módulos ES, datos separados del código.

## 1. Datos maestros del vuelo (`data/vuelo/`)
Información fija del vuelo: identificación (PICHÓN IV, CX1AA-11), fecha, lugar de lanzamiento y metadatos. Solo datos provenientes de fuentes proporcionadas.

## 2. Telemetría (`data/telemetria/`)
Tramas recibidas del globo (tiempo, posición, altitud, etc.), con soporte conceptual para duplicados y paquetes retrasados. Los valores desconocidos se representan como desconocidos.

## 3. Estaciones terrestres (`data/estaciones/`)
Catálogo de estaciones: indicativo, tipo (fija / móvil) y posición cuando se conoce.
- Fijas: CX4DPG-1, CX2TN-1, CX2CQ-1, CX2ACB-1.
- Móvil: CX3BP-8 — posición desconocida (sin coordenadas).

También registrará qué estación reportó primero cada trama a APRS-IS.

## 4. Motor temporal
Reloj de reproducción: tiempo actual, Play/Pausa, cursor manual, velocidades e interpolación entre tramas. Independiente de la visualización.

## 5. Visualización 3D
Terreno, globo, trayectoria y enlaces globo → estación, con CesiumJS (a incorporar cuando se autorice). Consume el estado del motor temporal.

### Módulos implementados (etapas 4 y 5)

```
js/app.js       punto de entrada: conecta los módulos
js/data.js      carga de JSON (transmissions, stations, flight)
js/playback.js  motor temporal e interpolación visual de posición/altitud
js/physics.js   cálculo del diámetro estimado del globo (sin Cesium)
js/balloon.js   representación 3D: globo, suspensión, carga útil, antena, escala visual
js/map3d.js     visor CesiumJS, trayectoria, marcadores, enlace al primer IGate, cámara
js/stations.js  estaciones terrestres y resolución del primer IGate
js/ui.js        panel de información, controles y timeline
js/charts.js    ocho gráficos de telemetría (Chart.js) con cursor sincronizado (etapas 6 y 8)
js/phases.js    fases (preLaunch / vuelo efectivo) y detección de la liberación (criterio reproducible; con pruebas)
js/recovery.js  punto de rescate y tramo final no telemétrico (anotación complementaria; etapa 10)
js/floor.js     corrección visual de altura al terreno (función pura, con pruebas)
js/terrainfloor.js aplica esa corrección cuando hay relieve activo
js/clouds.js    infraestructura de la antigua capa satelital 2D (RETIRADA de la UI; no se importa ni se carga). Se conserva como referencia
js/presentation.js botón de ocultar/mostrar el panel izquierdo y modo presentación (Fullscreen API); solo visibilidad (etapa 14)
data/clouds/    modelo meteorológico de nubosidad (cloud-model.json) y sus fuentes; aún no lo lee la aplicación
tools/cloud-model/ script reproducible (Python) que genera el modelo desde GOES-19 L2 y METAR
js/compass.js   brújula de la cámara (heading/pitch, reset a Norte arriba; etapa 9)
js/derived.js   datos derivados (velocidad vertical entre transmisiones consecutivas)
js/terrain.js   base cartográfica: mapa básico u, opcionalmente, Cesium Ion (satélite + relieve)
config.example.js / config.local.js   configuración local (token de Cesium Ion); config.local.js no se versiona
js/format.js    formateo de horas locales (UTC−3) compartido por ui.js y charts.js
js/reception.js "Mi recepción": interfaz de carga de logs, capa 3D de recepciones y fila del panel (etapa 7)
js/importer/    importador local de logs, sin DOM ni red:
  adapters.js     adaptadores de formato (direwolf-csv, aprs-packet)
  parser.js       detección de formato y parseo línea a línea
  matcher.js      matching contra el maestro (exact / probable / ambiguous / unmatched)
  stats.js        duplicados, cobertura, distancia horizontal
  index.js        orquestador (parseo → matching → estadísticas)
```

La física (`physics.js`) está separada de la representación (`balloon.js`). Ver `docs/PHYSICS.md`.

Importador de logs (etapa 7): el log se lee con la File API y se procesa en el navegador (`js/importer/`, módulos puros que también corren en Node para `tests/importer.test.mjs`). El maestro nunca se modifica; la recepción local (`reception.js`) es independiente de `firstIgate`. Ver `docs/LOG_IMPORT.md`.

Fases del vuelo: `data.js` parte, en memoria, el array `flight` de `transmissions.json` (155 transmisiones con GPS válido, frames 3 a 157) con `phases.js`: `data.preLaunch` (frames 3 a 9, en tierra) y `data.flight` (vuelo efectivo, frames 10 a 157, 148 transmisiones). `data.flightAll` conserva todas. Todo el resto (reproducción, trayectoria, gráficos, modelo del globo, firstIgate, "Mi recepción") trabaja sobre `data.flight`; el matcher del importador incluye además el grupo `preLaunch` para no perder coincidencias, sin contarlo en la cobertura. `transmissions.json` no se modifica.

Etapa 10:
- **Altura de render.** `positionAtTime(flight, times, t, altitudes)` acepta altitudes de render por transmisión (`playback.displayAltM`); sin ellas usa `altitudeGpsM` tal cual. La corrección visual al terreno (`floor.js`, aplicada por `terrainfloor.js` solo con relieve) rellena ese arreglo; la carga, la línea amarilla, los marcadores y los puntos de "Mi recepción" leen la misma fuente, así que siguen coincidiendo. El dataset y los gráficos usan siempre el valor bruto.
- **Rescate.** `recovery.json` se carga aparte de `transmissions.json`; `recovery.js` dibuja marcador, línea punteada y etiquetas sin tocar la trayectoria principal.
- **Nubes.** La capa 2D fue retirada deliberadamente (decisión de producto): `app.js` no importa `clouds.js`, no hay botón ni rótulo, y no se descarga `assets/clouds/` en el uso normal. Los fotogramas y el manifiesto se conservan para la futura nube 3D.

Etapa 14:
- **Presentación.** `presentation.js` no crea estado propio de reproducción: el panel se oculta con el atributo `hidden` y el modo presentación es la clase `presentation` sobre `#app`, que sigue al evento real `fullscreenchange` (Escape, F11, botón o API). Entrar/salir solo cambia la visibilidad (CSS) y pide a Cesium `viewer.resize()`; tiempo, velocidad, cámara y seguimiento no se tocan.
- **Nubes: modelo meteorológico.** `data/clouds/cloud-model.json` (valores meteorológicos con trazabilidad) está preparado y la representación volumétrica 3D está pendiente; el modelo lo genera `tools/cloud-model/build_cloud_model.py` y se valida con `tests/cloudmodel.test.mjs`. Ver `docs/CLOUD_MODEL.md`.

Brújula e identidad (etapa 9): `compass.js` lee `viewer.camera.heading/pitch` en `scene.preRender` y rota un SVG; el clic rota la cámara alrededor del punto observado (cámara libre) o dentro del marco ENU de la carga (Seguir globo) sin cancelar el seguimiento. Los logos están en `assets/branding/` (ver `docs/BRANDING.md`).

Posición y trayectoria (una sola fuente geométrica): `positionAtTime(flight, times, t)` en `playback.js` es la única interpolación visual de la posición de la carga (lineal en lat, lon y altitudeGpsM entre transmisiones reales). La carga animada (`visualPosition`) y la línea amarilla (`trajectorySamples`, un remuestreo de esa misma función cada 5 s que conserva siempre las 155 transmisiones reales) dependen de ella, así que la carga está siempre sobre la línea. Antes la línea unía solo las 155 posiciones con segmentos rectos en coordenadas cartesianas (cuerdas), mientras la carga seguía una curva (interpolación lineal en lat/lon/altitud): la diferencia llegaba a ≈ 0.42 m en los intervalos de 120 s. Los puntos intermedios son solo geometría de render (no son transmisiones, no se agregan al dataset y no tienen telemetría).

Cartografía (etapa 8): `terrain.js` mantiene OpenStreetMap + elipsoide por defecto y, si `config.local.js` aporta un token válido, cambia a Cesium World Imagery + World Terrain; si falla, conserva el modo básico. El relieve es solo de representación (no toca lat/lon/altitudeGpsM). Las alturas de terreno de las estaciones se consultan en tiempo de ejecución y no se guardan. Ver `docs/MAPPING.md`.

Telemetría (etapas 6 y 8): `charts.js` crea los ocho gráficos una sola vez (se muestran 2 por página, en 4 páginas; paginar solo cambia la visibilidad y pone al día los gráficos que se hacen visibles) a partir de `flight` y expone `sync()`, que `app.js` engancha a `playback.onChange`. Solo se mueve el cursor (un `<div>` superpuesto) y se resalta el punto de la transmisión vigente; el clic en un punto llama a `playback.seekToIndex` (sin Play). Chart.js 4.4.1 se carga por CDN con versión fijada. Ver `docs/TELEMETRY.md`.

Decisiones del modelo del conjunto de vuelo:

- La posición GPS es la de la **carga útil**: la carga se dibuja en esa posición, la antena debajo y el globo encima (solo en ascenso).
- La fórmula de expansión se aplica solo hasta la transmisión de máxima altitud (determinada desde los datos). Desde la siguiente se considera la **transición estimada de ruptura/descenso** (inferida del perfil de vuelo; no se conoce el instante exacto): no se calcula diámetro ni se dibuja la esfera.
- Suspensión y antena no tienen longitudes físicas conocidas; sus separaciones son offsets solo visuales (`visualSuspensionOffset`, `visualAntennaOffset`). No hay factor de exageración fijo ni tamaño angular constante: `balloon.js` dibuja el conjunto con tamaño físico (escala 1) hasta 300 m y aplica una ayuda de visibilidad común, suave y limitada (máx. ×8) solo entre 300 y 2500 m; más allá se usa el marcador lejano. Separada del diámetro estimado. Ver `docs/PHYSICS.md`. La cámara usa los controles por defecto de Cesium y el seguimiento nativo (`trackedEntity`); ver `docs/MAPPING.md`.

## 6. Importador futuro de logs externos
Carga local, en el navegador, de logs de radioaficionados para resaltar las tramas recibidas por cada uno. Sin envío al servidor. Los archivos de ejemplo/trabajo irían en `imports/`.

## 7. Interfaz de usuario
Controles (reproducción, cursor temporal, velocidad), panel de telemetría y selección de estaciones. Punto de entrada: `index.html` + `js/app.js` + `css/app.css`.

## Estructura de carpetas

```
index.html
css/        estilos
js/         módulos ES
data/       vuelo/ estaciones/ telemetria/
assets/     recursos estáticos
imports/    logs externos de ejemplo/trabajo
docs/       documentación
tests/      pruebas
```
