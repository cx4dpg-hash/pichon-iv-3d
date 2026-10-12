// Configuración local de PICHÓN IV 3D (plantilla versionada).
//
// Para activar imaginería satelital y relieve 3D (Cesium World Imagery / World Terrain):
//   1. Copie este archivo como config.local.js (está ignorado por Git y NO se versiona).
//   2. Pegue su token de Cesium Ion en cesiumIonToken.
//
// Sin token (o con un token inválido) la aplicación funciona igual con el mapa básico de
// OpenStreetMap y sin relieve. No escriba nunca un token real en este archivo de ejemplo.
//
// Nota: en un sitio estático el token es visible para quien abra la página; use un token de
// Cesium Ion restringido a su dominio y a los recursos necesarios.
window.PICHON_CONFIG = {
  cesiumIonToken: "",
};
