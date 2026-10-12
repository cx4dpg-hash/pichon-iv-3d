# Modelo físico aproximado del globo

Todo lo descrito aquí es una **estimación visual/física**, no una medición. El valor calculado
(`estimatedBalloonDiameterM`) se obtiene en tiempo de ejecución y **no se escribe** en el dataset.

## Fórmula

Gas ideal, con P = presión absoluta (hPa) y T = temperatura absoluta (K):

```
V2 = V1 * (T2 / T1) * (P1 / P2)
D2 = D1 * (V2 / V1)^(1/3)        (el globo se aproxima a una esfera)
```

Implementada en `js/physics.js` (`estimateDiameter`, `buildDiameterModel`).

## Entradas

- Solo `pressureHpa` y `externalTemperatureC` de cada transmisión de `flight`; `T(K) = °C + 273.15`.
- **No** se usa `altitudeGpsM` ni `barometricAltitudeM` para calcular el tamaño.
- `D1 = 1.5 m` (`visualEstimates.initialBalloonDiameterM`, incertidumbre ±0.2 m, estimación visual de confianza media), leído de `data/vuelo/flight.json`.
- Condición de referencia (P1, T1): la **primera transmisión válida del vuelo** (presión > 0 y T(K) > 0). No se asume 1013.25 hPa.

## Referencia inicial utilizada

Frame 3 (2026-10-11 13:14:41Z = 10:14:41 hora local): P1 = 1008 hPa, T1 = 18 °C = 291.15 K, D1 = 1.5 m.

Es una aproximación: 1.5 m corresponde visualmente al momento próximo al lanzamiento, pero el frame 3 es la primera trama con GPS válido y precede en varios minutos al inicio real del ascenso (la altitud GPS empieza a aumentar hacia el frame 11, ~10:22 local). Entre los frames 3 y 10 la presión es constante (1008 hPa), por lo que el diámetro estimado casi no varía.

## Validación y fallback

- Muestra válida: `pressureHpa` finito y > 0, `externalTemperatureC` finito con T(K) > 0.
- Si una transmisión no es válida (o el resultado no es finito/positivo) no se calcula un diámetro nuevo: se usa como **fallback solo visual** el último diámetro válido (o D1 si aún no hubo ninguno) y la entrada queda marcada `fallback` (o `initial` si es anterior a la referencia). El panel lo indica entre paréntesis.
- En los datos actuales no se aplica ningún fallback (0 de 155), ninguna presión es ≤ 0 ni hay resultados no finitos.

## Resultado con los datos reales (estimado)

| | Valor |
|---|---|
| Diámetro inicial (frame 3) | 1.5 m |
| Diámetro máximo estimado | 4.9 m (4.94 m), ~3.3 veces el inicial |
| Frame / hora del máximo | frame 138, 15:59:46Z = 12:59:46 local |
| Presión / temp. externa en el máximo | 26 hPa / −5 °C |

La incertidumbre de D1 (±0.2 m, ~13 %) se propaga proporcionalmente a todas las estimaciones (≈ ±0.7 m en el máximo), sin contar las limitaciones del modelo de abajo. Por eso la interfaz muestra una sola cifra decimal.

## Valor físico vs. escala visual

- `estimatedBalloonDiameterM` es el valor físico y es el que se muestra en el panel ("Diámetro estimado"). Se interpola linealmente solo para el dibujo, entre transmisiones consecutivas.
- Para el renderizado se aplica un **factor de exageración visual ×20** (`VISUAL.scale` en `js/balloon.js`) al globo, la carga útil y las longitudes de suspensión/antena, porque a kilómetros de distancia los tamaños reales serían invisibles. El factor no modifica posición, altitud ni trayectoria. El globo se dibuja con diámetro de ~30 m (inicio) a ~99 m (máximo).
- El centro del globo es la posición GPS interpolada (como se pidió). La carga, la suspensión y la antena se dibujan debajo, en vertical.

## Elementos dibujados (aproximados)

- **Globo**: esfera blanca translúcida.
- **Línea de suspensión**: longitud visual nominal de 4 m (×20 = 80 m). No es una medida (`suspensionLengthM` es `null` en `flight.json`).
- **Carga útil**: caja de 0.45 × 0.25 × 0.18 m (estimación visual de confianza baja, pendiente de confirmar), ×20.
- **Antena**: línea que cuelga de la carga útil, longitud visual nominal de 1.5 m (×20 = 30 m); no es medida y no representa tirantes estructurales.
- Cuando la cámara está lejos (> 2500 m) se muestra además el marcador puntual con el indicativo, porque el conjunto 3D no se distingue.

## Limitaciones

- No simula la elasticidad del látex, la presión interna ni el límite de estiramiento.
- No predice la ruptura real ni representa una explosión.
- No modela cantidad de gas variable ni fugas (asume masa de gas constante).
- Supone que la temperatura del gas es la temperatura externa medida y que la presión interna es igual a la externa.
- **Después del máximo (frame 138) el modelo deja de ser interpretable**: la presión aumenta durante la caída y la fórmula "reduce" el globo hasta ~1.5 m al final (frame 157), aunque lo más probable es que el globo ya no se comportara como un cuerpo de gas cerrado. Se muestra tal cual el cálculo; qué hacer en esa fase es una decisión pendiente.
- No simula viento, inclinación, balanceo ni dinámica del cordón: el conjunto se mantiene vertical.
- No debe considerarse una medición.
