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
- Con relieve activo se activa la prueba de profundidad contra el terreno (`depthTestAgainstTerrain`), de modo que el terreno puede ocultar partes de la trayectoria que pasen bajo él.
- **Geoide vs. elipsoide**: la altitud APRS suele ser sobre el nivel medio del mar (geoide) y Cesium usa altura elipsoidal; en Uruguay la diferencia es de unas decenas de metros y **no se corrige**. Esto es relevante a baja altitud (frame 3: 121 m).
- **Informe de baja altitud**: con relieve activo, `js/terrain.js` consulta en tiempo de ejecución la altura del terreno bajo las 155 posiciones y calcula la separación `altitudeGpsM − terreno`. Informa (en el tooltip del indicador y con un mensaje informativo en la consola) la separación mínima y los frames en que la carga quedaría bajo el terreno. **No corrige nada en silencio**: una inconsistencia visible debe reportarse y decidirse aparte. Estos valores no se guardan.

## Estaciones

Con relieve activo se consulta en tiempo de ejecución la altura del terreno de las cuatro estaciones fijas (y de la estación fija del usuario en "Mi recepción", si ingresó coordenadas) y se dibujan sobre ese terreno. **Es solo representación**: no se guarda en `stations.json` (`terrainHeightM` sigue en `null`) ni se presenta como medición de la estación. Sin relieve, las estaciones se dibujan a altura 0 del elipsoide (comportamiento anterior). CX3BP-8 (móvil, posición desconocida) no se dibuja.

## Cámara

- Con relieve se mantiene activa la detección de colisión de la cámara de Cesium (`enableCollisionDetection`) para la navegación manual, que sigue siendo la normal de Cesium.
- "Seguir globo" coloca la cámara ≈ 90 m de la carga, por encima de ella, y "Vista general" encuadra toda la trayectoria. En modo seguimiento la cámara no se corrige contra el terreno.

## Estado de las pruebas

Probado **sin token** (mapa básico, aplicación completa) y con un **token inválido ficticio** (activación de Ion falla y se conserva el modo básico sin exponer el token). **No se probó con un token real**: no se dispone de uno y no se inventó. Pendientes de verificar con token real: imaginería satelital, terreno, alturas de estaciones, informe de baja altitud (frame 3), vista general y seguimiento sobre relieve.

## Limitaciones

- Teselas de OpenStreetMap: pensadas para uso moderado.
- Geoide/elipsoide sin corregir.
- Sin token no hay relieve ni imaginería satelital.
