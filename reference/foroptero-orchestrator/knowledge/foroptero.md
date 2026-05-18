# Foróptero digital — POC

## Comando (acción dispositivo `foroptero`)

```json
{
  "dispositivo": "foroptero",
  "config": {
    "R": { "esfera": 0.75, "cilindro": -1.75, "angulo": 60, "occlusion": "open" },
    "L": { "occlusion": "close" }
  }
}
```

## Oclusión

- Ojo en test: `occlusion: "open"` con esfera, cilindro, angulo de la RX.
- Ojo contralateral: solo `{ "occlusion": "close" }` (sin graduación).

## Límites absolutos (no exceder)

| Parámetro | Mínimo | Máximo |
|-----------|--------|--------|
| Esfera (D) | -12.00 | +12.00 |
| Cilindro (D) | -6.00 | 0.00 |
| Ángulo (°) | 0 | 180 |

En POC usar solo la RX fija de examen-agudeza.md.

## Cuándo enviar

- Al **iniciar** cada ojo (R o L).
- Al **cerrar R y abrir L** en el mismo turno clínico: **obligatorio** enviar foróptero en ese turno (no diferir al turno siguiente). Ver **sistema.md** (Cierre R → L) y **examen-agudeza.md** (Transición R → L).
- No reenviar si solo cambia la letra en TV (misma RX y oclusión en el mismo ojo en test).
