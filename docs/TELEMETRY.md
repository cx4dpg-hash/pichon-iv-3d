# Telemetría en la interfaz (etapas 6 y 8)

Fuente única: `data/vuelo/transmissions.json`, array `flight` (155 transmisiones). No se duplica telemetría en otro archivo. Los gráficos y el panel **no interpolan ni rellenan** ningún valor.

## Datos originales (de la trama APRS)

| Campo | Origen | Dónde se ve |
|---|---|---|
| `frameNumber`, `mode` | payload APRS | panel |
| `lat`, `lon` (carga útil) | posición APRS | panel |
| `courseDeg` | parte APRS de curso/velocidad | panel, gráfico "Curso GPS" |
| `speedAprsKnotsRaw` | parte APRS de curso/velocidad (nudos APRS) | panel |
| `altitudeGpsFt` | campo APRS `A=` (pies) | panel |
| `barometricAltitudeM` | payload APRS | panel, gráfico "Altitud" |
| `pressureHpa` | payload APRS | panel, gráfico "Presión atmosférica" |
| `internalTemperatureC`, `externalTemperatureC` | payload APRS | panel, gráfico "Temperaturas" |
| `humidityPercent` | payload APRS | panel, gráfico "Humedad externa" |
| `batteryRaw` | payload APRS (entero tal como viene) | panel, gráfico "Batería" |
| `gpsQuality`, `satellites`, `gpsStatus` | payload APRS (**valores brutos**; no se interpretan los códigos) | panel, gráfico "Recepción GPS" |
| `firstIgate`, advertencias de APRS.fi | recepciones (APRS.fi) | panel, tooltips, marcadores |

## Datos convertidos directamente (sin pérdida de información)

| Campo | Conversión |
|---|---|
| `altitudeGpsM` | `altitudeGpsFt × 0.3048` (campo APRS `A=` de pies a metros) |
| `speedKmh` | `speedAprsKnotsRaw × 1.852` (nudos APRS a km/h). No se recalcula a partir de posiciones |

## Datos derivados / interpretaciones (no son telemetría original)

| Dato | Cálculo | Estado |
|---|---|---|
| `batteryV` | `batteryRaw / 1000` | **interpretación probable, no confirmada**; siempre rotulada "≈ V (interpretación probable)" |
| Velocidad vertical derivada | `v[i] = (altitudeGpsM[i] − altitudeGpsM[i−1]) / ((t[i] − t[i−1]) / 1000)` m/s, con `t` = `packetTimestampUtc` en ms (hora de emisión, **no** `receivedAtLocal`) | derivado; se muestra solo en el panel, como "Vel. vertical … (derivada)"; en la primera transmisión no hay muestra anterior y se muestra "—" |
| Diámetro estimado del globo, fase | modelo en tiempo de ejecución (ver `docs/PHYSICS.md`) | estimado |

La velocidad vertical es la **tasa media entre dos transmisiones consecutivas** (con intervalos de 60 s o, a veces, 120 s), no una medición instantánea. Positivo = ascenso. Implementada en `js/derived.js` (con prueba unitaria).

## Altitud GPS y corrección visual

La altitud GPS del panel y de los gráficos es siempre la **bruta** (`altitudeGpsM`). La fila "Corrección visual" del panel solo informa la corrección de **render** al terreno aplicada en el lanzamiento (ver `docs/MAPPING.md`); no es un dato de telemetría.

## Batería

`batteryRaw` es el dato original y siempre se muestra (por ejemplo, `6858 raw`). Los voltios (`≈ 6.858 V (interpretación probable)`) son una interpretación probable, no confirmada documentalmente; nunca se presentan como valor definitivo. En el gráfico se dibujan con línea punteada fina, en un eje derecho propio rotulado "probable".

## Panel

Agrupado en Vuelo (hora local, hora de la trama, frame, lat, lon, velocidad, velocidad vertical derivada, curso, modo), Altitud (GPS, barométrica), Ambiente (presión, temperatura interna y externa, humedad), Sistema (batería raw y ≈V probable, calidad GPS, satélites, estado GPS), Globo (fase, diámetro estimado si aplica) y Recepción (First IGate, Mi estación, advertencias). Los valores son los de la **transmisión real vigente**.

## Gráficos (Chart.js 4.4.1, CDN)

Ocho gráficos, creados una sola vez (`js/charts.js`), repartidos en **4 páginas de 2 gráficos** (2 columnas × 1 fila; 1 columna en < 900 px) con paginación simple (‹ Página 1 de 4 ›, con indicadores ● ○ ○ ○) dentro del encabezado de la sección plegable "Telemetría". Cada gráfico mide 170 px de alto (antes 96 px con 4 por página); la sección completa mide ≈ 222 px, parecida a la de los cuatro gráficos originales en una fila.

| Página | Gráficos |
|---|---|
| 1 | Altitud, Temperaturas |
| 2 | Presión atmosférica, Humedad externa |
| 3 | Batería, Velocidad GPS |
| 4 | Curso GPS, Recepción GPS |

Cambiar de página solo cambia la visibilidad de los grupos: los gráficos no se destruyen ni se recrean, no se tocan sus datasets y la reproducción no se interrumpe. Los ocho siguen sincronizados aunque solo cuatro sean visibles: los ocultos no se redibujan; cuando vuelven a verse (al cambiar de página o al desplegar la sección) se hace únicamente un `resize` y un `update` ligero para poner al día el cursor y el punto resaltado de la transmisión vigente.

| # (orden interno) | Gráfico | Series |
|---|---|---|
| 1 | Altitud (m) | `altitudeGpsM` (GPS) y `barometricAltitudeM` |
| 2 | Temperaturas (°C) | `internalTemperatureC` y `externalTemperatureC` |
| 3 | Presión atmosférica (hPa) | `pressureHpa` |
| 4 | Humedad externa (%) | `humidityPercent` (eje fijo 0–100) |
| 5 | Batería | `batteryRaw` (eje izquierdo) y ≈ V probable (punteada, eje derecho) |
| 6 | Velocidad GPS (km/h) | `speedKmh` |
| 7 | Curso GPS (°) | `courseDeg` (eje fijo 0–360, marcas cada 90°) |
| 8 | Recepción GPS (valores brutos) | `satellites` (eje izquierdo, 0–14); `gpsQuality` y `gpsStatus` (eje derecho, 0–3, valores brutos) |

Estilo: líneas finas (1.25–1.5 px; 1 px la serie probable de voltios), `tension: 0` (prácticamente rectas entre muestras reales; no se suaviza), sin relleno, **sin puntos permanentes** (`pointRadius` 0). Solo se dibujan puntos en la transmisión vigente (radio 3.5, borde blanco) y, discretamente, triángulos ámbar en las transmisiones con advertencias de APRS.fi (radio 2.5). Todos los puntos son seleccionables (`pointHitRadius` 7).

- **Eje temporal común**: `packetTimestampUtc` (hora de emisión), en hora local de Uruguay (UTC−3). No se usa `receivedAtLocal`.
- **Curso 0–360°**: es una variable circular. La línea es **continua** entre las 155 muestras reales, con todos los puntos y todos los segmentos dibujados; no se ocultan segmentos, no hay cortes ni se interpolan valores. Un cruce por 0°/360° (p. ej. 4° → 350° en el frame 15, 357° → 20° en el 19 y 82° → 332° en el 111) aparece como un salto vertical grande, que es correcto: es el cambio real de la variable circular y es preferible a romper la línea. El eje queda fijo en 0–360°. (Una versión anterior hacía transparentes los segmentos con salto > 180°; esa lógica se eliminó.)
- **Recepción GPS**: tres series con ejes separados porque sus escalas difieren. No se interpreta la semántica de calidad ni estado; se muestran sus valores brutos.
- **Marcas discretas**: línea punteada tenue en la transmisión de máxima altitud GPS (calculada desde los datos; hoy el frame 138) y franja roja tenue con la "transición estimada de ruptura/descenso" (frames 138 → 139), inferida del perfil de vuelo, no un hecho confirmado. Las etiquetas de texto solo están en el gráfico de altitud.
- **Tooltip** al pasar sobre una muestra real: hora local, frame, valor con unidad, first IGate y advertencias de APRS.fi.
- **Clic en un punto real** (en cualquiera de los ocho): salta a esa transmisión sin iniciar Play.
- **Cursor sincronizado**: un `<div>` superpuesto, semitransparente, que sigue `playback.absoluteMs` de forma continua (también durante la interpolación visual 3D) con Play, slider y anterior/siguiente. No se recrean los gráficos durante la reproducción: solo se mueven los cursores y se resalta el punto vigente cuando cambia la transmisión.

## Verificación de los datos (155 transmisiones de `flight`)

Antes de graficar se comprobó cada campo en las 155 transmisiones: **0 valores `null`, ausentes, `NaN` o no numéricos** en ninguno. No se rellenó ni interpoló nada.

Rangos y observaciones (no son errores de datos):
- `gpsStatus` vale 1 en las 155 transmisiones (serie constante); `gpsQuality` vale 1 (99) o 2 (56); `satellites` entre 8 y 12.
- `courseDeg` entre 0 y 358; es 0 en las transmisiones con velocidad 0 (el valor 000 de APRS puede significar "sin dato"; se conserva el valor crudo). Tres cruces por 0°/360° (frames 15, 19 y 111).
- `humidityPercent` entre 3 y 83; salto de 46 a 80 % entre los frames 155 y 156 (descenso final).
- `externalTemperatureC` baja bruscamente de −13 a −29 °C en el frame 140 y sube de −41 a −29 °C en el 148 (descenso a través de capas).
- `pressureHpa` sube con la caída (saltos de hasta 128 hPa por transmisión al final).
- `speedKmh` llega a 144.5 km/h (con picos de caída durante el descenso, p. ej. frame 144: 129.6 km/h).
- `batteryRaw` entre 6814 y 7392.
- `mode` es "G" en 138 transmisiones y "P" en 17 (frames 141–157); su significado no está documentado.

## Limitaciones

- No hay gráfico de la velocidad vertical derivada (solo el valor en el panel).
- Los gráficos no incluyen `preFlight` ni `postFlight`.
- El gráfico de batería no debe leerse como una medición de voltaje confirmada.
- Con la GPU simulada por software (pruebas automatizadas) la interacción puede tardar; no se midió el rendimiento en una GPU real.
