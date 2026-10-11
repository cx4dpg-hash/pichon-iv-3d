# PICHÓN IV 3D

Aplicación web interactiva que reconstruirá en 3D el vuelo real del globo estratosférico **PICHÓN IV** (indicativo APRS **CX1AA-11**), lanzado el 11 de octubre de 2026 en Uruguay.

## Objetivo general

Mostrar posición, altitud, trayectoria, telemetría sincronizada y enlaces del globo con las estaciones terrenas que reportaron cada trama a APRS-IS, con reproducción temporal interactiva. A futuro, permitirá que un radioaficionado cargue su propio log local y vea resaltadas las tramas que recibió.

## Estado

**En desarrollo.** Actualmente solo existe la fundación técnica del proyecto (estructura de carpetas y una página mínima). Ninguna función final está implementada todavía.

## Publicación

El proyecto es un sitio web **estático** (HTML, CSS y JavaScript con módulos ES; visualización prevista con CesiumJS), sin backend, publicable en un hosting convencional (por ejemplo `/RCU/pichon4/`). Debe usar únicamente rutas relativas.

Nota: al usar módulos ES, para probarlo localmente hay que servirlo por HTTP (no abrir el archivo con `file://`).

## Documentación

- [CLAUDE.md](CLAUDE.md): reglas de trabajo del desarrollo técnico.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): arquitectura preliminar.
