# Telemetría en la interfaz (etapa 6)

Fuente única: `data/vuelo/transmissions.json`, array `flight` (155 transmisiones). No se duplica telemetría en otro archivo.

## Qué se muestra

| Campo | Origen | Tipo | Dónde |
|---|---|---|---|
| `frameNumber`, `mode` | payload APRS | dato original | panel |
| `lat`, `lon` (carga útil) | posición APRS | dato original (conversión a decimal) | panel |
| `courseDeg`, `speedAprsKnotsRaw` | parte APRS de curso/velocidad | dato original | panel |
| `speedKmh` | `speedAprsKnotsRaw × 1.852` | derivado | panel |
| `altitudeGpsFt` | campo APRS `A=` (pies) | dato original | panel |
| `altitudeGpsM` | `altitudeGpsFt × 0.3048` | derivado | panel, gráfico de altitud |
| `barometricAltitudeM` | payload APRS | dato original | panel, gráfico de altitud (serie separada) |
| `pressureHpa` | payload APRS | dato original | panel, gráfico de presión |
| `internalTemperatureC`, `externalTemperatureC` | payload APRS | dato original | panel, gráfico de temperatura |
| `humidityPercent` | payload APRS | dato original | panel (sin gráfico) |
| `batteryRaw` | payload APRS | dato original | panel, gráfico de batería |
| `batteryV` | `batteryRaw / 1000` | derivado, **interpretación probable** | panel, gráfico de batería (serie punteada) |
| `gpsQuality`, `satellites`, `gpsStatus` | payload APRS | dato original, **valor bruto** | panel |
| `firstIgate`, advertencias de APRS.fi | recepciones (APRS.fi) | dato original | panel, tooltips, marcadores |
| Diámetro estimado, fase del globo | modelo en tiempo de ejecución | **estimado** (ver `docs/PHYSICS.md`) | panel |

El panel se agrupa en Vuelo, Altitud, Ambiente, Sistema, Globo y Recepción.

## Batería

`batteryRaw` es el dato original y siempre se muestra (por ejemplo, `6858 raw`). Los voltios (`≈ 6.858 V (interpretación probable)`) son una interpretación **probable, no confirmada documentalmente**; en la interfaz nunca se presentan como un valor definitivo. En el gráfico se dibujan con línea punteada, sin puntos y en un eje derecho propio rotulado "probable".

## Códigos GPS

`gpsQuality`, `satellites` y `gpsStatus` se muestran tal como vienen en la trama. No se interpreta el significado de los códigos porque no está documentado.

## Gráficos (Chart.js 4.4.1, CDN)

Cuatro gráficos creados una sola vez (`js/charts.js`): Altitud (GPS y barométrica), Temperatura (interna y externa), Presión y Batería (`batteryRaw` y ≈V probable). Cada uno tiene exactamente 155 puntos, uno por transmisión real, unidos por líneas.

- **Eje temporal común**: `packetTimestampUtc` (hora de emisión de la trama), presentado en hora local de Uruguay (UTC−3). No se usa `receivedAtLocal`.
- **Tooltip** al pasar sobre un punto: hora local, frame, valor, first IGate y advertencias de APRS.fi.
- **Marcador de advertencias**: las transmisiones con advertencias de APRS.fi se dibujan como triángulos (incluye el frame 157).
- **Máxima altitud y transición estimada**: una línea punteada amarilla marca la transmisión de máxima altitud GPS (calculada desde los datos; hoy el frame 138) y una franja roja marca la "transición estimada de ruptura/descenso" hasta la transmisión siguiente. Es una inferencia del perfil de vuelo, no un hecho confirmado.
- **Clic en un punto real** (en cualquiera de los cuatro gráficos): la reproducción salta a esa transmisión. No inicia Play.

## Sincronización con la reproducción

- Un cursor vertical (un elemento superpuesto, no se redibuja el gráfico) sigue el instante de reproducción `playback.absoluteMs`, de forma **continua**, también durante la interpolación visual 3D. Se actualiza con Play, el slider y anterior/siguiente.
- Los valores numéricos del panel son siempre los de la **transmisión real vigente** (la última con instante ≤ al actual). **La telemetría no se interpola** ni se inventa: solo el marcador 3D (posición, altitud y tamaño del globo) se interpola, y solo visualmente.
- El punto de la transmisión vigente se resalta en los gráficos cuando cambia la transmisión vigente; los gráficos no se recrean durante la reproducción.

## Limitaciones

- No hay gráfico de humedad ni de datos GPS (solo en el panel).
- Los gráficos no incluyen `preFlight` ni `postFlight`.
- El gráfico de batería no debe leerse como una medición de voltaje confirmada.
