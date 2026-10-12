# Modelo de datos

Datos estáticos en JSON, consumibles directamente por el navegador (rutas relativas). Sin backend.

## Política de no inventar datos

- Todo dato proviene de una fuente entregada por Pedro/ChatGPT y queda registrado en `data/metadata.json`.
- Lo desconocido se guarda como `null` / estado `unknown`. Nunca se deduce.
- Cada dato no exacto lleva su fuente y nivel de confianza.
- Los datos maestros no se mezclan con datos de usuarios (logs futuros).

## Archivos

| Archivo | Contenido |
|---|---|
| `data/vuelo/flight.json` | Metadata general del vuelo, estimaciones visuales, suspensión de la carga. Sin tramas. |
| `data/estaciones/stations.json` | Cinco estaciones terrestres: cuatro fijas con posición conocida y CX3BP-8 (móvil, posición desconocida). |
| `data/telemetria/telemetry-schema.json` | Definición de campos de telemetría APRS y su estado de interpretación. Sin tramas. |
| `data/metadata.json` | Procedencia: fuentes, qué aportan, confianza general. |
| `data/vuelo/transmissions.json` | Dataset maestro de tramas: `preFlight`, `flight`, `postFlight` (transmisiones con sus recepciones). Fuente: `imports/source/cx1aa-11-aprsfi-raw.pdf` (APRS.fi). Ver `docs/DATA_QUALITY.md`. |

La fuente cruda está en `imports/source/` y no se modifica. El fuente `user-confirmed-project-context` (en `metadata.json`) agrupa los datos aportados por el equipo del proyecto.

## Clasificación de los datos

### Exactos (dados por la fuente)
- Misión, indicativo CX1AA-11, fecha local de lanzamiento, zona horaria, lugar (Aero Club de Mercedes, Soriano, Uruguay).
- Indicativos, tipos y posiciones APRS de las cuatro estaciones fijas (tomadas de sus balizas propias en APRS.fi). Las coordenadas decimales son conversión directa de grados y minutos decimales: `decimal = grados + minutos/60`, negativo por S/W, redondeado a 6 decimales.
- Campos de telemetría confirmados: `frameNumber`, `mode`, `internalTemperatureC`, `externalTemperatureC`, `pressureHpa`, `humidityPercent`, `barometricAltitudeM`, `gpsQuality`, `satellites`, `gpsStatus`.

### Derivados
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
