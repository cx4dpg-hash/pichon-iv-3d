# PICHÓN IV 3D

Aplicación web interactiva que reconstruirá en 3D el vuelo real del globo estratosférico **PICHÓN IV** (indicativo APRS **CX1AA-11**), lanzado el 11 de octubre de 2026 en Uruguay.

## Objetivo general

Mostrar posición, altitud, trayectoria, telemetría sincronizada y enlaces del globo con las estaciones terrenas que reportaron cada trama a APRS-IS, con reproducción temporal interactiva. A futuro, permitirá que un radioaficionado cargue su propio log local y vea resaltadas las tramas que recibió.

## Estado

**En desarrollo.** Hay una primera visualización 3D funcional (etapa 4): trayectoria real del vuelo con altitud GPS, estaciones fijas, marcador del globo con reproducción (Play/Pausa, anterior/siguiente, cursor, velocidades 1x–16x), línea temporal estación → globo para el primer IGate de la transmisión vigente y dos modos de cámara (vista general / seguir globo). El diseño visual y el resto de funciones están pendientes.

## Cómo ejecutarla localmente

La aplicación usa módulos ES y `fetch`, por lo que **no funciona abriendo `index.html` con `file://`**: hay que servir la carpeta por HTTP. Opciones sin instalar nada adicional (desde la carpeta del proyecto):

```
python -m http.server 8000
```

y abrir <http://localhost:8000/>. También sirve cualquier otro servidor estático (`npx serve`, la extensión Live Server de VS Code, etc.); la aplicación no depende de ninguno en particular. Se necesita conexión a Internet para cargar CesiumJS y Chart.js (CDN) y las teselas del mapa.

## Publicación

El proyecto es un sitio web **estático** (HTML, CSS y JavaScript con módulos ES; CesiumJS 1.123.1 y Chart.js 4.4.1 desde CDN), sin backend, publicable en un hosting convencional (por ejemplo `/RCU/pichon4/`). Solo usa rutas relativas.

## Telemetría sincronizada (etapa 6)

Panel agrupado (Vuelo, Altitud, Ambiente, Sistema, Globo, Recepción) y cuatro gráficos temporales (altitud GPS/barométrica, temperatura, presión y batería) bajo el visor, con cursor sincronizado con la reproducción, tooltips, marcadores de advertencias de APRS.fi y clic en un punto para saltar a esa transmisión. La telemetría no se interpola; la batería se muestra como `raw` (dato original) y en voltios solo como interpretación probable. Los gráficos usan Chart.js 4.4.1 por CDN. Detalles en [docs/TELEMETRY.md](docs/TELEMETRY.md).

## Modelo físico del globo (etapa 5)

El marcador simple se reemplazó por un conjunto aproximado (carga útil en la posición GPS, antena debajo y globo encima durante el ascenso). El diámetro estimado del globo crece con la presión y temperatura reales (gas ideal) solo hasta la altitud máxima; después se considera una transición estimada de ruptura/descenso y no se calcula ni se dibuja el globo. Es una estimación visual/física, no una medición, y se dibuja con tamaño exagerado ×20 solo para que sea visible. Detalles y limitaciones en [docs/PHYSICS.md](docs/PHYSICS.md).

## Decisiones técnicas de la etapa 4

- **Mapa base:** teselas de OpenStreetMap (`tile.openstreetmap.org`), sin credenciales. Está pensado para pruebas y uso moderado; para una publicación con tráfico real habrá que revisar la política de uso de OSM o elegir otro proveedor.
- **Sin terreno 3D:** el terreno de Cesium requiere un token de Cesium Ion, que no se usa. El suelo es el elipsoide, y las estaciones se dibujan a altura 0 (su altura de terreno es desconocida). La altitud GPS se usa tal cual para posicionar el globo, sin exageración vertical.
- **Eje de tiempo:** el instante de cada transmisión es su `packetTimestampUtc` (hora de emisión). La interpolación entre transmisiones es solo visual (posición y altitud); frame, telemetría, primer IGate y advertencias son siempre los de la transmisión real vigente.
- **Datos:** solo se dibuja `flight` (155 transmisiones). `preFlight` y `postFlight` se cargan pero no se muestran.
- **Depuración:** el objeto `window.pichon` expone datos, reproducción y mapa para inspección desde la consola del navegador.

## Documentación

- [CLAUDE.md](CLAUDE.md): reglas de trabajo del desarrollo técnico.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): arquitectura preliminar.
- [docs/PHYSICS.md](docs/PHYSICS.md): modelo físico aproximado del globo.
- [docs/TELEMETRY.md](docs/TELEMETRY.md): telemetría, gráficos y sincronización.
