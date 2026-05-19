# Dispositivos — foróptero y TV (POC)

**Agente:** protocolo (acciones MQTT).  
**Alcance:** formato y reglas de emisión de `acciones`; no define cuándo sube/baja logMAR (ver **fases/agudeza/protocolo-estado.md**).

RX fija: **fases/agudeza/protocolo-estado.md**.

---

## Foróptero

### Comando

```json
{
  "dispositivo": "foroptero",
  "config": {
    "R": { "esfera": 0.75, "cilindro": -1.75, "angulo": 60, "occlusion": "open" },
    "L": { "occlusion": "close" }
  }
}
```

### Oclusión

- Ojo en test: `occlusion: "open"` con `esfera`, `cilindro`, `angulo` de la RX de ese ojo.
- Ojo contralateral: solo `{ "occlusion": "close" }` (sin graduación).

### Límites absolutos (no exceder)

| Parámetro | Mínimo | Máximo |
|-----------|--------|--------|
| Esfera (D) | -12.00 | +12.00 |
| Cilindro (D) | -6.00 | 0.00 |
| Ángulo (°) | 0 | 180 |

En POC usar solo la RX de demostración del protocolo.

### Cuándo enviar foróptero

- Al **iniciar** cada ojo (R o L).
- Al **cerrar R y abrir L** en el **mismo** turno: **obligatorio** (no diferir).
- **No** reenviar si solo cambia la letra en TV (misma RX y oclusión en el mismo ojo en test).

---

## TV / optotipos

### Comando

```json
{
  "dispositivo": "tv",
  "letra": "H",
  "logmar": 0.3
}
```

### Reglas

- `letra`: una letra Sloan mayúscula (**H, O, T, E, C, F, Z, L, P, D**).
- `logmar`: **0.3** | **0.2** | **0.1** | **0.0**
- Debe coincidir con `letraActual` y `logmarActual` del patch del mismo turno.
- Cada cambio de logMAR o de letra requiere **nueva** acción `tv`.
- En **repregunta_sin_cambio** (ambigua / confianza_baja): **no** enviar `tv`.

### Cuándo **no** enviar TV

- Tras **correcta** que cierra el ojo (`resultadosPorLogmar[logmarActual].correcto >= 2` en el estado tras registro) en ese ojo: no `tv` para seguir en el mismo ojo; si abrís el otro ojo, sí TV del **nuevo** ojo.

---

## Orden en el array `acciones`

1. `foroptero` (si aplica)  
2. `tv` (si aplica)
