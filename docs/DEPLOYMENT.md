# Instalación y publicación

PICHÓN IV 3D es una aplicación **estática**: HTML, CSS, JavaScript con módulos ES y archivos JSON/imágenes. No necesita backend, Node, npm ni compilación. Todas las rutas internas son **relativas**, así que funciona desde la raíz de un dominio o desde un subdirectorio (por ejemplo `/RCU/pichon4/`). Se comprobó con un clon limpio servido desde `/RCU/pichon4/`.

Dependencias externas en tiempo de ejecución (necesitan Internet): CesiumJS 1.123.1 y Chart.js 4.4.1 desde el CDN de jsDelivr (versiones fijas) y, según el modo de mapa, los servicios de Cesium Ion u OpenStreetMap.

## A. Clonar

```
git clone https://github.com/cx4dpg-hash/pichon-iv-3d.git
cd pichon-iv-3d
```

## B. Configurar Cesium Ion (opcional, recomendado)

Con un token de Cesium Ion la aplicación usa **Cesium World Imagery** y **Cesium World Terrain** (imaginería satelital y relieve 3D). Sin token, o con un token inválido, funciona igual con el mapa básico de OpenStreetMap y sin relieve.

1. Cree una cuenta en <https://cesium.com/ion/> y genere un token de acceso propio.
2. Copie la plantilla:

   ```
   cp config.example.js config.local.js       # Linux/macOS
   copy config.example.js config.local.js     # Windows
   ```
3. Edite `config.local.js` y coloque el token:

   ```js
   window.PICHON_CONFIG = {
     cesiumIonToken: "SU_TOKEN_AQUÍ",
   };
   ```

`config.local.js` está en `.gitignore` y **nunca debe versionarse**; el repositorio solo contiene `config.example.js`, sin token. El token no está en ningún archivo ni commit del repositorio.

Nota: `index.html` siempre pide `config.local.js`. Si el archivo no existe el servidor responde 404 (verá un error de recurso no encontrado en la consola del navegador) y la aplicación continúa con el mapa básico; es el comportamiento esperado sin token. Si prefiere evitar ese 404, cree un `config.local.js` con `cesiumIonToken: ""`.

## C. Ejecutar localmente

```
python -m http.server 8000
```

y abrir <http://127.0.0.1:8000/>. No funciona abriendo `index.html` con `file://` (módulos ES y `fetch`). Cualquier otro servidor estático sirve (`npx serve`, Live Server de VS Code, etc.).

## D. Publicación

Copie el contenido del repositorio (como mínimo `index.html`, `css/`, `js/`, `data/`, `assets/` y, si usa Cesium Ion, su `config.local.js`) al directorio público del servidor. `docs/`, `tests/`, `tools/`, `imports/` y `CLAUDE.md` no son necesarios para ejecutar la aplicación (`imports/source/` contiene los archivos fuente archivados, citados en la ventana de fuentes, y es voluminoso).

- **Apache / Nginx / hosting estático:** basta servir la carpeta como archivos estáticos. Asegúrese de que se sirvan `.js` como `text/javascript` (módulos ES) y `.json` como `application/json`, que es lo habitual.
- **Subdirectorio de un sitio** (p. ej. `https://ejemplo.org/RCU/pichon4/`): copiar la carpeta allí; no hay que cambiar ninguna ruta.
- **GitHub Pages:** compatible, porque todas las rutas son relativas (sirve desde `https://<usuario>.github.io/<repositorio>/`). Como `config.local.js` no se versiona, en Pages la aplicación funciona con el mapa básico; para tener terreno e imagery habría que publicar el token en el propio sitio (ver el aviso siguiente).

## E. Seguridad del token de Cesium Ion en producción

En un sitio estático el token es **visible para cualquiera que abra la página** (está en `config.local.js`, que el navegador descarga). Por eso:

1. En <https://cesium.com/ion/tokens> cree un token **exclusivo para este sitio**, solo con permisos de lectura de los recursos necesarios (Cesium World Imagery y Cesium World Terrain).
2. Use la opción **Allowed URLs** del token para **restringirlo a la URL final** donde se publique (dominio y, si corresponde, subdirectorio; por ejemplo `https://ejemplo.org/RCU/pichon4/`). Con eso el token no funciona si alguien lo copia a otro sitio.
3. No reutilice el token personal de desarrollo en producción, y rótelo si sospecha que se filtró.
4. No suba nunca `config.local.js` a un repositorio público.

## Comprobación rápida tras publicar

- La página carga y muestra "Transmisión 1 de 148" y los gráficos.
- El rótulo inferior dice "Satélite + relieve 3D" (con token válido) o "Mapa básico · sin relieve".
- El botón ⓘ abre la ventana de fuentes y metodología, y "Nubes 3D" las muestra (se descarga `data/clouds/cloud-model.json` solo al activarlas).
