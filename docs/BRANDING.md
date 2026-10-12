# Identidad visual y brújula (etapa 9)

## Logos

Los recursos finales están en `assets/branding/` (se cargan con rutas relativas, sin imágenes embebidas en base64). Los archivos fuente de `imports/source/` no se modifican.

### Radio Club Uruguayo — `assets/branding/rcu-logo.png`

- **Fuente:** `imports/source/logo-rcu.jpg` (JPEG de 800 × 600 px, logo circular sobre un fondo azul liso).
- **Preparación:** el fondo liso exterior se quitó (relleno desde las esquinas) con recuperación del antialias del borde, se recortó el círculo, se centró en un lienzo cuadrado y se redujo a **320 × 320 px** (PNG con transparencia, ≈ 105 KB). No se rediseñó nada: el diseño es el del archivo original.
- **Nota:** el JPEG de origen ya tiene el círculo ligeramente ovalado (≈ 554 × 561 px); se conserva tal cual para no remuestrear ni alterar el dibujo.

### Pichón IV — `assets/branding/pichon-iv-logo.png`

- **Fuente:** `imports/source/Boletin CX 918.pdf` (Boletín CX Nº 918, 12 de setiembre de 2026, 21 páginas).
- **Dónde está:** la identidad gráfica asociada a Pichón IV es la **cabeza de ave rapaz** (arte lineal negro) que aparece en dos lugares del boletín:
  - **Página 3** (y repetida en la 4), en la sección "Herramientas para la decodificación de Pichón IV 'CX1AA-11'": una imagen incrustada de 199 × 98 px (PNG) con el escudo del RCU, la cabeza de ave y el texto "Radio Club Uruguayo".
  - **Página 1** (portada), en el afiche "Charla y jornada práctica: Pichón IV – Seguimiento y recepción": la misma cabeza de ave a la izquierda del título, con el escudo del RCU a la derecha (imagen JPEG de 760 × 424 px).
- **Preparación:** se recortó, sin escalar, la cabeza de ave de la imagen de la página 3 (la de mayor nitidez), se pasó el fondo blanco a transparencia (el negro del trazo se conserva; el alfa sale de la luminancia) y se eliminaron fragmentos sueltos de las letras vecinas. **98 × 70 px** (PNG con transparencia, ≈ 3 KB). No se redibujó ni se reinterpretó.
- **Limitaciones (a confirmar):**
  - El boletín **no rotula explícitamente** la cabeza de ave como "logo de Pichón IV"; se la identifica así por su uso junto al título "Pichón IV" en el afiche de la portada. Conviene que el proyecto confirme que es la identidad oficial.
  - La resolución es la que existe en el boletín (98 × 70 px); no hay una versión vectorial ni de mayor tamaño en el PDF. Se muestra a 28 px de alto (56 px en pantallas de alta densidad).
  - Es arte lineal negro: sobre el panel oscuro se presenta sobre una pastilla clara para que se vea; el dibujo no se recoloreó.

## Ubicación en la interfaz

- Encabezado del panel de información (parte superior izquierda del visor): `[escudo RCU] PICHÓN IV — CX1AA-11 / Radio Club Uruguayo · Proyecto Pichón IV [cabeza de ave]`. Consume ≈ 14 px de alto más que el título anterior y no agrega ninguna cabecera fuera del panel, para que el mapa siga siendo el protagonista.
- Créditos: la línea "Radio Club Uruguayo · Proyecto Pichón IV" bajo el título. No se agrega ningún copyright. No se retiran los créditos obligatorios de Cesium, de la imaginería ni de OpenStreetMap.
- Responsive (≤ 600 px): los logos se reducen (26 px y 20 px de alto) y se oculta antes el texto secundario ("Radio Club Uruguayo · Proyecto Pichón IV") que deformar los logos. Los logos mantienen su relación de aspecto (`object-fit: contain`, anchos y altos coherentes con las proporciones naturales).
- Accesibilidad: `alt="Radio Club Uruguayo"` y `alt="Pichón IV"`.

## Brújula de la cámara

Control propio (`js/compass.js`, SVG sin dependencias) en la esquina inferior derecha del visor, pequeño y semitransparente. El panel "Mi recepción" deja libre esa esquina.

- **Indicación:** la aguja y la "N" rotan con `viewer.camera.heading` (orientación de la **cámara**, no de la trayectoria del globo): el Norte queda a −heading respecto de "arriba" de la pantalla. Se actualiza en cada fotograma (solo si cambia) en Vista general y en Seguir globo. El tooltip muestra el heading en grados.
- **Inclinación:** indicador discreto "Incl. N°" (0° = vista cenital, `pitch` −90°; 90° = horizonte).
- **Norte arriba:** clic (o Enter / Espacio con el foco) fija `heading = 0` con una rotación breve (≈ 0.45 s), conservando la inclinación, la distancia al punto observado y, aproximadamente, la posición. No es un `flyTo` a la vista general.
  - **Vista general / cámara libre:** se rota la cámara alrededor del punto del terreno o globo que hay en el centro de la pantalla (`globe.pick`, con terreno si está activo). En las pruebas: heading final ≈ 0 (< 0.5°), pitch conservado (±0.01°) y distancia al punto observado conservada con un cambio de ≈ 2 % (efecto de medir pitch y heading en el punto observado y no en la cámara sobre un globo curvo). Si la cámara no mira al globo (cielo), solo gira sobre sí misma.
  - **Seguir globo:** se rota la cámara dentro del marco local (ENU) de la carga, que es el que usa Cesium para el seguimiento; el seguimiento **no se cancela**, la distancia no cambia y el pitch se conserva exactamente. También funciona con la reproducción en marcha.
  - Si el usuario toma el control (arrastre o rueda) durante la animación, esta se cancela.
- **Limitación de Cesium en seguimiento:** con una entidad seguida, Cesium desactiva por sí mismo la inclinación con el botón central; ahí se inclina con el arrastre izquierdo vertical (ver `docs/MAPPING.md`). La brújula refleja correctamente cualquier cambio de orientación hecho con los controles estándar.

## Escudo del RCU en el encabezado (implementado en la etapa 10)

**Estado:** el encabezado usa ahora `assets/branding/rcu-shield.png`: el escudo/monograma del RCU extraído del Boletín CX 918 (PNG de 145 × 181 px con transparencia real, píxeles originales, sin modificar), mostrado a **44 px de alto** (≈ 35 px de ancho; 32 px en pantallas de ≤ 600 px), con la proporción 145:181 conservada. El logo de Pichón IV no cambió. El sello circular anterior (`rcu-logo.png`) se conserva en `assets/branding/` sin uso. El panel crece unos 8 px de alto en el encabezado.

### Análisis previo (se mantiene como justificación)

**Estado actual.** El encabezado usa `assets/branding/rcu-logo.png` (320 × 320 px), derivado del sello circular completo de `imports/source/logo-rcu.jpg`. A 36 px de alto el escudo central mide ≈ 20 × 25 px y el monograma "RCU" no se lee.

**Versión mejor del escudo.** Existe en el Boletín CX 918: la imagen incrustada que se repite en el encabezado de todas las páginas (por ejemplo, portada en x 167–237, y 45–132 pt) es el escudo del RCU como **PNG de 145 × 181 px con máscara de transparencia real** (objetos 32 y 33 del PDF). Trazo azul limpio, sin fondo ni artefactos de JPEG, y al ser transparente se ve bien sobre el panel oscuro. Alternativa: recortar el escudo del JPEG (≈ 177 × 221 px útiles), pero obliga a quitar fondo blanco y arrastra ruido de JPEG.

**Opciones evaluadas**
1. Recortar el escudo del recurso actual (320 px): descartada, solo quedarían ≈ 100 × 125 px ya remuestreados.
2. Recortar del JPEG original: viable, peor calidad (ruido JPEG, hay que recortar el fondo del disco).
3. **Usar el PNG con transparencia del boletín, sin tocarlo (recomendada):** es el recurso más limpio y ya es "variante nueva limpia en PNG transparente" sin reprocesar.

El candidato está en `assets/branding/candidates/rcu-shield-bulletin.png` (píxeles originales del boletín, sin modificar). **No** está conectado a la aplicación.

**Ubicación y tamaño propuestos.** Mismo sitio que ahora (izquierda del encabezado del panel), mostrando el escudo a **44–48 px de alto (≈ 35–38 px de ancho)**, con `object-fit: contain` y proporción 145:181. La fila del encabezado pasa de 36 a ≈ 44–48 px de alto (≈ +8–12 px en el panel). El logo de Pichón IV se mantiene igual (28 px de alto sobre su pastilla clara). En ≤ 600 px bajar el escudo a ≈ 32 px. En pruebas de maqueta (no versionadas) a 44 px el monograma se lee con claridad y a 52 px domina demasiado frente al logo de Pichón IV: **44–46 px es el equilibrio recomendado**. Se mantendría el `alt="Radio Club Uruguayo"`.

**Limitación.** Es la resolución disponible (145 × 181 px): 44 px equivale a ≈ 3 × en pantallas de alta densidad. No hay versión vectorial en las fuentes.
