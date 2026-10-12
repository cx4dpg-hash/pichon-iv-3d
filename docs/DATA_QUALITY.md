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

- **Punto de recuperación (resuelto con APRS de CX5RN-5).** El punto de `recovery.json` ya **no es una estimación visual**: está respaldado directamente por una trama APRS identificable de CX5RN-5 (APRS.fi raw packet log). La trama elegida es la de **2026-10-11 15:27:45 -03: 34°19.72' S, 53°59.19' W (−34.3286667, −53.9865)**. Otras cuatro posiciones contiguas de CX5RN-5 corroboran la permanencia en el sector durante ≈ 10 min 39 s: 15:22:47 (34°19.67' S, 53°59.14' W), 15:24:51 (34°19.70' S, 53°59.20' W), 15:31:54 (34°19.71' S, 53°59.20' W) y 15:33:26 (34°19.67' S, 53°59.17' W); las cinco quedan a ≤ 120 m entre sí. La captura de APRS.fi aportada por el usuario (≈ 34°19.72' S, 53°59.19' W) coincide con la trama elegida y queda como corroboración visual secundaria. La estimación anterior (34°19.69' S, 53°59.15' W) está superada (a ≈ 83 m). El punto está a ≈ **151 m** del último punto del vuelo (frame 157; antes ≈ 231 m con la estimación anterior). La transmisión `postFlight` frame 77 de CX1AA-11 (14:40:18 -03) está a ≈ 24 m del punto. Las `postFlight` frames 13 a 19 (19:32 a 19:38 Z) están ≈ 3.5 km al oeste, a 65–124 ft: son posteriores a la recuperación y se interpretan como la carga transportada; no se dibujan. Fuente archivada: `imports/source/cx5rn-5-aprsfi-raw-2026-10-11.pdf`; las cinco tramas se verificaron directamente contra ese PDF (coinciden hora y posición).
- **Paracaídas: no abrió (confirmado).** El usuario confirma que el paracaídas no abrió (`recovery.json` → `parachute`). La fuente es esa confirmación del usuario; **no** deriva del log APRS ni de la telemetría, y la procedencia está separada de la del punto de recuperación (APRS de CX5RN-5). El panel de la última transmisión (frame 157) muestra "Paracaídas: no abrió (confirmado)".
- **Lugar planificado vs. punto efectivo de partida (aclarado).** El Boletín CX 918 anunciaba el lanzamiento en el Aero Club de Mercedes (Soriano, ≈ −33.25, −58.03); esa información es el **plan** y se conserva como `plannedLaunchSite` (estado `planned`). El punto efectivo de partida se deriva de la telemetría: la primera posición GPS válida de CX1AA-11 (frame 3, 2026-10-11T13:14:41Z) está en lat −34.297167, lon −55.355333 (`actualLaunch`, confianza alta), unos 270 km al este del lugar planificado, y la carga permaneció en ese punto en tierra (velocidad 0) hasta el frame 10. Una captura de APRS.fi aportada por el usuario (≈ 34°17.84' S, 55°21.32' W) corrobora el mismo sector (diferencia ≈ 18 m). No se asigna nombre de localidad porque no está documentalmente confirmado. La interfaz no presenta Mercedes como lugar efectivo.
- **Altitud GPS vs. terreno en el lanzamiento.** Ver `docs/MAPPING.md` (corrección visual solo de render en los frames 3 a 10).


## Inicio efectivo del vuelo: análisis de los primeros frames (preLaunch)

**Problema.** La reproducción empezaba en el frame 3 (primera posición GPS válida). Durante ≈ 8 minutos (frames 3 a 10) la carga permanecía en tierra: el conjunto globo/carga parecía arrastrarse pegado al terreno antes de subir, lo que no representa la operación real.

**Frames analizados (11 de 2026-10-11, hora UTC / local):**

| Frame | UTC | Local | Alt. GPS (m) | Alt. barométrica (m) | Δ alt. GPS (m) | v. vertical derivada (m/s) | Velocidad (km/h) | Desplaz. horizontal (m) | Presión (hPa) |
|---|---|---|---|---|---|---|---|---|---|
| 3 | 13:14:41 | 10:14:41 | 121.3 | 112 | — | — | 0.0 | — | 1008 |
| 4 | 13:15:41 | 10:15:41 | 124.4 | 112 | +3.0 | +0.05 | 0.0 | 24.0 | 1008 |
| 5 | 13:16:39 | 10:16:39 | 120.4 | 112 | −4.0 | −0.07 | 0.0 | 0.0 | 1008 |
| 6 | 13:17:39 | 10:17:39 | 120.4 | 113 | 0.0 | 0.00 | 1.9 | 0.0 | 1008 |
| 7 | 13:18:39 | 10:18:39 | 119.5 | 113 | −0.9 | −0.02 | 0.0 | 0.0 | 1008 |
| 8 | 13:19:39 | 10:19:39 | 119.5 | 113 | 0.0 | 0.00 | 0.0 | 0.0 | 1008 |
| 9 | 13:20:39 | 10:20:39 | 118.3 | 113 | −1.2 | −0.02 | 0.0 | 0.0 | 1008 |
| **10** | **13:21:39** | **10:21:39** | **118.6** | 113 | +0.3 | +0.01 | 0.0 | 0.0 | 1008 |
| 11 | 13:22:39 | 10:22:39 | 164.0 | 159 | +45.4 | +0.76 | 24.1 | 115.4 | 1003 |
| 12 | 13:23:39 | 10:23:39 | 393.8 | 388 | +229.8 | +3.83 | 33.3 | 548.0 | 976 |
| 13 | 13:24:39 | 10:24:39 | 635.5 | 632 | +241.7 | +4.03 | 24.1 | 511.7 | 948 |
| 14 | 13:25:39 | 10:25:39 | 888.8 | 885 | +253.3 | +4.22 | 31.5 | 472.4 | 919 |

Hasta el frame 10 todo es ruido de GPS en tierra: altitud entre 118 y 124 m sin tendencia (el mayor salto es 4.0 m), barómetro constante (112–113 m, 1008 hPa), velocidad nula y ningún desplazamiento sostenido (el único movimiento, 24 m entre los frames 3 y 4, es el ajuste del fix con 8 satélites). No se asume el frame 11: el análisis es un criterio explícito.

**Criterio (reproducible, `js/phases.js`, parámetros en `ASCENT_CRITERIA`).** Se busca la primera transmisión *i* tal que en los **4 intervalos consecutivos** que parten de ella (*i→i+1*, …, *i+3→i+4*) tanto la altitud GPS como la altitud barométrica suben **al menos 10 m en cada intervalo** (≈ 2.5 × el mayor salto GPS en tierra) y la ganancia GPS acumulada es **≥ 100 m**. El ruido en tierra no cumple esto: ni un salto aislado de ±15 m, ni una subida de solo 3 intervalos, ni un GPS que sube con el barómetro plano (comprobado con pruebas unitarias). La transmisión *i* es el **ancla** (última posición en tierra, base del primer intervalo ascendente) y *i+1* la primera ya en el aire.

**Resultado con los datos reales.** *i* = **frame 10** (2026-10-11T13:21:39Z = 10:21:39 hora local, altitud GPS 118.6 m). Evidencia: intervalos 10→11 (+45.4 m GPS / +46 m barómetro), 11→12 (+229.8 / +229), 12→13 (+241.7 / +244) y 13→14 (+253.3 / +253); ganancia acumulada ≈ 770 m. El primer punto en el aire es el frame 11 (13:22:39Z). El instante exacto de la liberación está en algún lugar entre los frames 10 y 11 (≤ 60 s); la reproducción parte del frame 10 y el primer tramo interpolado (visual) muestra el despegue.

**Modelo de fases.** `preLaunch` / en tierra: frames 3 a 9 (7 transmisiones, conservadas en `transmissions.json` y en memoria como `data.preLaunch`; texto de fase "En tierra / preparación"). `ascent`: desde el frame 10 hasta el máximo (frame 138). `descent`: desde el frame 139. El frame 10 se muestra como "Fase de ascenso; liberación (último punto en tierra antes del ascenso)".

**Comportamiento anterior → nuevo.** Antes: la reproducción y el slider empezaban a las 10:14:41 (frame 3) y durante ≈ 7 minutos el conjunto se arrastraba sobre el suelo sin subir; la trayectoria principal incluía ese tramo. Ahora: el slider, Play y la trayectoria principal empiezan en la liberación (10:21:39); el primer minuto sube suavemente (≈ +36 m, interpolación visual hacia el frame 11) y luego asciende ≈ 3.8 a 4.2 m/s; los gráficos y las estadísticas usan las 148 transmisiones (cobertura de "Mi recepción": 140 de 148 = 94.6 %; antes 140 de 155). El punto de lanzamiento se marca aparte ("Lanzamiento · primera posición GPS válida (en tierra)") y la liberación como "Liberación · frame 10". No se agrega una trayectoria de preparación en tierra.

**Corrección visual al terreno.** Sigue siendo necesaria solo para el ancla (frame 10, +9.7 m de render, único frame del vuelo efectivo bajo el terreno); los frames 3 a 9 ya no se reproducen. No se modifica `altitudeGpsM`.

## Etapa 15: paracaídas, interpolación y nubes

- **Paracaídas: no abrió (confirmado por el usuario).** Procedencia separada: el punto de recuperación es de APRS de CX5RN-5; el estado del paracaídas es una confirmación del usuario y **no** se deriva del log APRS ni de la telemetría (que no lo contradicen ni lo prueban). Está en `recovery.json → parachute`. Ya no se usa lenguaje de duda ("aparentemente", "no confirmado").
- **Posición interpolada = reconstrucción visual.** Entre transmisiones, la posición dibujada (Hermite monótona) no es un dato; coincide exactamente con las transmisiones reales y no las modifica. Ver `docs/PHYSICS.md` para las velocidades derivadas, sus diferencias con la velocidad/curso transmitidos y las métricas de la interpolación.
- **Nubes 3D = reconstrucción aproximada.** Las nubes de la aplicación derivan de `data/clouds/cloud-model.json` (base inferida de METAR a 68–116 km, tope satelital con dispersión, confianza baja a media). No son una observación; ver `docs/CLOUD_MODEL.md`.

## Etapa 16: fase visual final no telemétrica

Entre el frame 157 (última telemetría) y el punto de recuperación (APRS de CX5RN-5) **no hay datos de posición ni de tiempo**. La animación final (18 s de reproducción) es una reconstrucción visual: no es una medición, no tiene timestamp APRS, no agrega transmisiones y no modifica `transmissions.json`. Ver `docs/PHYSICS.md`. El paracaídas figura como "no abrió (confirmado)" (confirmación del usuario).
