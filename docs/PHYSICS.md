# Modelo físico aproximado del globo

Todo lo descrito aquí es una **estimación visual/física**, no una medición. El valor calculado
(`estimatedBalloonDiameterM`) se obtiene en tiempo de ejecución y **no se escribe** en el dataset.

## La posición GPS es la de la carga útil

La posición APRS/GPS (`lat`, `lon`, `altitudeGpsM`) corresponde a la electrónica situada en la **carga útil**. Por lo tanto la trayectoria dibujada es la de la carga, y:

- la carga útil se dibuja **centrada exactamente** en la posición GPS (interpolada visualmente entre transmisiones);
- el globo se dibuja **por encima** de la carga, solo mientras exista (fase de ascenso);
- la antena se dibuja debajo de la carga;
- la línea estación → globo (primer IGate) termina en la posición GPS, es decir, en la carga, porque es la posición transmitida.

Los datos originales no se modifican. La carga está en todo momento exactamente sobre la trayectoria dibujada: carga y línea usan la misma función de posición (`positionAtTime`, ver `docs/ARCHITECTURE.md`).

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
- Condición de referencia (P1, T1): la **primera transmisión válida del vuelo efectivo** (hoy el frame 10, la liberación; antes, con los datos en tierra incluidos, el frame 3 con los mismos P y T) (presión > 0 y T(K) > 0). No se asume 1013.25 hPa.

## Referencia inicial utilizada

Frame 10 (2026-10-11 13:21:39Z = 10:21:39 hora local, la liberación): P1 = 1008 hPa, T1 = 18 °C = 291.15 K, D1 = 1.5 m. (El frame 3, primera posición GPS válida, tenía los mismos 1008 hPa y 18 °C, por lo que los diámetros estimados no cambian.)

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
| Diámetro inicial (frame 10, liberación) | 1.5 m |
| Diámetro máximo estimado | 4.9 m (4.94 m), ~3.3 veces el inicial |
| Frame / hora del máximo | frame 138, 15:59:46Z = 12:59:46 local |
| Presión / temp. externa en el máximo | 26 hPa / −5 °C |

La incertidumbre de D1 (±0.2 m, ~13 %) se propaga proporcionalmente a todas las estimaciones (≈ ±0.7 m en el máximo), sin contar las limitaciones del modelo de abajo. Por eso la interfaz muestra una sola cifra decimal.

## Tamaño físico y ayuda de visibilidad (solo a distancia)

- `estimatedBalloonDiameterM` es el valor físico y es el que se muestra en el panel ("Diámetro estimado"). No lo modifica ninguna escala visual. Se interpola linealmente solo para el dibujo, entre transmisiones consecutivas del ascenso.
- **De cerca el conjunto se dibuja con dimensiones físicas/modeladas**: el globo con su diámetro estimado y la carga con 0.45 × 0.25 × 0.18 m (estimación visual, confianza baja). **No se conserva un tamaño angular constante en pantalla**: al hacer zoom, el conjunto crece o disminuye de forma natural junto con la escena.
- **Historia (qué se corrigió):** primero se usó un ×20 fijo (etapa 5); luego (etapa 7.1) una escala `clamp(d·θ/L, 1, máx)` por elemento que mantenía un tamaño angular mínimo para el globo y, por separado, para la carga. Esa fórmula compensaba la distancia de cámara en todo el rango de zoom (la carga llegaba a ×4 a 90 m, y a veces parecía mayor que el globo) y hacía que el zoom no se sintiera natural. Se eliminó.
- **Estrategia actual:** una **única escala para todo el conjunto** (globo, cuello, carga y separaciones), que mantiene siempre la proporción física globo/carga. `js/balloon.js` (`assemblyScale`) la recalcula en cada fotograma, porque las primitivas 3D usadas (elipsoide, caja, cilindro) no admiten `scaleByDistance` (solo puntos, etiquetas y billboards):

```
t      = clamp( (d − 300) / (2500 − 300) , 0 , 1 )
escala = 1 + (8 − 1) · t² · (3 − 2t)          (smoothstep)
```

  - `d`: distancia cámara → carga útil (m).
  - **Hasta 300 m: escala 1** (tamaño físico).
  - Entre 300 y 2500 m: crecimiento suave y limitado (≈ 1.4 a 600 m, ≈ 2.7 a 1000 m, ≈ 4.5 a 1400 m, ≈ 7.1 a 2000 m).
  - **Desde 2500 m: escala máxima 8**, congelada. El modelo no se sigue inflando: toma el relevo el marcador puntual del indicativo CX1AA-11 (`distanceDisplayCondition` desde 2500 m).
- Como la escala es común, la carga nunca supera la proporción física con el globo: largo de la carga / ancho del globo ≈ 0.31 (frame 3, globo de 1.5 m), ≈ 0.24 (frame 47, 1.9 m) y ≈ 0.10 (frame 138, 4.94 m).
- La ayuda es solo de renderizado: **no modifica posición, altitud ni trayectoria**.

## Suspensión y antena: sin longitudes físicas conocidas

No se conocen las longitudes de la línea de suspensión ni de la antena (`suspensionLengthM` y `antennaLengthM` son `null` en `flight.json`). Las separaciones que se ven en pantalla son parámetros **solo de renderizado**, definidos en `js/balloon.js`, discretos y multiplicados por la misma escala común (1 de cerca):

- `visualSuspensionOffset = clamp(0.6 · diámetro estimado, 0.8, 4)` m de escena entre el borde superior de la carga y el cuello del globo;
- `visualAntennaOffset = 0.8` m de escena hacia abajo desde la base de la carga.

*Visual-only rendering offset. Not a measured physical length.* No son datos de la misión, no se guardan en los datos y nunca se muestran al usuario como longitudes reales.

## Elementos dibujados (aproximados)

- **Globo**: elipsoide de revolución blanco/crema, translúcido (82 % opaco), algo alargado (alto = 1.12 × ancho) y con el **mismo volumen que la esfera del diámetro estimado**, más un pequeño cuello inferior (cilindro). Es una forma estilizada: no simula deformación real.
- **Carga útil**: caja blanca/crema (aspecto de poliestireno) con borde oscuro, 0.45 × 0.25 × 0.18 m × la escala común, centrada en la posición GPS. De cerca es pequeña (es físicamente pequeña); se acerca la cámara o se hace zoom para verla.
- **Antena**: línea verde fina que cuelga de la carga útil (no representa tirantes estructurales).
- **Línea de suspensión**: gris fina, entre la carga y el cuello del globo; solo durante el ascenso.
- La cámara "Seguir globo" se coloca inicialmente a ≈ 35 m de la carga (offset ENU −14, −28, +14 m), sobre una distancia física en la que se ven globo, carga, suspensión y antena; el usuario puede acercar, alejar y rotar libremente (ver `docs/MAPPING.md`).

## Limitaciones

- No simula la elasticidad del látex, la presión interna ni el límite de estiramiento.
- No predice la ruptura real; la "transición estimada" es una inferencia del perfil de vuelo, no un hecho medido.
- No modela cantidad de gas variable ni fugas (asume masa de gas constante).
- Supone que la temperatura del gas es la temperatura externa medida y que la presión interna es igual a la externa.
- No simula viento, inclinación, balanceo ni dinámica del cordón: el conjunto se mantiene vertical.
- No debe considerarse una medición.
