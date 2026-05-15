# TV / optotipos — POC

## Comando (acción dispositivo `tv`)

```json
{
  "dispositivo": "tv",
  "letra": "H",
  "logmar": 0.3
}
```

## Reglas

- `letra`: una letra Sloan mayúscula (H, O, T, E, C, F, Z, L, P, D).
- `logmar`: 0.3 | 0.2 | 0.1 | 0.0
- La letra en pantalla debe coincidir con la que se pregunta al paciente.
- Cada cambio de logMAR o de letra requiere nueva acción `tv`.
