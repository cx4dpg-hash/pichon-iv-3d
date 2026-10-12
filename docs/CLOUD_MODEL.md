# Modelo meteorológico de la nubosidad (borrador para revisión)

Archivo: [`data/clouds/cloud-model.json`](../data/clouds/cloud-model.json) · Generador: [`tools/cloud-model/build_cloud_model.py`](../tools/cloud-model/build_cloud_model.py) · Prueba: `tests/cloudmodel.test.mjs`.

**Esto no es una nube 3D.** Es la base de evidencia (qué se sabe, con qué método y con qué confianza) sobre la nubosidad que atravesó PICHÓN IV, para decidir después si y cómo representarla en 3D. La aplicación todavía no lee este archivo.

## Estado de la interfaz: sin nubes visibles

La antigua capa plana "Nubosidad satelital 2D" (imágenes GOES-19 GeoColor sobre el terreno, sin altura ni volumen) fue **retirada deliberadamente** de la interfaz y del modo presentación por decisión de producto: la nubosidad debe ser 3D y meteorológicamente representativa, y hasta entonces no se muestra ninguna nube. Se conservan, sin cargarse en el uso normal, `js/clouds.js` y `assets/clouds/` (22 fotogramas y manifiesto) como material de referencia para la futura implementación. La reconstrucción meteorológica de este documento está preparada; la representación volumétrica 3D está pendiente.

## Objetivo y periodo

Reconstruir, con datos reales y declarando lo desconocido, la nubosidad en la franja que recorrió el globo: lat −34.7…−33.9, lon −55.50…−53.85 (trayectoria: lat −34.38…−34.17, lon −55.36…−53.99). Periodo: vuelo efectivo, **10:21:39 a 13:23:46 hora de Uruguay (UTC−3)** = 13:21:39 a 16:23:46 UTC del 2026-10-11.

## Fuentes

| Id | Fuente | Aporta | Cadencia | Estado |
|---|---|---|---|---|
| `goes19-acha2kmf` | GOES-19 ABI L2 ACHA (altura del tope, 2 km), bucket público `noaa-goes19` de AWS | tope | 30 min usados (:20, :50) | usada |
| `goes19-actpf` | GOES-19 ABI L2 ACTP (fase del tope, 2 km) | cobertura, fase | 10 min (se usaron :20 y :50) | usada |
| `goes19-achtf` | GOES-19 ABI L2 ACHT (temperatura del tope, 2 km) | temperatura del tope | 30 min usados | usada |
| `goes19-achaf` | GOES-19 ABI L2 ACHA (10 km) | serie de 10 min para justificar la resolución temporal | 10 min | usada solo para eso |
| `metar-SULS`, `metar-SUMU` (y SUCA, SUDU, SUMO, SURV, SUSO) | METAR de aeropuertos uruguayos vía Iowa Environmental Mesonet | techo (capa BKN/OVC más baja), fragmentos más bajos, llovizna | horaria | SULS y SUMU usadas; las demás descargadas pero a > 130 km de las zonas |
| `balloon-telemetry-insitu` | Telemetría del propio globo | verificación cruzada del tope en el ascenso inicial | 1 min | **solo contraste**, no alimenta valores |

Los NetCDF de GOES-19 **no se versionan** (decenas de MB). Se versionan: los METAR crudos en `data/clouds/sources/metar/*.csv` y un extracto pequeño con la estadística por zona y escena en `data/clouds/sources/goes19-zone-stats.json`. También se consultó el modelo ECMWF IFS (Open-Meteo) como contexto (cobertura 94–100 %, baja 51→89 %); **no se usó para ningún valor** y no está en el JSON.

### No encontrado o no disponible
- **Radiosondeo**: no hay sondeo de Carrasco/Ezeiza del 2026-10-11 12Z en las fuentes consultadas (Universidad de Wyoming, IEM RAOB). No se sustituyó por un sondeo de otra fecha.
- **Ceilómetro/lidar** a lo largo de la trayectoria: no existe.
- **Tipo de nube automatizado**: no se obtuvo una clasificación de género validada.

## Variables

| Variable | Origen | Status | Qué es exactamente |
|---|---|---|---|
| `cloudCoverage` | ACTP | derived | % de píxeles de 2 km de la zona clasificados como nube. Cobertura de **columna**, no por capa |
| `cloudTopM` | ACHA | derived | Mediana del tope (m) de los píxeles de la zona; rango = percentiles 10–90. Incluye `topTemperatureC` (ACHT) |
| `cloudPhase` | ACTP | derived | Fase dominante (líquida si ≥ 90 % de los píxeles nublados) con las fracciones |
| `cloudBaseM` | METAR | **inferred** | Techo (capa BKN/OVC más baja) de la estación más cercana, en m AGL, trasladado a la zona (estaciones a 68–116 km). Rango = capas BKN/OVC de las estaciones usadas |
| `cloudThicknessM` | tope − base | **inferred** | Tope ACHA − techo METAR, asumiendo base ≈ MSL (sin elevación de estación) |
| `cloudTypeProbable` | regla cualitativa | **inferred** | "Estratiforme baja (stratus/stratocumulus probable)" si fase líquida + tope < 2,5 km + techo < 1 km |
| `confidence` (por zona-estado) | — | — | El mínimo entre cobertura, tope y base |

Significado de `status`: **observed** = observación directa en el punto (ningún valor del modelo lo es: la base está a decenas de km y el satélite entrega productos de algoritmo); **derived** = salida de un algoritmo satelital o cálculo explícito con ellos; **inferred** = traslado espacial o regla con supuestos; **unknown** = no sustentado.

## Metodología

1. **Estados**: 7 instantes cada 30 min (13:20, 13:50, …, 16:20 UTC; 10:20 … 13:20 local). Resolución: la base solo viene de METAR horarios y las escenas de :20/:50 son las que se usaron para tope y temperatura; la serie de 10 min del tope de 10 km varía como máximo ≈80 m entre escenas consecutivas (`temporalResolution.evidence10min`), muy por debajo de la dispersión entre píxeles. Pasar a 10 min no estaría sustentado para base y tipo.
2. **Zonas** (solo porque los datos lo sustentan): se promedió en el tiempo la mediana del tope por bandas de 0,2° de longitud y se ajustó una función por tramos constantes de 3 tramos: oeste de 55,8°W ≈ 2,1 km, 55,8–54,2°W ≈ 1,4 km, este de 54,2°W ≈ 0,9 km. El tramo occidental queda fuera de la trayectoria. Quedan dos zonas: **Z1 centro-oeste** (55,50–54,20°W) y **Z2 este** (54,20–53,85°W). Regla: separar zonas solo si sus medianas de tope difieren > 150 m; se cumple en los 7 estados (165–514 m). El borde real es gradual (~19 km); 54,2°W es aproximado.
3. **Cobertura, tope, fase**: estadística de los píxeles de la zona en la escena cuyo inicio coincide con el estado (`goes19-zone-stats.json`).
4. **Base**: el METAR más cercano en el tiempo (sin interpolar; diferencia 0–10 min) de la estación más cercana (≤ 130 km). Confianza `medium` solo si la estación está a ≤ 80 km y las capas de las estaciones usadas difieren ≤ 300 m; si no, `low`. Los METAR dan alturas en múltiplos de 100 ft (≈30 m) sobre la estación.
5. **Espesor y tipo**: ver tabla de variables. El tipo es una etiqueta cualitativa de una sola clase; los fragmentos más bajos (FEW/SCT 150–300 m) quedan en `fragmentsBelowM`.
6. **Verificación cruzada in situ**: en el ascenso inicial la humedad del sensor cae de 39 % a 11 % entre 1512 y 1677 m barométricos (13:28–13:29Z), compatible con el tope de una capa húmeda cerca de esa altura (ACHA da ≈ 1,2–1,5 km). El sensor nunca superó 61 %, así que no se observó saturación: **no confirma ni descarta** nube dentro de la capa.

## Resultado resumido

Capa estratiforme baja casi continua (cobertura 98–100 % en todos los estados), de fase líquida, con tope de ≈ 1,2–1,45 km en Z1 (aumentando con el tiempo) y de ≈ 0,9–1,2 km en Z2, temperatura de tope 3–6 °C, techos reportados de 244 a 518 m (rango 244–732 m entre estaciones), espesor aproximado 400–1000 m. Sin evidencia de nubes medias o altas en los METAR cercanos ni en el tope satelital (el percentil 90 del tope en Z1 llega a 2,0–2,5 km: es dispersión o capas más altas dispersas, no determinadas).

## Informe por estado (hora local de Uruguay)

| Hora local | Zona | Cobertura | Tipo probable | Base (techo METAR) | Tope (ACHA) | Espesor | Fuente | Confianza |
|---|---|---|---|---|---|---|---|---|
| 10:20 | Centro-oeste | 100 % | estratiforme baja (stratus/stratocumulus probable) | 457 m (457–701) | 1219 m (p10–p90 971–2259) | ≈762 m (518–762) | GOES-19 ACHA/ACTP/ACHT; METAR SULS, SUMU | baja |
| 10:20 | Este | 98 % | ídem | 457 m | 1055 m (591–1242) | ≈598 m | GOES-19; METAR SULS | baja |
| 10:50 | Centro-oeste | 100 % | ídem | 244 m (244–732) | 1253 m (995–2299) | ≈1009 m (521–1009) | GOES-19; METAR SULS, SUMU | baja |
| 10:50 | Este | 100 % | ídem | 244 m (244–518) | 1065 m (693–1219) | ≈821 m (547–821) | GOES-19; METAR SULS | baja |
| 11:20 | Centro-oeste | 100 % | ídem | 244 m (244–732) | 1276 m (1037–1951) | ≈1032 m (544–1032) | GOES-19; METAR SULS, SUMU | baja |
| 11:20 | Este | 100 % | ídem | 244 m (244–518) | 1042 m (675–1221) | ≈798 m (524–798) | GOES-19; METAR SULS | baja |
| 11:50 | Centro-oeste | 100 % | ídem | 518 m (427–640) | 1299 m (1036–1624) | ≈781 m (659–872) | GOES-19; METAR SULS, SUMU | baja |
| 11:50 | Este | 100 % | ídem | 518 m | 1003 m (627–1266) | ≈485 m | GOES-19; METAR SULS | baja |
| 12:20 | Centro-oeste | 100 % | ídem | 518 m (427–640) | 1350 m (1009–2040) | ≈832 m (710–923) | GOES-19; METAR SULS, SUMU | baja |
| 12:20 | Este | 100 % | ídem | 518 m | 941 m (624–1387) | ≈423 m | GOES-19; METAR SULS | baja |
| 12:50 | Centro-oeste | 100 % | ídem | 518 m (518–610) | 1430 m (1024–2379) | ≈912 m (820–912) | GOES-19; METAR SULS, SUMU | baja |
| 12:50 | Este | 100 % | ídem | 518 m | 916 m (603–1391) | ≈398 m | GOES-19; METAR SULS | baja |
| 13:20 | Centro-oeste | 100 % | ídem | 518 m (518–610) | 1452 m (1200–2477) | ≈934 m (842–934) | GOES-19; METAR SULS, SUMU | baja |
| 13:20 | Este | 100 % | ídem | 518 m | 1195 m (730–1394) | ≈677 m | GOES-19; METAR SULS | baja |

No hay filas "no determinado" porque siempre hubo un techo METAR cercano en el tiempo, pero la base **no está medida a lo largo de la trayectoria**: es la de estaciones a 68–116 km, y el tipo es una etiqueta inferida. La columna de confianza es el mínimo; por campo: cobertura alta, tope baja a media (dispersión), fase media, base baja (media en Z1 cuando SULS y SUMU concuerdan).

## Incertidumbres y limitaciones

- **Base**: la mayor incertidumbre. Estaciones a 68–116 km, hora distinta (0–10 min), techo en m AGL (la elevación de la estación no se aplicó), resolución de ~30 m, y capas inferiores fragmentadas (FEW/SCT a 150–300 m). En Z2 solo hay una estación, por lo que el "rango" de la base no representa la incertidumbre real.
- **Tope**: ACHA es una recuperación por algoritmo; en capas bajas con inversión suele tener errores de cientos de metros, y la referencia vertical (nivel del mar) se asumió según la documentación del producto sin verificarla. El tope es el de la capa más alta visible desde el satélite.
- **Paralaje**: no corregido (≈ 1 km hacia el sureste para un tope de ≈ 1 km, menor que los 0,2° de las bandas y los 2 km de píxel).
- **Hora**: la hora nominal de cada estado es el inicio del escaneo; la zona (≈34°S) se observa unos 6 min después (estimado).
- **Cobertura** es de columna: no distingue capas ni huecos entre ellas.
- **Variabilidad horizontal** dentro de cada zona no está resuelta (la dispersión p10–p90 llega a 400–1500 m).
- Dos zonas son una simplificación: el borde real es gradual.

## Lo que falta para una representación 3D

1. Base medida o estimada con más sustento (radiosondeo 12Z real, ceilómetros, o el perfil de humedad/temperatura del globo con sensor calibrado; el modelo ECMWF solo como contexto).
2. Estructura vertical: número de capas, cobertura por capa y huecos (un solo valor de tope no basta para dibujar volumen).
3. Variabilidad horizontal a escala de km (textura, huecos): datos de mayor resolución (ABI banda 2 de 0,5 km, VIIRS/MODIS) y no solo los productos de 2–10 km.
4. Corrección de paralaje con el tope por píxel.
5. Contenido de agua / espesor óptico (ACMF/CODF/CPSF ya están disponibles en GOES-19) si se quiere opacidad física.
6. Decisión explícita de la representación: p. ej. un **techo y un suelo de capa estratiforme** (dos superficies con textura de la imagen satelital) es lo único defendible hoy; nubes con forma volumétrica no estarían respaldadas.

**Recomendación:** si se hace una primera nube 3D, que sea una capa estratiforme limitada por dos superficies (base y tope por zona y hora, interpoladas visualmente entre estados), rotulada como "reconstrucción a partir de datos satelitales y METAR, base inferida", y sin forma interna inventada.

## Reproducir

```
python tools/cloud-model/build_cloud_model.py --goes-dir <carpeta con ACHA2KMF/ ACTPF/ ACHTF/ ACHAF/ de NetCDF GOES-19> [--pylib <carpeta con netCDF4, pyproj, numpy>]
node --test tests/cloudmodel.test.mjs
```
Requiere Python con numpy, netCDF4 y pyproj. Los NetCDF salen de `https://noaa-goes19.s3.amazonaws.com/<producto>/2026/284/<hora UTC>/` (día juliano 284 = 11/10/2026).
