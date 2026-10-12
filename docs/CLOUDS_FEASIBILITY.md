# Nubosidad histórica del vuelo: análisis de viabilidad

Estado: análisis (etapa anterior) + **base implementada en la etapa 10** (ver "Implementación inicial").

Fecha del análisis: 2026-10-12. Ventana del vuelo: 10:14:41 a 13:23:47 hora de Uruguay (UTC−3) = **13:14:41Z a 16:23:47Z** del 2026-10-11.

## Resumen

Sí es viable reconstruir los cielos con fuentes satelitales **reales**. El mejor candidato es **GOES-East (hoy GOES-19)**, imagen **GeoColor** a 1 km cada 10 minutos, disponible sin clave en **NASA GIBS** y, con todos los canales y productos de nubes, en el archivo abierto de NOAA en AWS. Para la ventana del vuelo hay 21 de 21 fotogramas válidos de 10 minutos. Un riesgo concreto: **GIBS conserva los fotogramas GOES solo unos dos meses**, así que conviene archivarlos pronto (ya se archivaron, ver más abajo).

## 1. Fuentes reales evaluadas

| Fuente | Qué es | Resolución / cadencia | Acceso | Veredicto |
|---|---|---|---|---|
| **NASA GIBS — `GOES-East_ABI_GeoColor`** (CIRA, sobre GOES-East ABI) | Color verdadero aproximado de día (IR de noche) | **1 km** (matriz `1km`), cada **10 min** | WMTS/WMS públicos, sin clave, EPSG:4326 y 3857, PNG/JPEG | **Recomendada** |
| NASA GIBS — `GOES-East_ABI_Band2_Red_Visible_1km` | Banda 2 visible (gris) | 1 km, 10 min | ídem | Útil, pero 2 de 21 fotogramas de la ventana salieron en blanco (15:00 y 15:20 Z) |
| NASA GIBS — `GOES-East_ABI_Band13_Clean_Infrared` | IR 10.3 µm | 2 km, 10 min | ídem | Sirve de día y de noche; menos "fotográfica" |
| **NOAA GOES-19 en AWS** (`s3://noaa-goes19`, productos `ABI-L1b-RadF`, `ABI-L2-CMIPF`, `ACMF`, `ACHAF`, `CTPF`, `CODF`) | Datos originales (NetCDF) en proyección geoestacionaria | 0.5–2 km, escaneo completo cada 10 min | Público, sin clave, archivo permanente | La más completa (máscara y **altura de tope de nubes**), pero con trabajo de proceso |
| NASA GIBS — MODIS Terra/Aqua, VIIRS SNPP/NOAA-20 (color verdadero) | Satélites polares | **250 m**, un paso por día | WMS/WMTS | Complemento de alta resolución en un instante; mosaico con costuras y sin hora exacta por píxel |
| ERA5 (Copernicus) cobertura de nubes | Reanálisis (modelo, no observación) | 0.25°, horario | Requiere cuenta | Solo como plan B |

**Qué satélite era GOES-East.** En octubre de 2026 el GOES-East operativo es **GOES-19** (nombre de archivo `G19`). Se comprobó que `noaa-goes19` tiene los archivos del 2026-10-11 (día juliano 284) y que `noaa-goes16` no tiene datos de esa fecha. En GIBS el nombre de capa sigue siendo `GOES-East`.

## 2. Fidelidad realista

- **Capa estática (una sola imagen):** insuficiente. En las pruebas las nubes cambian de forma apreciable durante las tres horas.
- **Varias capas por tiempo:** adecuado y simple. 22 fotogramas de 10 min (13:00 a 16:30 Z) cubren y rodean todo el vuelo.
- **Animación:** es lo realista: mostrar el fotograma que corresponde a la hora actual de reproducción y **fundir (crossfade)** entre fotogramas vecinos. Es una animación de 22 imágenes sincronizada con el playback, no un vídeo.
- **3D volumétrico:** no es realista con estas fuentes (no hay estructura vertical real salvo la altura del tope de nubes).

Lo que se puede decir con honestidad: "así se veían las nubes desde el satélite sobre Uruguay a cada instante del vuelo", con resolución de 1–2 km y retardo de hasta ±10 min. No es una reconstrucción de lo que vio el globo en vertical.

## 3. Cómo se integraría en la app

**Opción recomendada: overlay 2D georreferenciado, varias capas temporales.**
- Cada fotograma es una imagen en EPSG:4326 con su rectángulo geográfico conocido (`SingleTileImageryProvider` de Cesium con `rectangle`; la reproyección a Web Mercator la hace Cesium). Se ve que coincide con el mapa base (ver prueba de alineación).
- Dos capas de imagen activas a la vez (la actual y la siguiente) con transparencia cruzada según `playback.absoluteMs`; el resto se carga de forma perezosa.
- Interruptor "Nubosidad satelital" en el visor, con la hora del fotograma mostrada y la atribución de la fuente. Todo lo demás (datos, trayectoria, física, cámara) no cambia.
- Las imágenes se **empaquetan como activos estáticos** (no se pide nada a GIBS en tiempo de ejecución): la aplicación sigue siendo un sitio estático, sin dependencia de una API que borra datos viejos.

**Alternativas:**
- *Overlay directo a GIBS (WMTS con `TIME`)*: sin descargas, pero dependiente de servicio externo y **dejará de tener el 11/10 en ~2 meses**. No recomendable para el producto final.
- *Lámina 3D a una altura*: un rectángulo texturizado a la altura del tope de nubes (de `ACHAF`) permitiría ver si el globo estaba por encima o por debajo; exige procesar NetCDF y fijar una altura única por zona. Es una fase posterior.

## 4. Limitaciones

- **Resolución:** 1 km por píxel en GeoColor (≈ 1.5–2 km reales sobre Uruguay por el ángulo de visión). Con la cámara a 35 m de la carga, la capa se ve como una textura suave y grande; sirve como contexto, no como detalle.
- **Alineación horizontal:** correcta. En la prueba la costa del Río de la Plata y de la Laguna Merín en la imagen coincide con OpenStreetMap.
- **Paralaje (importante):** el satélite observa Uruguay con un ángulo cenital de ≈ **45.6°** (tan ≈ 1.02). Una nube a altura *h* aparece desplazada ≈ *h* hacia el lado opuesto al satélite (hacia el sureste): ≈ 2 km para nubes bajas de 2 km, ≈ 8–12 km para cirros. Una capa pegada al suelo no tiene esa corrección; solo se podría corregir con la altura del tope de nubes (`ACHAF`).
- **Hora:** el sello de GIBS es el inicio del escaneo; el escaneo llega a Uruguay unos **5–7 minutos después** (aprox.). La cadencia es de 10 min, no continua.
- **Cobertura:** el disco completo cubre Uruguay sin problema; no hay huecos en la ventana (21 de 21 válidos en GeoColor).
- **Composición:** GeoColor no es una foto: es un compuesto de CIRA (verde sintético; IR de noche). Es de día durante todo el vuelo.
- **Rendimiento:** cada fotograma de 796 × 683 px pesa ≈ 90 KB en JPEG (22 fotogramas ≈ 2 MB). Memoria de textura ≈ 2 MB por fotograma si se cargan todos (≈ 45 MB); con carga perezosa de dos fotogramas, despreciable.
- **Trabajo manual:** un guion de descarga (ya probado en este análisis) y decidir recorte y número de fotogramas. Se hace una vez.
- **Dependencia externa:** solo para obtener los datos. En producción no habría dependencia si se empaquetan.
- **Licencia y atribución:** los productos GIBS y GOES son de uso abierto; se debe atribuir "NASA GIBS / NOAA NESDIS GOES-East (GOES-19) ABI / CIRA GeoColor". Cesium e imaginería base mantienen sus propios créditos.

## 5. Pruebas realizadas (acotadas y reproducibles)

1. **Capas y fechas** (GetCapabilities de GIBS `epsg4326/best`): las capas `GOES-East_ABI_GeoColor`, `…Band2_Red_Visible_1km` y `…Band13_Clean_Infrared` existen, con cadencia de 10 min. Para 13:10–16:30 Z del 11/10/2026: **21 de 21 fotogramas** en las tres. Ventana de conservación de GIBS al 2026-10-12: GeoColor desde 2026-08-10, Banda 2 desde 2026-07-28 y Banda 13 desde 2026-07-16 (≈ 2–3 meses): **los fotogramas del vuelo desaparecerán de GIBS aproximadamente en diciembre de 2026**.
2. **Descarga real y validez:** se descargaron por WMS 1.3.0 (EPSG:4326, `BBOX=-36,-59,-30,-52`) los 21 fotogramas GeoColor, todos con contenido (desviación típica de luminancia 42–48). En Banda 2 hubo 2 fotogramas en blanco, por eso se prefiere GeoColor.
3. **Alineación:** se superpuso un fotograma (13:30 Z) a OpenStreetMap con la trayectoria del vuelo en una página aparte (no está en el proyecto): la costa coincide.
4. **Evolución temporal:** 13:10, 14:20, 15:30 y 16:30 Z muestran un banco de nubes celulares (estratocúmulos) sobre la zona del vuelo que cambia de forma durante las tres horas: una animación aporta información.
5. **Archivo AWS:** `noaa-goes19` contiene, para el 2026-10-11 hora 14 Z, 6 escaneos por hora de `CMIPF` (≈ 87–91 MB por banda), `ACMF` (≈ 24 MB), `ACHAF` (altura de tope de nubes, ≈ 1.6 MB), `CTPF` y `CODF`.

**Archivo local creado:** `imports/source/clouds-gibs-geocolor-2026-10-11/` con 22 fotogramas JPEG (13:00 a 16:30 Z, 796 × 683 px, ≈ 2 MB) y `manifest.json` con las URL exactas de cada petición, hashes y estadísticas. Es material fuente (no lo usa la aplicación todavía).

## 6. Recomendación final

**Primera implementación recomendada: secuencia temporal de 22 fotogramas GOES-19 GeoColor (GIBS) empaquetados como activos estáticos, dibujados como overlay 2D georreferenciado sobre el terreno, con fundido sincronizado al playback e interruptor.**

Es el mejor equilibrio: fuente real, 1 km, cadencia de 10 min, 2 MB, sin backend ni dependencia en producción, integración pequeña (un módulo `clouds.js` y un interruptor) y sin tocar datos, trayectoria, física ni cámara. Se muestra explícitamente como "vista satelital GOES-19 (±10 min)" y no como la nubosidad exacta que rodeó al globo.

Fases posteriores, opcionales: (a) corregir el paralaje y/o dibujar una lámina a la altura del tope de nubes con `ACHAF`; (b) superponer un paso MODIS/VIIRS de 250 m como contexto de alta resolución; (c) máscara de nubes `ACMF` para estimar cuándo el globo estuvo sobre o dentro de capas nubosas.

**Siguiente paso propuesto:** confirmar (1) GeoColor frente a visible en gris, (2) recorte y tamaño (el actual abarca lat −36 a −30, lon −59 a −52), (3) capa sobre el suelo frente a lámina elevada y (4) texto de atribución. Con eso se implementa la primera versión en una etapa corta.


> **Actualización (etapa 14):** el botón se llama ahora **"Nubosidad satelital 2D"** y la capa se documenta como *capa satelital 2D de referencia* (sin altura ni volumen). La reconstrucción meteorológica de base, tope y espesor está en [CLOUD_MODEL.md](CLOUD_MODEL.md).

## Implementación inicial (etapa 10)

Base prudente y no invasiva, con la fuente recomendada (GOES-19 GeoColor, NASA GIBS):
- **Datos:** `assets/clouds/` con los 22 fotogramas JPEG reales (13:00 a 16:30 Z, 796 × 683 px, ≈ 2 MB) y `manifest.json` (rectángulo lat −36…−30, lon −59…−52, retardo de observación de 6 min, crédito). La procedencia exacta (URL de cada petición, hashes) está en `imports/source/clouds-gibs-geocolor-2026-10-11/manifest.json`. No se pide nada a GIBS en tiempo de ejecución.
- **Interfaz:** botón "Nubes" (`aria-pressed`) en la fila de cámara. **Apagado por defecto**: no se descarga nada hasta activarlo. Al activarlo se muestra un rótulo con la fuente y el intervalo de horas locales de los dos fotogramas reales vigentes.
- **Técnica:** cada fotograma es una imagen georreferenciada dibujada sobre el terreno (`SingleTileImageryProvider` con su rectángulo). Dos capas activas (fotograma real vigente y siguiente, opacidad base 0.7) con transparencia cruzada según `playback.absoluteMs`: es una transición **visual** entre dos observaciones reales, no una observación nueva. Se mantienen unas 5 capas (vigente ± 2) y se descartan las demás.
- **Pruebas:** al activar solo se piden el manifiesto y 4 fotogramas; reproducir a 64x mantiene ≤ 6 capas de imagen; al apagar se eliminan todas; sin errores de consola.
- **Limitaciones vigentes:** las del análisis (1 km, paralaje sin corregir, compuesto de color, fuera del rectángulo no hay capa). La capa tapa parcialmente la imaginería base mientras está activa.
- **Pendiente para una etapa posterior:** corrección de paralaje / lámina a la altura del tope de nubes (`ACHAF`), máscara de nubes para dibujar solo nubes, y atribución definitiva a confirmar con el proyecto.
