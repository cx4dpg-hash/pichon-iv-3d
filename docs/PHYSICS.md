# Modelo físico aproximado del globo

Todo lo descrito aquí es una **estimación visual/física**, no una medición. El valor calculado
(`estimatedBalloonDiameterM`) se obtiene en tiempo de ejecución y **no se escribe** en el dataset.

## La posición GPS es la de la carga útil

La posición APRS/GPS (`lat`, `lon`, `altitudeGpsM`) corresponde a la electrónica situada en la **carga útil**. Por lo tanto la trayectoria dibujada es la de la carga, y:

- la carga útil se dibuja **centrada exactamente** en la posición GPS (interpolada visualmente entre transmisiones);
- el globo se dibuja **por encima** de la carga, solo mientras exista (fase de ascenso);
- la antena se dibuja debajo de la carga;
- la línea estación → globo (primer IGate) termina en la posición GPS, es decir, en la carga, porque es la posición transmitida.

Los datos originales no se modifican.

## Fórmula (solo durante el ascenso)

Gas ideal, con P = presión absoluta (hPa) y T = temperatura absoluta (K):

```
V2 = V1 * (T2 / T1) * (P1 / P2)
D2 = D1 * (V2 / V1)^(1/3)        (el globo se aproxima a una esfera)
```

Implementada en `js/physics.js` (`estimateDiameter`, `buildDiameterModel`). Se considera válida **solo mientras el globo está en fase ascendente y conceptualmente intacto**. Después de la transición ascenso → descenso el modelo **deja de calcular diámetro**.

## Entradas

- Solo `pressureHpa` y `externalTemperatureC` de cada transmisión de `flight`; `T(K) = °C + 273.15`.
- **No** se usa `altitudeGpsM` ni `barometricAltitudeM` para calcular el tamaño.
- `D1 = 1.5 m` (`visualEstimates.initialBalloonDiameterM`, incertidumbre ±0.2 m, estimación visual de confianza media), leído de `data/vuelo/flight.json`.
- Condición de referencia (P1, T1): la **primera transmisión válida del vuelo** (presión > 0 y T(K) > 0). No se asume 1013.25 hPa.

## Referencia inicial utilizada

Frame 3 (2026-10-11 13:14:41Z = 10:14:41 hora local): P1 = 1008 hPa, T1 = 18 °C = 291.15 K, D1 = 1.5 m.

Es una aproximación: 1.5 m corresponde visualmente al momento próximo al lanzamiento, pero el frame 3 es la primera trama con GPS válido y precede en varios minutos al inicio real del ascenso (la altitud GPS empieza a aumentar hacia el frame 11, ~10:22 local). Entre los frames 3 y 10 la presión es constante (1008 hPa), por lo que el diámetro estimado casi no varía.

## Fases y transición estimada de ruptura/descenso

- **Máximo**: la transmisión de máxima altitud GPS se determina **dinámicamente** desde `flight` (`data.maxIndex`); no se asume ningún frame. En los datos actuales es el frame 138 (25542.54 m).
- **Ascenso**: hasta la transmisión de máximo (inclusive). Se calcula el diámetro estimado y se dibuja el globo.
- **Transición estimada de ruptura/descenso** (*estimated burst transition*, `estimatedBurstTransition`): se define entre la transmisión de máxima altitud y la siguiente (frames 138 → 139: −1689.5 m en 60 s). Se **infiere** de la transición desde la máxima altitud hacia un descenso rápido. **No se conoce el instante exacto de ruptura** ni se afirma que el globo "explotó".
- **Descenso**: desde la primera transmisión posterior al máximo (frame 139) no se calcula diámetro (`null`, estado `not_applicable`), el panel muestra "Diámetro estimado: —" y "Estado del globo: fase de descenso; modelo de expansión no aplicable", y no se dibuja la esfera ni la línea de suspensión (no hay globo al que unirla). Se siguen mostrando carga útil, antena, trayectoria, reproducción y primer IGate. Entre las transmisiones 138 y 139 la esfera se mantiene en el tamaño del máximo.
- No se representan explosión, fragmentos, paracaídas ni restos de látex.

## Validación y fallback (durante el ascenso)

- Muestra válida: `pressureHpa` finito y > 0, `externalTemperatureC` finito con T(K) > 0.
- Si una transmisión del ascenso no es válida (o el resultado no es finito/positivo) no se calcula un diámetro nuevo: se usa como **fallback solo visual** el último diámetro válido (o D1 si aún no hubo ninguno) y la entrada queda marcada `fallback` (o `initial` si es anterior a la referencia). El panel lo indica entre paréntesis.
- En los datos actuales no se aplica ningún fallback (0 de 136 transmisiones de ascenso) y no hay presiones ≤ 0 ni resultados no finitos.

## Resultado con los datos reales (estimado)

| | Valor |
|---|---|
| Diámetro inicial (frame 3) | 1.5 m |
| Diámetro máximo estimado | 4.9 m (4.94 m), ~3.3 veces el inicial |
| Frame / hora del máximo | frame 138, 15:59:46Z = 12:59:46 local |
| Presión / temp. externa en el máximo | 26 hPa / −5 °C |

La incertidumbre de D1 (±0.2 m, ~13 %) se propaga proporcionalmente a todas las estimaciones (≈ ±0.7 m en el máximo), sin contar las limitaciones del modelo de abajo. Por eso la interfaz muestra una sola cifra decimal.

## Tamaño físico vs. ayuda de visibilidad (sin ×20 fijo)

- `estimatedBalloonDiameterM` es el valor físico y es el que se muestra en el panel ("Diámetro estimado"). No lo modifica ninguna escala visual. Se interpola linealmente solo para el dibujo, entre transmisiones consecutivas del ascenso.
- **Ya no existe un factor de exageración fijo (el antiguo ×20).** Cada elemento se dibuja con su tamaño físico multiplicado por una **escala visual que depende de la distancia de la cámara** y vale 1 cuando se está cerca. Las primitivas 3D usadas (elipsoide, caja, cilindro) no admiten `scaleByDistance` (eso es solo para puntos, etiquetas y billboards), así que `js/balloon.js` recalcula las dimensiones en cada fotograma:

```
escala(L, θ) = clamp( min(d, dMax) · θ / L , 1 , escalaMax )
```

  - `d`: distancia cámara → carga útil (m).
  - `L`: tamaño físico del elemento: diámetro estimado del globo, o 0.45 m (mayor dimensión) de la carga.
  - `θ`: tamaño angular mínimo en pantalla: 0.015 rad para el globo (≈ 0.86°) y 0.02 rad para la carga (≈ 1.15°).
  - `dMax = 2500 m`: más allá la ayuda deja de crecer y aparece el marcador puntual del indicativo (`distanceDisplayCondition`).
  - `escalaMax`: 30 para el globo y 40 para la carga.

  Interpretación: si `d·θ ≤ L` el elemento se ve con su **tamaño físico** (escala 1); si no, se agranda lo justo para no bajar del tamaño angular mínimo. Ejemplos con el globo de 4.94 m (frame 138): a ≤ 330 m escala 1; a 1000 m escala ≈ 3. Con la carga (0.45 m): escala 1 solo a ≤ 22 m; a 90 m ≈ 4.
- La ayuda es solo de renderizado: **no modifica posición, altitud ni trayectoria**. La ayuda de visibilidad de la carga no es su tamaño físico (0.45 × 0.25 × 0.18 m, estimación visual de confianza baja).

## Suspensión y antena: sin longitudes físicas conocidas

No se conocen las longitudes de la línea de suspensión ni de la antena (`suspensionLengthM` y `antennaLengthM` son `null` en `flight.json`). Las separaciones que se ven en pantalla son parámetros **solo de renderizado**, definidos en `js/balloon.js` y calculados a partir de la distancia de la cámara (ángulo aproximadamente constante):

- `visualSuspensionOffset(d) = clamp(0.035·d, 3, 40)` m de escena entre el borde superior de la carga y el cuello del globo;
- `visualAntennaOffset(d) = clamp(0.015·d, 1.5, 18)` m de escena hacia abajo desde la base de la carga.

*Visual-only rendering offset. Not a measured physical length.* No son datos de la misión, no se guardan en los datos y nunca se muestran al usuario como longitudes reales.

## Elementos dibujados (aproximados)

- **Globo**: elipsoide de revolución blanco/crema, translúcido (82 % opaco), algo alargado (alto = 1.12 × ancho) y con el **mismo volumen que la esfera del diámetro estimado**, más un pequeño cuello inferior (cilindro). Es una forma estilizada: no simula deformación real.
- **Carga útil**: caja blanca/crema (aspecto de poliestireno) con borde oscuro, 0.45 × 0.25 × 0.18 m × la ayuda de visibilidad, centrada en la posición GPS.
- **Antena**: línea verde fina que cuelga de la carga útil (no representa tirantes estructurales).
- **Línea de suspensión**: gris, entre la carga y el cuello del globo; solo durante el ascenso.
- Con la cámara a más de 2500 m se muestra además el marcador puntual con el indicativo, porque el conjunto 3D ya no se distingue; de cerca no compite con el modelo.
- La cámara "Seguir globo" se coloca a ≈ 90 m de la carga (offset ENU −35, −70, +45 m) y sigue siendo manipulable con los controles normales de Cesium.

## Limitaciones

- No simula la elasticidad del látex, la presión interna ni el límite de estiramiento.
- No predice la ruptura real; la "transición estimada" es una inferencia del perfil de vuelo, no un hecho medido.
- No modela cantidad de gas variable ni fugas (asume masa de gas constante).
- Supone que la temperatura del gas es la temperatura externa medida y que la presión interna es igual a la externa.
- No simula viento, inclinación, balanceo ni dinámica del cordón: el conjunto se mantiene vertical.
- No debe considerarse una medición.
