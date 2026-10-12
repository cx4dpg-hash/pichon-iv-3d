# Calidad de datos — `data/vuelo/transmissions.json`

Fuente: `imports/source/cx1aa-11-aprsfi-raw.pdf` (APRS.fi, "Paquetes sin filtrar de CX1AA-11"), horas de recepción en UTC-3.

## Integridad de la extracción

- El encabezado de APRS.fi dice "Encontrados 183 paquetes". Se extrajeron **183** líneas (`pdftotext`), y las 183 cumplen estrictamente el formato esperado (cabecera, posición, A=, 11 campos de telemetría, texto). Cero líneas descartadas o alteradas.
- `rawPacket` conserva el paquete tal como está en el PDF; la advertencia de APRS.fi (entre corchetes, al final de la línea) va aparte en `warnings`.
- No se interpoló ni se reconstruyó ninguna trama.

## Conteos

| Concepto | Cantidad |
|---|---|
| Recepciones (líneas fuente) | 183 |
| Transmisiones | 168 |
| preFlight | 5 |
| flight | 155 |
| postFlight | 8 |
| Transmisiones con más de una recepción | 15 (todas con exactamente 2) |
| Recepciones duplicadas (183 − 168) | 15 |

Las 15 transmisiones duplicadas (todas en `flight`): frames 110, 129, 130, 131, 133, 136, 137, 138, 140, 141, 143, 144, 145, 147, 151. En todos los casos la segunda copia es de CX3BP-8. Ningún par con la misma clave tenía payload distinto.

### Recepciones por IGate (183)

| IGate | Recepciones | Primera recepción (firstIgate) |
|---|---|---|
| CX2TN-1 | 69 | 69 |
| CX4DPG-1 | 59 | 59 |
| CX3BP-8 | 39 | 24 (5 preFlight, 11 flight, 8 postFlight) |
| CX2CQ-1 | 14 | 14 |
| CX2ACB-1 | 2 | 2 (frames 46 y 47) |

## Clasificación

- **preFlight (5)**: lat/lon 0, `A=000000`, hora `000000h`. `position.valid = false`. Frames 1, 2, 3 del 2026-10-10 (17:19–17:21 -03, el día anterior) y frames 1, 2 del 2026-10-11 (10:12–10:13 -03). Todas con la advertencia "Latitude and longitude are both 0" (rechazadas por APRS.fi).
- **flight (155)**: posiciones válidas con `packetTimestampUtc` ≤ 2026-10-11T16:23:46Z. Frames 3 a 157.
- **postFlight (8)**: frame 77 (17:40:18Z, 24 ft) y frames 13 a 19 (19:32:11Z a 19:38:12Z, 65–124 ft). Conservadas, fuera de la trayectoria principal.

La clasificación usa la hora del paquete y no la de recepción: el frame 154 llegó recién a las 13:23:48 (por CX3BP-8, retrasado) pero fue emitido a las 13:19:47 local, antes del final del vuelo.

## Vuelo principal

- Primera transmisión válida: frame 3, paquete 13:14:41Z, recibido 10:14:41 -03 (CX3BP-8), 398 ft.
- Última: frame 157, paquete 16:23:46Z, recibido 13:23:47 -03 (CX2TN-1), 754 ft.
- **Altitud GPS máxima: 83801 ft = 25542.54 m**, frame 138, paquete 15:59:46Z (12:59:46 -03), primera recepción 12:59:47 -03 (CX2TN-1). Altitud barométrica máxima del mismo frame: 22212 m (máxima del vuelo también).
- Rango de posiciones: lat −34.377 a −34.169167, lon −55.355333 a −53.987333.

## Frames faltantes y saltos

- **Ningún frame faltante** entre el 3 y el 157; ninguno repetido dentro de `flight`; el orden por frame coincide con el orden por hora de paquete.
- **Intervalos entre transmisiones consecutivas**: 110 de 60 s, 7 de 61 s, 1 de 58 s, 1 de 59 s y **35 de ~120 s**. Los saltos de 120 s ocurren con frames consecutivos (p. ej. 19→20, 23→24, 27→28, …, 155→156), aproximadamente cada 4 frames. Como el número de trama no salta, no hay trama perdida según el contador; la causa de la pausa de ~2 min no está documentada y no se interpreta.
- **frameNumber no es único en la jornada**: el frame 77 aparece en vuelo y en postFlight, y los frames 13–19 en vuelo y en postFlight; también los frames 1–3 en preFlight. Son transmisiones distintas (la clave incluye hora, posición y altitud).

## Advertencias de APRS.fi (14 recepciones)

| Advertencia | Cantidad | Detalle |
|---|---|---|
| Latitude and longitude are both 0 | 5 | las 5 preFlight (posiciones rechazadas) |
| Rate limited (< 5 sec) | 3 | CX3BP-8, frames 129, 130, 131, todas a las 12:52:48 |
| Delayed or out-of-order packet (timestamp) | 10 | CX3BP-8: frames 133, 136, 137, 138, 140, 141, 143, 144, 151 y 154 |
| Location changes too fast (adaptive limit) | 1 | frame 157 (primera y única recepción, CX2TN-1, 13:23:47) |

Cada una está en `warnings` de la recepción correspondiente. Ninguna recepción se descartó por tener advertencia.

- La recepción del frame 157 con "Location changes too fast" es la última del vuelo y es una transmisión válida; se la conserva en `flight`. Si se la tomara como rechazada, el final del vuelo principal pasaría al frame 156 (13:22:48 -03). Queda a decisión de Pedro/ChatGPT.
- El frame 154 solo fue recibido (con retraso) por CX3BP-8; su `firstIgate` es CX3BP-8 porque es la única recepción disponible.
- Las copias tardías de CX3BP-8 (frames 145 y 147) llegaron sin advertencia, con 45 y 74 s de retraso respecto de la primera copia.
- Retraso máximo entre hora de paquete y recepción: 700 s (frame 136, copia de CX3BP-8 recibida 13:09:26 -03; paquete emitido 12:57:46 -03). Ninguna recepción es anterior a su hora de paquete.

## Incoherencias / observaciones

1. **Pre-vuelo del día anterior**: los frames 1–3 del 2026-10-10 son de un encendido de prueba; no pertenecen al vuelo.
2. **CX3BP-8 como primer IGate de los frames 3–12** (10:14–10:23 -03, en tierra/ascenso inicial) y de todo el postFlight. Su posición sigue desconocida; no se le asigna ubicación.
3. **Hora del paquete vs recepción**: se infiere la fecha del timestamp APRS (solo trae hhmmss UTC) a partir de la fecha de recepción. La primera recepción del frame 77 postFlight ocurre 138 s después de su hora de paquete (posible retraso, sin advertencia).
4. **Curso 000 con velocidad 000** en 7 transmisiones de vuelo (en tierra). En APRS 000 puede significar "sin dato"; se conserva el valor crudo.
5. **Altitud GPS vs barométrica**: difieren en más de 1000 m a partir de ~frame 104 (p. ej. frame 111: GPS 19258 m, barométrica 17916 m). Se conservan ambos valores, sin corregir.
6. **Modo**: `mode = "P"` en los frames 141–157 (descenso); el resto es "G". No se interpreta el significado (`modeMeaning = null`).
7. **Batería**: `batteryRaw` fijo en 7392 en las 5 transmisiones preFlight y en los frames 3–87 del vuelo (85), y luego varía; `batteryV = raw/1000` con estado `probable`.
8. **Ejemplo del enunciado**: la instrucción mostraba el frame 138 con `qAO,CX4DPG-1`; en el PDF las recepciones del frame 138 son CX2TN-1 (12:59:47) y CX3BP-8 (13:09:32). El dataset sigue el PDF.

## Pendiente / sin resolver

- Significado de los modos G y P.
- Escala/unidad de la batería.
- Causa de los intervalos de 120 s.
- Decisión sobre la inclusión del frame 157 como fin del vuelo principal.


## Observaciones posteriores (etapa 10)

- **Punto de rescate.** El punto reportado (−34.3281667, −53.9858333) está a ≈ 231 m del último punto del vuelo (frame 157). La transmisión `postFlight` frame 77 (2026-10-11T17:40:18Z, 24 ft, primera recepción por CX3BP-8) está a ≈ 59 m de ese punto y a ≈ 174 m del último punto del vuelo: corrobora de forma independiente la zona de caída (dentro de la incertidumbre de una posición APRS). Las `postFlight` frames 13 a 19 (19:32 a 19:38 Z) están ≈ 3.5 km al oeste, a 65–124 ft: son posteriores a la recuperación y se interpretan como la carga transportada; no se dibujan.
- **Observación no confirmada.** La observación de que el paracaídas aparentemente no abrió es un reporte del usuario; la telemetría disponible no la confirma ni la desmiente. Se muestra solo como "observación reportada, no confirmada".
- **Lugar planificado vs. punto efectivo de partida (aclarado).** El Boletín CX 918 anunciaba el lanzamiento en el Aero Club de Mercedes (Soriano, ≈ −33.25, −58.03); esa información es el **plan** y se conserva como `plannedLaunchSite` (estado `planned`). El punto efectivo de partida se deriva de la telemetría: la primera posición GPS válida de CX1AA-11 (frame 3, 2026-10-11T13:14:41Z) está en lat −34.297167, lon −55.355333 (`actualLaunch`, confianza alta), unos 270 km al este del lugar planificado, y la carga permaneció en ese punto en tierra (velocidad 0) hasta el frame 10. Una captura de APRS.fi aportada por el usuario (≈ 34°17.84' S, 55°21.32' W) corrobora el mismo sector (diferencia ≈ 18 m). No se asigna nombre de localidad porque no está documentalmente confirmado. La interfaz no presenta Mercedes como lugar efectivo.
- **Recuperación: dos referencias en el mismo sector, coordenada exacta pendiente.** El punto de `recovery.json` (34°19.69' S, 53°59.15' W, confirmado por el usuario) y la coordenada visible en una segunda captura de APRS.fi (≈ 34°19.72' S, 53°59.19' W, indicador superior del mapa) están a ≈ 83 m entre sí, en el mismo sector. No se reemplazó el punto existente con la lectura de la captura: queda por resolver la posición APRS exacta de CX5RN-5 correspondiente al rescate, si existe una trama identificable.
- **Altitud GPS vs. terreno en el lanzamiento.** Ver `docs/MAPPING.md` (corrección visual solo de render en los frames 3 a 10).
