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

Aún no existe archivo de tramas.

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

## Identificación de tramas

*No implementado todavía.* El sistema futuro deberá identificar una trama mediante una combinación robusta de:

- timestamp interno APRS;
- frame number;
- posición;
- payload/raw packet, cuando esté disponible.

Ningún campo por sí solo es suficiente (por ejemplo, el frame number podría repetirse o el timestamp coincidir). Esta identificación será necesaria para:

- deduplicar paquetes;
- detectar paquetes retrasados;
- comparar logs de distintas estaciones.
