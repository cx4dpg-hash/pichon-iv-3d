# Cartografía: mapa básico y satélite + relieve 3D

La aplicación funciona **siempre**, con o sin token de Cesium Ion.

## Modos

| Modo | Condición | Imaginería | Terreno | Indicador |
|---|---|---|---|---|
| Básico (por defecto) | sin token, token vacío/inválido o sin conexión a Ion | OpenStreetMap | elipsoide (sin relieve) | "Mapa básico · sin relieve" |
| Satélite + relieve | token válido de Cesium Ion | Cesium World Imagery | Cesium World Terrain | "Satélite + relieve 3D" |

El indicador discreto está en la parte inferior central del visor. Si la activación de Ion falla (token inválido, sin red), se registra solo un mensaje informativo genérico en la consola y se conserva el modo básico.

## Configuración del token (Cesium Ion)

1. Copie `config.example.js` como `config.local.js` (en la raíz del proyecto).
2. Escriba su token en `cesiumIonToken`.

```js
window.PICHON_CONFIG = { cesiumIonToken: "SU_TOKEN" };
```

- `config.local.js` está en `.gitignore` y **no se versiona**; `config.example.js` (con el token vacío) sí.
- El token no se imprime en la consola, no se muestra en la interfaz y no hay backend. En un sitio estático publicado el token es visible para quien abra la página: use un token de Cesium Ion restringido a su dominio y a los recursos necesarios (World Imagery y World Terrain).
- `index.html` carga `config.local.js` con una etiqueta `<script>`. Si el archivo no existe en el servidor, el navegador registra un único 404 en la consola; la aplicación funciona igual en modo básico. Para evitarlo, mantenga un `config.local.js` (aunque tenga el token vacío) junto a `index.html`.
- Se necesita conexión a Internet (Cesium Ion, jsDelivr y las teselas).

## Altitudes: el relieve no modifica los datos

- `altitudeGpsM` sigue siendo el dato GPS de la **carga útil** y se usa tal cual como altura sobre el elipsoide. El relieve **no** modifica `lat`, `lon`, `altitudeGpsM` ni la trayectoria, y el vuelo no se "pega" al terreno.
- `depthTestAgainstTerrain` se deja en su valor por defecto (`false`): el terreno no oculta la trayectoria ni la carga aunque a baja altitud la altitud GPS quede por debajo del relieve.
- **Geoide vs. elipsoide**: la altitud APRS suele ser sobre el nivel medio del mar (geoide) y Cesium usa altura elipsoidal; en Uruguay la diferencia es de unas decenas de metros y **no se corrige**. Esto es relevante a baja altitud (frame 3: 121 m).
- **Arranque sobre el terreno (corrección visual, solo render).** Con terreno real, en los frames 3 a 10 (carga en tierra antes del ascenso; desde que la reproducción empieza en la liberación, solo el frame 10 forma parte del vuelo mostrado) la altitud GPS bruta queda por debajo del terreno: GPS ≈ 118–121 m frente a un terreno de ≈ 127–128 m (separación mínima −9 m en el frame 9). La carga se dibujaba enterrada. Causas posibles, que no se pueden separar con los datos disponibles: (1) la altitud APRS/GPS es sobre el nivel medio del mar (geoide) y Cesium usa altura elipsoidal; la diferencia en Uruguay es de unos metros a una decena y CesiumJS no trae un modelo de geoide; (2) el error vertical propio del GPS (típicamente ±10–15 m); (3) el detalle del mallado del terreno. No es un problema de cómo se renderiza la carga (se dibuja exactamente en la altura que recibe).
  - **Criterio** (`js/floor.js`): altura mostrada = `max(altitud bruta, terreno + 1.0 m)`, con el terreno consultado en tiempo de ejecución bajo cada transmisión. Es continua (sin saltos).
  - **Cuándo se activa:** solo con relieve activo y solo si la altitud bruta queda bajo `terreno + 1 m`. En los datos actuales afectaría a los frames 3 a 10, pero la reproducción parte del frame 10 (liberación): **solo el frame 10** (+9.7 m) entra en el vuelo mostrado, los frames 3 a 9 (`preLaunch`) no se reproducen; desde el frame 11 (ascenso) la corrección es exactamente 0.
  - **Cuánto corrige:** entre 3.9 y 10.0 m (máximo 9.96 m en el frame 9); la carga queda a 1.0 m sobre el terreno.
  - **Qué no cambia:** `altitudeGpsM` y todo el dataset, el panel (muestra la altitud GPS bruta) y los gráficos. El panel agrega la fila "Corrección visual" (`+8.1 m (solo render)` o `ninguna`). Sin relieve no hay corrección.
  - Se aplica en un único lugar (altitudes de render de `positionAtTime`): la carga, la línea amarilla, los marcadores de inicio/fin/máximo y los puntos de "Mi recepción" usan la misma altura, por lo que la carga sigue sobre la línea. La geometría de la línea se vuelve a muestrear al activarse.
- **Informe de baja altitud**: con relieve activo, `js/terrain.js` consulta en tiempo de ejecución la altura del terreno bajo las 155 posiciones y calcula la separación `altitudeGpsM − terreno`. Informa (en el tooltip del indicador y con un mensaje informativo en la consola) la separación mínima y los frames en que la carga quedaría bajo el terreno. **No corrige nada en silencio**: una inconsistencia visible debe reportarse y decidirse aparte. Estos valores no se guardan.

## Estaciones

Con relieve activo se consulta en tiempo de ejecución la altura del terreno de las cuatro estaciones fijas (y de la estación fija del usuario en "Mi recepción", si ingresó coordenadas) y se dibujan sobre ese terreno. **Es solo representación**: no se guarda en `stations.json` (`terrainHeightM` sigue en `null`) ni se presenta como medición de la estación. Sin relieve, las estaciones se dibujan a altura 0 del elipsoide (comportamiento anterior). CX3BP-8 (móvil, posición desconocida) no se dibuja.

## Cámara y controles del mouse

**Controles por defecto de Cesium.** El proyecto no define ningún esquema propio: `viewer.scene.screenSpaceCameraController` conserva todos sus valores por defecto, con y sin terreno (verificado leyendo la configuración en ambos modos): `enableCollisionDetection = true`, `minimumZoomDistance = 1`, `maximumZoomDistance = Infinity`, `enableZoom/Tilt/Rotate/Translate/Look = true`, rueda / pinch / botón derecho para zoom, botón izquierdo para rotar/desplazar y botón central (o Ctrl + arrastre) para inclinar.

**Qué alteraba la interacción.** No se encontró ninguna modificación del controlador de cámara. Lo que sí cambió al activar terreno y la escala visual, y se corrigió:
- **Escala visual compensada por distancia** (etapa 7.1): el conjunto 3D mantenía un tamaño angular mínimo en todo el rango de zoom, de modo que al acercar o alejar el objeto no reaccionaba como la escena (el zoom "no se sentía natural") y la carga podía parecer mayor que el globo. Ahora solo hay ayuda gradual a distancia (ver `docs/PHYSICS.md`).
- **`depthTestAgainstTerrain = true`** (activado junto con el terreno): con altitudes GPS por debajo del terreno (frames 3 a 10, hasta −9 m) la carga quedaba oculta bajo el relieve. Se volvió al valor por defecto de Cesium (`false`): la carga siempre se dibuja, sin "pegarla" al suelo (el ground-clamp visual sigue pendiente).
- **Asignación explícita de `enableCollisionDetection = true`**: era el valor por defecto, así que no cambiaba nada; se eliminó para no tocar el controlador. La detección de colisión con el terreno sigue activa por defecto (evita atravesar el relieve en la navegación manual) y no impide el zoom: en pruebas, la rueda reduce la altura aproximadamente a la mitad por paso, igual con y sin terreno.
- **Distancia inicial de "Seguir globo"** (90 m): con el conjunto ahora a tamaño físico quedaba muy lejos; ahora se coloca a ≈ 35 m.

**Seguir globo.** Usa el seguimiento nativo de Cesium (`viewer.trackedEntity` sobre la carga), sin ningún `lookAt`, `setView` ni `flyTo` propio por fotograma. Al activarlo se coloca la cámara inicialmente (≈ 35 m); después el seguimiento conserva la distancia y la orientación relativas que haya dejado el usuario (zoom con rueda o botón derecho, rotación con arrastre izquierdo) mientras la reproducción mueve el objetivo. "Vista general" encuadra toda la trayectoria y suelta el seguimiento.

**Limitación de Cesium en seguimiento:** con una entidad seguida, Cesium desactiva por sí mismo la inclinación con el botón central; en ese modo la inclinación se hace con el arrastre izquierdo vertical. En Vista general el botón central inclina con normalidad.

## Estado de las pruebas

Probado **sin token** (mapa básico, aplicación completa), con un **token inválido ficticio** (la activación de Ion falla y se conserva el modo básico sin exponer el token) y, desde que `config.local.js` contiene un token válido, con **imaginería satelital + relieve 3D reales**: indicador "Satélite + relieve 3D", alturas de las estaciones sobre el terreno, informe de baja altitud (frames 3 a 10 bajo el terreno), Vista general y Seguir globo, con zoom con rueda y arrastres izquierdo, derecho y central. La sensación subjetiva de la navegación solo puede juzgarla una persona: lo comprobado automáticamente es que la configuración del controlador es la de Cesium por defecto y que cada gesto produce el cambio de cámara esperado.

## Limitaciones

- Teselas de OpenStreetMap: pensadas para uso moderado.
- Geoide/elipsoide sin corregir.
- Sin token no hay relieve ni imaginería satelital.
