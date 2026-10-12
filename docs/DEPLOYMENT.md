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
- **GitHub Pages (despliegue vigente):** ver la sección siguiente.

### Despliegue en GitHub Pages con GitHub Actions (el real)

La aplicación pública está en **https://cx4dpg-hash.github.io/pichon-iv-3d/**. Se despliega con GitHub Actions (no con "Deploy from a branch"): en *Settings → Pages* la fuente (*Source*) es **GitHub Actions**. El flujo, definido en `.github/workflows/pages.yml` (versionado en el commit `15e3793` y verificado: build y deploy en éxito), es:

```
push a main (o ejecución manual: workflow_dispatch)
→ GitHub Pages / GitHub Actions
→ build de _site (solo index.html, css/, js/, data/ y assets/)
→ generación de _site/config.local.js desde el secreto CESIUM_ION_TOKEN
→ upload-pages-artifact
→ deploy-pages (environment github-pages)
→ aplicación pública funcionando
```

- **Secreto:** `CESIUM_ION_TOKEN` está guardado en *Settings → Secrets and variables → Actions* y funciona. Lo lee `.github/scripts/write-config.mjs` desde una variable de entorno, falla con "CESIUM_ION_TOKEN is not configured" si falta o está vacío, y nunca imprime el valor.
- **`config.local.js` solo existe dentro del artefacto de Pages**: se genera durante la ejecución del workflow, **no se versiona** (sigue en `.gitignore`) y no aparece en el historial de Git. El valor del token no está en ningún archivo del repositorio.
- **Resultado verificado:** la aplicación pública muestra "Satélite + relieve 3D" (Cesium World Imagery y World Terrain), es decir, Cesium Ion funciona en Pages.
- **Rutas:** todas son relativas, por lo que funciona bajo `/pichon-iv-3d/` sin cambios.

## E. Seguridad del token de Cesium Ion en producción

En un sitio estático el token es **visible para cualquiera que abra la página** (está en `config.local.js`, que el navegador descarga). Por eso:

1. En <https://cesium.com/ion/tokens> cree un token **exclusivo para este sitio**, solo con permisos de lectura de los recursos necesarios (Cesium World Imagery y Cesium World Terrain).
2. Use la opción **Allowed URLs** del token para restringirlo al sitio donde se publique, de modo que no funcione si alguien lo copia a otro dominio. **Restrinja al origen (dominio), no a una subruta:** en este proyecto la Allowed URL que funciona es **`https://cx4dpg-hash.github.io`**. Se observó que restringirla a la subruta `https://cx4dpg-hash.github.io/pichon-iv-3d/` provoca **HTTP 401** en Cesium Ion (la restricción se compara con el origen de la página), mientras que restringir al origen funciona correctamente. En un servidor propio use igualmente el origen (p. ej. `https://ejemplo.org`).
3. No reutilice el token personal de desarrollo en producción, y rótelo si sospecha que se filtró.
4. No suba nunca `config.local.js` a un repositorio público. En GitHub Pages se genera en CI desde el secreto `CESIUM_ION_TOKEN`; no hay que crearlo ni subirlo a mano.

## Comprobación rápida tras publicar

- La página carga y muestra "Transmisión 1 de 148" y los gráficos.
- El rótulo inferior dice "Satélite + relieve 3D" (token válido y restringido al origen correcto) o "Mapa básico · sin relieve" (sin token, token inválido o una Allowed URL que no coincide, que da HTTP 401).
- El botón ⓘ abre la ventana de fuentes y metodología, y "Nubes 3D" las muestra (se descarga `data/clouds/cloud-model.json` solo al activarlas).
