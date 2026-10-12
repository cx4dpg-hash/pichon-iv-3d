# PICHÓN IV 3D

Aplicación web interactiva que reconstruirá en 3D el vuelo real del globo estratosférico **PICHÓN IV** (indicativo APRS **CX1AA-11**), lanzado el 11 de octubre de 2026 en Uruguay.

## Objetivo general

Mostrar posición, altitud, trayectoria, telemetría sincronizada y enlaces del globo con las estaciones terrenas que reportaron cada trama a APRS-IS, con reproducción temporal interactiva. A futuro, permitirá que un radioaficionado cargue su propio log local y vea resaltadas las tramas que recibió.

## Estado

**En desarrollo.** Hay una primera visualización 3D funcional (etapa 4): trayectoria real del vuelo con altitud GPS, estaciones fijas, marcador del globo con reproducción (Play/Pausa, anterior/siguiente, cursor, velocidades 1x, 2x, 4x, 8x, 16x, 32x y 64x), línea temporal estación → globo para el primer IGate de la transmisión vigente y dos modos de cámara (vista general / seguir globo). El diseño visual y el resto de funciones están pendientes.

## Cómo ejecutarla localmente

La aplicación usa módulos ES y `fetch`, por lo que **no funciona abriendo `index.html` con `file://`**: hay que servir la carpeta por HTTP. Opciones sin instalar nada adicional (desde la carpeta del proyecto):

```
python -m http.server 8000
```

y abrir <http://localhost:8000/>. También sirve cualquier otro servidor estático (`npx serve`, la extensión Live Server de VS Code, etc.); la aplicación no depende de ninguno en particular. Se necesita conexión a Internet para cargar CesiumJS y Chart.js (CDN) y las teselas del mapa.

## Publicación

El proyecto es un sitio web **estático** (HTML, CSS y JavaScript con módulos ES; CesiumJS 1.123.1 y Chart.js 4.4.1 desde CDN), sin backend, publicable en un hosting convencional (por ejemplo `/RCU/pichon4/`). Solo usa rutas relativas.

## Brújula e identidad visual (etapa 9)

Brújula propia de la cámara en la esquina inferior derecha del visor (indica el Norte según `camera.heading`, un clic pone "Norte arriba" conservando posición, distancia e inclinación, también en Seguir globo) y logos del Radio Club Uruguayo y de Pichón IV en el encabezado del panel. Los recursos están en `assets/branding/` y se prepararon a partir de `imports/source/logo-rcu.jpg` y del Boletín CX 918. Ver [docs/BRANDING.md](docs/BRANDING.md).

## Mapa satélite + relieve y ocho gráficos de telemetría (etapa 8)

- **Mapa:** por defecto, OpenStreetMap sobre elipsoide ("Mapa básico · sin relieve"). Con un token de Cesium Ion en `config.local.js` (copia de `config.example.js`, ignorado por Git) se activan imaginería satelital y relieve 3D ("Satélite + relieve 3D"). Sin token o con token inválido todo funciona igual. El relieve no modifica latitud, longitud, altitud GPS ni la trayectoria. Ver [docs/MAPPING.md](docs/MAPPING.md).
- **Telemetría:** ocho gráficos finos en 4 páginas de 2 gráficos (altitud y temperaturas / presión y humedad / batería y velocidad GPS / curso GPS y recepción GPS) con cursor sincronizado, tooltips y clic para saltar a una transmisión; el panel agrega la velocidad vertical derivada. Ver [docs/TELEMETRY.md](docs/TELEMETRY.md).

## Mi recepción: importación local de logs (etapa 7)

Un radioaficionado puede cargar su propio log (`.log`, `.txt`, `.csv`) desde el panel "Mi recepción" y ver qué transmisiones recibió: se resaltan sobre la trayectoria, el panel indica "recibida" / "no registrada" durante la reproducción y se calculan cobertura y otras estadísticas. **El archivo se procesa localmente en el navegador y no se envía a ningún servidor** (ni se guarda). Formatos soportados: CSV de Dire Wolf (probado con un log real) y paquetes APRS en texto. Detalles, reglas de coincidencia y limitaciones en [docs/LOG_IMPORT.md](docs/LOG_IMPORT.md).

Pruebas del importador (sin dependencias, Node 18+): `node --test tests/importer.test.mjs tests/derived.test.mjs`.

## Telemetría sincronizada (etapa 6)

Panel agrupado (Vuelo, Altitud, Ambiente, Sistema, Globo, Recepción) y cuatro gráficos temporales (altitud GPS/barométrica, temperatura, presión y batería) bajo el visor, con cursor sincronizado con la reproducción, tooltips, marcadores de advertencias de APRS.fi y clic en un punto para saltar a esa transmisión. La telemetría no se interpola; la batería se muestra como `raw` (dato original) y en voltios solo como interpretación probable. Los gráficos usan Chart.js 4.4.1 por CDN. Detalles en [docs/TELEMETRY.md](docs/TELEMETRY.md).

## Modelo físico del globo (etapa 5)

El marcador simple se reemplazó por un conjunto aproximado (carga útil en la posición GPS, antena debajo y globo encima durante el ascenso). El diámetro estimado del globo crece con la presión y temperatura reales (gas ideal) solo hasta la altitud máxima; después se considera una transición estimada de ruptura/descenso y no se calcula ni se dibuja el globo. Es una estimación visual/física, no una medición. No hay un factor de exageración fijo ni un tamaño angular constante: el conjunto se dibuja con su tamaño físico (cerca) y solo a gran distancia (300–2500 m) se aplica una ayuda de visibilidad gradual y limitada; más lejos se usa el marcador del indicativo (ver [docs/PHYSICS.md](docs/PHYSICS.md)). La cámara usa los controles por defecto de Cesium (ver [docs/MAPPING.md](docs/MAPPING.md)). Detalles y limitaciones en [docs/PHYSICS.md](docs/PHYSICS.md).

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
- [docs/LOG_IMPORT.md](docs/LOG_IMPORT.md): importación local de logs de recepción.
- [docs/MAPPING.md](docs/MAPPING.md): mapa básico, satélite y relieve 3D (Cesium Ion).
- [docs/BRANDING.md](docs/BRANDING.md): logos (origen y preparación) y brújula.
