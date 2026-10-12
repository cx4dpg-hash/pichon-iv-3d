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
```

La física (`physics.js`) está separada de la representación (`balloon.js`). Ver `docs/PHYSICS.md`.

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
