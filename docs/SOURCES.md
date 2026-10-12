# Fuentes de datos, metodología y limitaciones

> Este documento se **genera** desde [`data/metadata.json`](../data/metadata.json) con `node tools/docs/build-sources-md.mjs` y refleja exactamente la ventana ⓘ de la interfaz (Metodología, Fuentes de datos, Limitaciones). No se edita a mano: se cambia `metadata.json` y se regenera.

## Metodología

- **Transmisiones reales y posición visual.** Los valores del panel son los de la transmisión real vigente y no se interpolan. La posición dibujada entre dos transmisiones sí se interpola (Hermite cúbica monótona): es solo visual, coincide exactamente en cada transmisión y no crea datos. La carga representa la posición GPS, y la línea amarilla y la carga usan la misma función positionAtTime.
- **Diámetro del globo.** Es una estimación física basada en presión, temperatura y diámetro inicial estimado; no es una medición directa y solo se calcula durante el ascenso.
- **Tamaño visual del conjunto.** El globo y la carga se dibujan con tamaño físico/modelado de cerca; solo a gran distancia se aplica una ayuda de visibilidad gradual y limitada (no es tamaño físico).
- **Suspensión y antena.** Las separaciones de la suspensión y la antena son solo visuales; no representan longitudes medidas.
- **Tramo final violeta.** El tramo desde la última transmisión (frame 157) hasta el punto de recuperación es una reconstrucción no telemétrica: no es una trayectoria APRS medida. Su duración base de 18 s a 1x es reconstruida para presentación, no medida, y respeta la velocidad de reproducción elegida.
- **Nubes 3D.** Son una reconstrucción aproximada (GOES-19 + METAR, vía cloud-model.json), no una medición volumétrica real. Tope, cobertura y fase son derivados; base, espesor y tipo son inferidos; la región extendida es una extrapolación visual.

## Fuentes de datos

### Telemetría de vuelo (CX1AA-11)

- Balizas APRS del globo CX1AA-11 tal como las publica APRS.fi.
- Archivo crudo archivado en el proyecto: PDF de paquetes de APRS.fi (183 líneas de recepción → 168 transmisiones únicas; 155 con posición GPS válida y 148 en el vuelo efectivo, frames 10 a 157).
- Aportan: hora de emisión (timestamp APRS, UTC), posición, altitud GPS, velocidad, curso y telemetría ambiental (presión, temperaturas, humedad, altitud barométrica, batería y estado GPS).
- El significado de los campos se contrastó con las páginas del proyecto; la escala de la batería y el significado de los modos G y P no están documentados.

**APRS.fi** (`aprs.fi`) · aprs aggregator · confianza alta
- Sustenta: tramas APRS del CX1AA-11 (posición, curso/velocidad, altitud GPS, payload de telemetría); balizas de posición propias de las estaciones terrestres fijas.
- Archivo: `imports/source/cx1aa-11-aprsfi-raw.pdf`
- Enlace: https://aprs.fi
- Notas: Datos derivados de logs APRS. Los tiempos de inicio/fin del vuelo principal se derivan de ellos y no son horarios oficiales. El archivo crudo de CX1AA-11 es un PDF de paquetes de APRS.fi archivado en el proyecto.

**Páginas oficiales/semioficiales del proyecto PICHÓN IV** (`pichon-project-pages`) · project web pages · confianza alta
- Sustenta: confirmación del significado de los campos de telemetría del payload APRS.
- Enlace: https://www.pyagestion.uy/RCU/datos.php · https://www.pyagestion.uy/RCU/graficas.php · https://www.pyagestion.uy/RCU/trayectoria.php
- Notas: El campo de batería no tiene escala/unidad confirmada inequívocamente. Los significados de los modos G y P no están documentados.

### Estaciones y firstIgate

- Estaciones fijas con posición conocida (baliza propia de cada una en APRS.fi, 11/10/2026): CX2TN-1, CX4DPG-1, CX2CQ-1 y CX2ACB-1.
- CX3BP-8 es una estación móvil: su posición es desconocida en el dataset del proyecto y no se le asigna ninguna coordenada.
- firstIgate es la primera estación en la que aparece cada transmisión en APRS-IS dentro del dataset disponible.

**Balizas propias de las estaciones terrestres (APRS.fi)** (`aprsfi-station-beacons`) · aprs aggregator · confianza alta
- Sustenta: posición de las estaciones fijas CX2TN-1, CX4DPG-1, CX2CQ-1 y CX2ACB-1 (baliza de cada estación el 11/10/2026).
- Archivo: `imports/source/cx2tn-1-2026-10-11.pdf`, `imports/source/cx4dpg-1-2026-10-11.pdf`, `imports/source/cx2cq-1-2026-10-11.pdf`, `imports/source/cx2acb-1-2026-10-11.pdf` (no versionado)
- Enlace: https://aprs.fi
- Notas: PDFs archivados localmente. Contienen solo balizas propias de cada estación, ningún paquete de CX1AA-11; no se usan como recepción. CX3BP-8 es móvil y no tiene posición en el dataset.

**Identificación del proyecto** (`user-confirmed-project-context`) · project definition · confianza alta
- Sustenta: existencia de la estación móvil CX3BP-8 y condición de posición desconocida; datos generales del vuelo (misión, indicativo, fecha, lugar de lanzamiento).
- Notas: Datos aportados por Pedro / el equipo del proyecto.

### Recepción local (Mi recepción)

- Log Dire Wolf de CX4DPG usado para validar el importador.
- El matching se hace en el navegador; el archivo se procesa localmente, sin enviarse a ningún servidor ni guardarse.
- El dataset maestro nunca se modifica; recibir una trama no implica ser su primer IGate.

**Log de recepción local Dire Wolf de CX4DPG** (`dw-cx4dpg-local-log`) · user supplied log · confianza alta
- Sustenta: 140 paquetes de CX1AA-11 recibidos localmente por CX4DPG, usados para validar el importador de "Mi recepción".
- Archivo: `imports/source/cx4dpg-local-2026-10-11.log` (no versionado)
- Notas: No se versiona (.gitignore excluye *.log). El formato CSV de Dire Wolf no trae la hora APRS interna, por lo que las coincidencias son "probables".

**Logs de recepción cargados por el usuario (Mi recepción)** (`user-log-uploads`) · user supplied log · confianza desconocida
- Sustenta: tramas recibidas localmente por cada radioaficionado (importador local de logs).
- Notas: Implementado. Se procesan localmente en el navegador, sin enviar nada a un servidor ni guardarlo; no se mezclan con los datos maestros.

### Recuperación

- Punto de recuperación: trama APRS de CX5RN-5 de las 15:27:45 (-03), 34°19.72' S, 53°59.19' W (−34.3286667, −53.9865), verificada contra el PDF de APRS.fi archivado en el proyecto.
- Paracaídas: no abrió (confirmado por el usuario; no deriva del log APRS).
- Entre la última transmisión de CX1AA-11 (frame 157) y ese punto no hay telemetría: se dibuja como tramo final no telemétrico.

**APRS.fi raw packet log de CX5RN-5 (equipo de rescate)** (`cx5rn-5-aprsfi-log`) · aprs aggregator · confianza alta
- Sustenta: posiciones APRS de CX5RN-5 en el sector de recuperación de la carga (15:22 a 15:33 -03); la trama de 15:27:45 -03 (34°19.72' S, 53°59.19' W) es el punto de recuperación principal.
- Archivo: `imports/source/cx5rn-5-aprsfi-raw-2026-10-11.pdf`
- Notas: PDF de APRS.fi aportado por el usuario y archivado en imports/source/. Las cinco tramas usadas en recovery.json se verificaron directamente contra este archivo (15:22:47, 15:24:51, 15:27:45, 15:31:54 y 15:33:26 -03).

**Confirmación del paracaídas y estimación inicial del rescate aportadas por el usuario** (`user-reported-rescue-point`) · user reported location · confianza alta
- Sustenta: confirmación del estado del paracaídas: no abrió (confirmado por el usuario; no proviene de APRS); estimación visual inicial del punto de rescate (34°19.69' S, 53°59.15' W), SUPERADA por la trama APRS de CX5RN-5.
- Notas: El estado del paracaídas (no abrió) es una confirmación del usuario, no un dato APRS. El punto de rescate vigente ya no depende de esta fuente: está respaldado por APRS de CX5RN-5 (fuente cx5rn-5-aprsfi-log).

**Capturas de APRS.fi aportadas por el usuario** (`user-aprsfi-screenshots`) · user supplied screenshots · confianza media
- Sustenta: corroboración visual del punto de partida (≈ 34°17.84' S, 55°21.32' W); corroboración visual secundaria del sector de recuperación (≈ 34°19.72' S, 53°59.19' W).
- Notas: Las coordenadas leídas del indicador superior de APRS.fi son referencias visuales; no sustituyen posiciones APRS identificadas.

### Lanzamiento

- Lanzamiento efectivo: primera posición GPS válida de CX1AA-11 (frame 3, 13:14:41 UTC; −34.297167, −55.355333), en tierra. La reproducción empieza en la liberación (frame 10).
- Lugar planificado previo (Aero Club de Mercedes, Soriano; domingo 11/10, 10:00): Boletín CX Nº 918. Es el plan, no el lugar efectivo.

**APRS.fi** (`aprs.fi`) · aprs aggregator · confianza alta
- Sustenta: tramas APRS del CX1AA-11 (posición, curso/velocidad, altitud GPS, payload de telemetría); balizas de posición propias de las estaciones terrestres fijas.
- Archivo: `imports/source/cx1aa-11-aprsfi-raw.pdf`
- Enlace: https://aprs.fi
- Notas: Datos derivados de logs APRS. Los tiempos de inicio/fin del vuelo principal se derivan de ellos y no son horarios oficiales. El archivo crudo de CX1AA-11 es un PDF de paquetes de APRS.fi archivado en el proyecto.

**Boletín CX Nº 918 del Radio Club Uruguayo (12 de setiembre de 2026)** (`rcu-bulletin-918`) · bulletin · confianza alta
- Sustenta: lugar PLANIFICADO del lanzamiento (Aero Club de Mercedes, Soriano) y hora prevista (domingo 11 de octubre, 10:00 CX); identidad gráfica del RCU y de Pichón IV (logos).
- Archivo: `imports/source/Boletin CX 918.pdf`
- Notas: Describe el plan, no el lugar efectivo de partida: este se deriva de la primera posición GPS válida (flight.json → actualLaunch).

### Meteorología y nubes 3D

- GOES-19 ABI L2: ACHA (altura del tope), ACTP (cobertura y fase) y ACHT (temperatura del tope).
- METAR de aeropuertos uruguayos (SULS y SUMU entre otros) para el techo de nubes, a 68–116 km de la trayectoria.
- Las Nubes 3D son una reconstrucción aproximada a partir de cloud-model.json (7 estados cada 30 min, 2 zonas); la región extendida es una extrapolación solo visual.
- Estados del modelo: observado = observación directa; derivado = resultado de un algoritmo satelital o cálculo explícito; inferido = traslado espacial o regla con supuestos; desconocido = no sustentado. Aquí tope, cobertura y fase son derivados; base, espesor y tipo son inferidos.

**GOES-19 ABI L2: ACHA (tope), ACTP (fase), ACHT (temperatura del tope), 10 min y 2 km** (`goes19-l2-cloud-products`) · satellite retrieval · confianza media
- Sustenta: cobertura de columna, tope, fase y temperatura del tope por zona y hora (data/clouds/cloud-model.json).
- Enlace: https://noaa-goes19.s3.amazonaws.com/
- Notas: Productos de algoritmo (no mediciones directas). Los NetCDF no se versionan; se versiona un extracto estadístico en data/clouds/sources/goes19-zone-stats.json.

**METAR de aeropuertos de Uruguay (SULS, SUMU y otros) vía Iowa Environmental Mesonet** (`metar-uruguay-iem`) · surface observation · confianza media
- Sustenta: techo de nubes (BKN/OVC), capas bajas y llovizna a 68–116 km de la trayectoria.
- Enlace: https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py
- Notas: Los METAR crudos están en data/clouds/sources/metar/. Son observaciones horarias en las estaciones, no a lo largo de la trayectoria: la base de nube del modelo es una inferencia.

**Modelo meteorológico de nubosidad del proyecto (cloud-model.json)** (`cloud-model`) · derived model · confianza baja a media
- Sustenta: cobertura, tope, base, espesor, fase y tipo probable por zona y cada 30 min, con método, estado y confianza; origen de las Nubes 3D.
- Archivo: `data/clouds/cloud-model.json`
- Notas: Reconstrucción derivada de GOES-19 y METAR (ver docs/CLOUD_MODEL.md). Ningún valor es observado en la trayectoria: tope, cobertura y fase son derivados; base, espesor y tipo son inferidos.

### Cartografía y software

- Imaginería y relieve: Cesium World Imagery y Cesium World Terrain vía Cesium Ion (token local, no versionado).
- Respaldo sin token: OpenStreetMap sobre el elipsoide, sin relieve.
- El relieve es solo de representación y no modifica ningún dato de vuelo.

**CesiumJS 1.123.1** (`cesiumjs`) · software library · confianza alta
- Sustenta: visor 3D, cámara, entidades, nubes (CloudCollection) y gestión de la cartografía.
- Enlace: https://cesium.com/platform/cesiumjs/
- Notas: Cargado desde el CDN de jsDelivr con versión fija.

**Cesium Ion: Cesium World Imagery y Cesium World Terrain** (`cesium-ion`) · map service · confianza alta
- Sustenta: imaginería satelital y relieve 3D (solo de representación).
- Enlace: https://cesium.com/platform/cesium-ion/
- Notas: Requiere un token personal en config.local.js (no versionado; config.example.js es la plantilla). Las alturas de terreno no se guardan ni modifican datos de vuelo.

**OpenStreetMap sobre el elipsoide (mapa básico, respaldo)** (`osm-basic`) · map service · confianza alta
- Sustenta: mapa de respaldo sin relieve cuando no hay token de Cesium Ion o falla.
- Enlace: https://www.openstreetmap.org/copyright
- Notas: Modo por defecto sin token ("Mapa básico · sin relieve").

**Chart.js 4.4.1** (`chartjs`) · software library · confianza alta
- Sustenta: gráficos de telemetría.
- Enlace: https://www.chartjs.org
- Notas: Cargado desde el CDN de jsDelivr con versión fija.

### Branding y documentación

- Radio Club Uruguayo: escudo (logo-rcu.jpg) y Boletín CX Nº 918.
- Símbolo gráfico de Pichón IV: cabeza de ave extraída del Boletín CX Nº 918 (el boletín no lo rotula como logo oficial; a confirmar con el proyecto).

**Boletín CX Nº 918 del Radio Club Uruguayo (12 de setiembre de 2026)** (`rcu-bulletin-918`) · bulletin · confianza alta
- Sustenta: lugar PLANIFICADO del lanzamiento (Aero Club de Mercedes, Soriano) y hora prevista (domingo 11 de octubre, 10:00 CX); identidad gráfica del RCU y de Pichón IV (logos).
- Archivo: `imports/source/Boletin CX 918.pdf`
- Notas: Describe el plan, no el lugar efectivo de partida: este se deriva de la primera posición GPS válida (flight.json → actualLaunch).

**Escudo del Radio Club Uruguayo (logo-rcu.jpg)** (`rcu-logo`) · branding · confianza alta
- Sustenta: escudo del RCU del encabezado.
- Archivo: `imports/source/logo-rcu.jpg`
- Notas: En el encabezado se usa el emblema del RCU del Boletín CX 918 (ver docs/BRANDING.md).

### Modelo del globo y estimaciones visuales

- El diámetro inicial, el tamaño de la carga y la disposición de suspensión y antena son estimaciones visuales, no mediciones.

**Estimaciones visuales de imágenes** (`visual-estimates`) · visual estimate · confianza baja a media
- Sustenta: diámetro inicial estimado del globo; dimensiones estimadas de la carga útil; disposición de la suspensión de la carga y la antena.
- Notas: Son estimaciones, no mediciones. Cada valor lleva su propia incertidumbre y nivel de confianza en flight.json.

## Limitaciones

- APRS no registra una posición continua: hay una transmisión cada ≈ 1 a 2 minutos y la trayectoria entre tramas se interpola.
- El tramo final hasta el punto de recuperación es una reconstrucción visual, sin tiempos ni trayectoria medidos.
- Las nubes 3D son aproximadas: la base, el tope y el espesor son derivados o inferidos, y la base sale de estaciones a decenas de km.
- El modelo del diámetro del globo es aproximado.
- Puede haber diferencia entre la altitud GPS y la referencia vertical del terreno; por eso hay una corrección visual al terreno al lanzar y al apoyar la carga.
- firstIgate significa primera aparición en APRS-IS dentro del dataset disponible, no necesariamente la primera estación RF que oyó el globo.
