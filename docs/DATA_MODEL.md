# Modelo de datos

Datos estáticos en JSON, consumibles directamente por el navegador (rutas relativas). Sin backend.

## Política de no inventar datos

- Todo dato proviene de una fuente entregada por Pedro/ChatGPT y queda registrado en `data/metadata.json`.
- Lo desconocido se guarda como `null` / estado `unknown`. Nunca se deduce.
- Cada dato no exacto lleva su fuente y nivel de confianza.
- Los datos maestros no se mezclan con datos de usuarios (logs futuros).

## Tres conceptos distintos: primera posición GPS, lanzamiento e inicio del ascenso

- **Primera posición GPS válida:** la primera transmisión con posición no nula (frame 3, 2026-10-11T13:14:41Z = 10:14:41 hora local, 121 m). Es solo el instante en que el GPS obtuvo fix.
- **Punto de lanzamiento:** el **sitio** (lat −34.297167, lon −55.355333) de esa primera posición válida (`flight.json` → `actualLaunch`). La carga permaneció allí, en tierra, hasta la liberación.
- **Inicio efectivo del ascenso (liberación):** frame 10, 13:21:39Z = 10:21:39 hora local (última posición en tierra; el primer punto ya en el aire es el frame 11). Se **deriva en tiempo de ejecución** con el criterio de `docs/DATA_QUALITY.md` (`js/phases.js`); no se guarda en ningún archivo ni modifica `transmissions.json`.

Fases (derivadas): `preLaunch` / en tierra (frames 3 a 9, conservados) → `ascent` (frame 10 hasta el máximo, frame 138) → `descent` (desde el frame 139). El `flight` de `transmissions.json` sigue teniendo 155 transmisiones (frames 3 a 157): 7 `preLaunch` + 148 de vuelo efectivo.

## Archivos

| Archivo | Contenido |
|---|---|
| `data/vuelo/flight.json` | Metadata general del vuelo, estimaciones visuales, suspensión de la carga. Sin tramas. |
| `data/estaciones/stations.json` | Cinco estaciones terrestres: cuatro fijas con posición conocida y CX3BP-8 (móvil, posición desconocida). |
| `data/telemetria/telemetry-schema.json` | Definición de campos de telemetría APRS y su estado de interpretación. Sin tramas. |
| `data/vuelo/recovery.json` | **Anotación complementaria** del final del vuelo: punto real de recuperación de la carga, **respaldado por APRS de CX5RN-5** (trama de 2026-10-11 15:27:45 -03, 34°19.72' S, 53°59.19' W → −34.3286667, −53.9865; confianza alta), con las cinco posiciones que corroboran la permanencia en el sector (15:22:47 a 15:33:26 -03), la corroboración visual secundaria de APRS.fi, la estimación anterior superada, la nota de que el tramo final no es telemétrico y la observación operativa **no confirmada** ("el paracaídas aparentemente no abrió"). No es telemetría, no forma parte de `transmissions.json` ni de la trayectoria principal. |
| `data/metadata.json` | Procedencia: fuentes, qué aportan, confianza general. |
| `data/vuelo/transmissions.json` | Dataset maestro de tramas: `preFlight`, `flight`, `postFlight` (transmisiones con sus recepciones). Fuente: `imports/source/cx1aa-11-aprsfi-raw.pdf` (APRS.fi). Ver `docs/DATA_QUALITY.md`. |

La fuente cruda está en `imports/source/` y no se modifica. El fuente `user-confirmed-project-context` (en `metadata.json`) agrupa los datos aportados por el equipo del proyecto.

## Clasificación de los datos

### Exactos (dados por la fuente)
- Misión, indicativo CX1AA-11, fecha local del lanzamiento, zona horaria y país.
- **Lugar planificado** (`flight.json` → `plannedLaunchSite`): Aero Club de Mercedes, Soriano, según el Boletín CX 918. Estado `planned`: **no** es el lugar efectivo de partida.
- Indicativos, tipos y posiciones APRS de las cuatro estaciones fijas (tomadas de sus balizas propias en APRS.fi). Las coordenadas decimales son conversión directa de grados y minutos decimales: `decimal = grados + minutos/60`, negativo por S/W, redondeado a 6 decimales.
- Campos de telemetría confirmados: `frameNumber`, `mode`, `internalTemperatureC`, `externalTemperatureC`, `pressureHpa`, `humidityPercent`, `barometricAltitudeM`, `gpsQuality`, `satellites`, `gpsStatus`.

### Derivados
- **Punto efectivo de partida** (`flight.json` → `actualLaunch`): lat −34.297167, lon −55.355333 (34°17.83' S, 55°21.32' W), derivado de la **primera posición GPS válida** de CX1AA-11 (frame 3, 2026-10-11T13:14:41Z); confianza alta. Corroborado por una captura de APRS.fi aportada por el usuario (≈ 34°17.84' S, 55°21.32' W, diferencia ≈ 18 m). Sin nombre de localidad (no hay uno documentalmente confirmado).
- `flightMainStartLocal` y `flightMainEndLocal`: derivados de logs APRS (primera posición GPS válida y última posición de la caída antes de las tramas post-aterrizaje). Aproximados; **no** son horarios oficiales de lanzamiento ni aterrizaje.
- `altitudeGpsM`: del campo APRS `A=xxxxxx` (pies) convertido a metros.
- `lat`/`lon`: de la posición APRS. `speed`/`course`: de la parte APRS de curso/velocidad.

### Estimados
- `estimatedBalloonDiameterM` (diámetro estimado del globo): se calcula **en tiempo de ejecución** (gas ideal con `pressureHpa`, `externalTemperatureC` y el diámetro inicial visual), **solo durante el ascenso** (hasta la transmisión de máxima altitud); después es `null`. **No está en el dataset** y no es un dato original. Ver `docs/PHYSICS.md`.
- `estimatedBurstTransition` (transición estimada de ruptura/descenso): se calcula en tiempo de ejecución entre la transmisión de máxima altitud y la siguiente; es una inferencia del perfil de vuelo, no un instante conocido.
- La posición `lat`/`lon`/`altitudeGpsM` es la de la **carga útil** (donde está la electrónica APRS/GPS), no la del globo.
- Longitudes de suspensión y antena: **desconocidas** (`null`). Las separaciones dibujadas (`visualSuspensionOffset`, `visualAntennaOffset` en `js/balloon.js`) son offsets solo visuales, no datos de la misión.
- Diámetro inicial del globo: 1.5 m ± 0.2 m (visual, confianza media).
- Dimensiones de la carga: 0.45 × 0.25 × 0.18 m (visual, confianza baja, pendiente de confirmar).

### Sin resolver
- Escala/unidad del campo de batería (`batteryMvOrRaw`, estado `probable`).
- Significado textual de los modos G y P (`modeMeaning = null`).
- Posición de CX3BP-8 durante el vuelo.
- Altura de terreno de las estaciones (`terrainHeightM = null`).
- Longitud de la suspensión y de la antena (`null`, no modeladas).
- Unidad con que se almacenará `speed`.
- Sintaxis exacta del payload APRS (separadores y formato).
- Aporte concreto del boletín del Radio Club Uruguayo (fuente registrada, sin datos cargados).

## Transmission y reception

- **Transmission**: una emisión única de CX1AA-11.
- **Reception**: una copia de esa emisión que llegó a APRS-IS por un IGate (`qAO,<igate>`), con su `receivedAtLocal`, `rawPacket` y `warnings` de APRS.fi.
- `firstIgate` / `firstReceivedAtLocal` salen de la recepción más temprana; una copia posterior (aunque esté marcada como retrasada) nunca la reemplaza.
- `frameNumber` no es único en la jornada (se reinicia).
- Clave de deduplicación implementada en `transmissions.json` (`dedupKey`): `packetTimestampUtc|frameNumber|lat|lon|altitudeGpsFt`. Para transmisiones sin posición válida se usa `invalid|fecha local|frame|payload`, porque no tienen hora real y sus cinco campos coincidirían entre jornadas.
- `packetTimestampUtc`: el timestamp APRS (`hhmmssh`) trae solo hora UTC; la fecha se infiere de la recepción.
- `batteryV = batteryRaw / 1000`, con estado `probable`.

## Identificación de tramas

La identificación de arriba cubre este dataset. El sistema futuro (logs de usuarios) deberá identificar una trama mediante una combinación robusta de:

- timestamp interno APRS;
- frame number;
- posición;
- payload/raw packet, cuando esté disponible.

Ningún campo por sí solo es suficiente (por ejemplo, el frame number podría repetirse o el timestamp coincidir). Esta identificación será necesaria para:

- deduplicar paquetes;
- detectar paquetes retrasados;
- comparar logs de distintas estaciones.
