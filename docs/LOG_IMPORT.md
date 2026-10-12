# Importación local de logs de recepción ("Mi recepción")

Permite que un radioaficionado cargue su propio log y vea qué transmisiones de PICHÓN IV recibió. Implementado en `js/importer/` (parser, matcher, stats) y `js/reception.js` (interfaz y capa 3D).

## Procesamiento local y privacidad

- El archivo se lee con la File API (`file.text()`) y se procesa **completamente en el navegador**. No se envía a ningún servidor, no hay backend ni base de datos, y no se hace ninguna petición de red con su contenido. La interfaz lo indica: *"El archivo se procesa localmente en este navegador y no se envía a ningún servidor."*
- No se guarda nada: ni en `localStorage` ni en ningún otro almacenamiento. El resultado vive en memoria mientras la página está abierta; al recargar hay que volver a cargar el archivo.
- No se exporta ningún archivo.
- El contenido es **no confiable**: todo texto proveniente del archivo se inserta con `textContent` (nunca `innerHTML`), no se ejecuta nada y las líneas guardadas se truncan a 2000 caracteres. Máximo 50 MB; la importación cede el control al navegador cada pocos miles de líneas.
- Extensiones aceptadas: `.log`, `.txt`, `.csv`.

## Principio fundamental

`data/vuelo/transmissions.json` es la referencia. El log **nunca** crea ni modifica transmisiones maestras; solo puede coincidir con una existente (`flight`, `postFlight` o `preFlight`), quedar ambiguo o sin coincidencia.

## Formatos soportados (adaptadores)

| Adaptador | Formato | Estado de verificación |
|---|---|---|
| `direwolf-csv` | CSV decodificado de Dire Wolf (cabecera `chan,utime,isotime,source,heard,level,error,dti,name,symbol,latitude,longitude,speed,course,altitude,...,comment`) | **Probado con un log real** (`imports/source/cx4dpg-local-2026-10-11.log`, 140 paquetes) |
| `aprs-packet` | Paquete APRS en texto (`CX1AA-11>APE002,...:payload`) con cualquier texto antes o después en la línea; reconoce el prefijo de fecha/hora de APRS.fi, las advertencias `[...]` finales y paquetes entre comillas (CSV) | Probado solo con fixtures derivados del maestro (`tests/`); **no** verificado con logs reales de otros programas |

El formato se detecta por el contenido (la cabecera CSV de Dire Wolf; si no, se usa el adaptador de paquetes). Si un formato real no se reconoce, no se asume compatibilidad: hace falta un archivo de ejemplo para agregar un adaptador (ver `createAdapters` en `js/importer/adapters.js`).

Del archivo se conserva por línea: texto original, número de línea, marca de tiempo externa, paquete crudo (si el formato lo trae), path y IGate (`qAx,<igate>`), hora APRS interna (`hhmmss`, UTC), frame, lat, lon, altitud en pies, curso, velocidad cruda, telemetría y columnas adicionales reconocidas. Lo que el formato no trae queda en `null`.

Particularidades del CSV de Dire Wolf: **no contiene el paquete crudo ni la hora APRS interna** (`hhmmssh`); la altitud viene en metros (1 decimal) y se convierte a pies por redondeo (`round(m / 0.3048)`); el frame y la telemetría se leen de la columna `comment`. Solo se consideran las filas cuya columna `source` sea CX1AA-11.

## Marca de tiempo externa

Se conserva como texto (`externalTimestamp`) junto con `externalTimezoneKnown` (`true` solo si el archivo indica la zona: `Z`, `UTC` o un desplazamiento). **No se asume zona horaria y no se usa para decidir coincidencias** (los relojes de cada estación difieren del GPS del globo: en el log real la hora de recepción es unos segundos anterior a la hora APRS interna).

## Matching

Campos de identificación (los cinco del dataset): hora APRS (`hhmmss`), `frameNumber`, `lat`, `lon`, `altitudeGpsFt`. `frameNumber` **nunca** es clave única (se reinicia entre jornadas).

| Estado | Regla |
|---|---|
| `exact` | Los cinco campos están en el log, coinciden con **una única** transmisión y la telemetría del log (si la trae) no la contradice |
| `probable` | Falta algún campo (o la telemetría difiere), pero los restantes —al menos 3 coincidentes y ninguna discrepancia— identifican una única transmisión |
| `ambiguous` | Más de una transmisión posible, o evidencia insuficiente (menos de 3 campos, p. ej. solo el frame). **No se asigna a ninguna transmisión** |
| `unmatched` | Ninguna transmisión del maestro es compatible (un campo presente discrepa). Se muestra como "sin coincidencia" con una nota de la transmisión más parecida |

- Un campo presente que discrepa descarta a esa transmisión como candidata (p. ej. frame correcto con hora APRS distinta → `unmatched`).
- Si varias transmisiones son compatibles y el log trae la telemetría completa, solo se desempata si **una única** candidata tiene telemetría idéntica; si no, queda `ambiguous`.
- **Tolerancia de coordenadas: 1e-5° (~1 m)**, para absorber diferencias de representación decimal. La resolución de una posición APRS es 0.01′ ≈ 1.7e-4°, así que no puede unir dos posiciones APRS distintas.
- La altitud se compara por igualdad en pies (la conversión desde metros redondea al pie más cercano).
- `rawPacket` idéntico a una recepción conocida se anota como evidencia fuerte, pero **no se exige el mismo path APRS**: el mismo paquete RF puede haberse recibido directamente. Se separa el payload lógico (lo recibido por RF) del path (que cambia según el camino a APRS-IS).
- Con el log real de Dire Wolf (sin hora APRS) todas las coincidencias son `probable` y nunca `exact`: la hora APRS no puede verificarse. La telemetría idéntica aparece en las notas como evidencia adicional.

## Duplicados

Una transmisión puede aparecer varias veces en el log. Para las estadísticas, **una transmisión recibida varias veces cuenta una vez**. Se informa:
- líneas del archivo, líneas de CX1AA-11, ignoradas (otras estaciones, cabecera, texto ajeno) y vacías;
- duplicados del archivo = líneas de CX1AA-11 menos identidades únicas (la identidad de una línea es su transmisión coincidente o, si no hay, sus campos);
- en el panel de reproducción, `Recibida · N registros` cuenta las líneas que apuntan a esa transmisión.

Solo cuentan como recibidas las coincidencias `exact` y `probable`. Las transmisiones de `postFlight` y `preFlight` que coincidan se informan aparte y no cuentan en la cobertura del vuelo (155 transmisiones).

## Estadísticas

Transmisiones del vuelo (155), recibidas, cobertura %, primera y última recibidas, frame más alto, altitud GPS máxima recibida, líneas, duplicados y el número de líneas por estado. Con estación **fija** y coordenadas válidas: distancia **horizontal** máxima (haversine con radio medio 6371.0088 km, error ≈ 0.3 % respecto del elipsoide) a una transmisión recibida. No incluye la diferencia de altitud (no es distancia espacial 3D). No hay ranking de estaciones.

## Estación del usuario

Indicativo (se escribe a mano; no se detecta automáticamente), tipo (fija / móvil / desconocida) y, solo para fija y de forma opcional, latitud y longitud decimales. Las coordenadas no son necesarias para analizar el log. Si son válidas se muestra la estación y un enlace punteado hacia la carga mientras la transmisión vigente fue recibida. **Móvil**: no se pide ni inventa posición, no se dibujan líneas ni se calcula distancia (el GPX queda para una etapa posterior).

## Visualización

- "Mi recepción" (casilla): resalta con puntos magenta, sobre la trayectoria maestra (que no se oculta), las transmisiones recibidas.
- Panel de la transmisión vigente: `Mi estación: recibida`, `Recibida · N registros` o `no registrada` (con aviso si la transmisión es candidata de líneas ambiguas).
- Resultados: tabla plegable con línea, frame, hora APRS, estado, transmisión y notas (máximo 500 filas visibles).

## Recepción local ≠ firstIgate

`firstIgate` es la estación que primero llevó la transmisión a APRS-IS (dato del maestro). "Mi estación: recibida" significa solo que el log del usuario contiene esa trama. Una estación puede haber escuchado una trama sin ser el primer IGate e incluso sin haberla enviado a APRS-IS. En código y en la interfaz son conceptos independientes y no se influyen.

## Archivos de `imports/source/`

- `cx4dpg-local-2026-10-11.log`: log real de recepción local (Dire Wolf CSV), usado para validar el importador. `.gitignore` excluye `*.log`, por lo que no se versiona.
- `cx2acb-1-…pdf`, `cx2cq-1-…pdf`, `cx2tn-1-…pdf`, `cx4dpg-1-…pdf`: **no son logs de recepción del globo.** Se inspeccionaron: contienen únicamente balizas propias de cada estación (`!` + "Activo GloboGate", 21 a 113 balizas por estación, entre el 08/10 y el 11/10) y **ningún** paquete de CX1AA-11. Son fuente de posición/actividad (cada estación informa una única posición, igual a la de `stations.json`) y no se usan como recepción ni modifican `transmissions.json`.

## Limitaciones

- Solo hay dos adaptadores; el de paquetes de texto no se ha probado con logs reales de otros programas.
- Un log sin hora APRS interna no puede dar coincidencias `exact`.
- Un PDF/imagen no se puede importar (solo texto `.log`, `.txt`, `.csv`).
- Sin ranking, sin exportación, sin GPX ni soporte de estación móvil con posición.
- Sin persistencia entre sesiones.
