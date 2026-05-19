# Auditoría — fase agudeza visual

**Fase:** `agudeza`.  
**Reglas clínicas completas:** `protocolo-estado.md` (no reescribas el árbol aquí; validá cumplimiento).

---

## Inicio del test (`modo: bootstrap`)

Validar patch + acciones según *Inicio del test por ojo* en **protocolo-estado.md**:

- `logmarActual: 0.3`, `letraActual: H`, contadores en 0, `letrasUsadas: ["H"]`
- `acciones`: foróptero (ojo activo open + RX, contralateral close) + TV H @ 0.3
- `evento: inicio_ojo`

---

## Checklist tras **correcta**

Simulá `aciertosPorLogmar` **después** del patch.

| Condición post-simulación | Debe cumplirse |
|---------------------------|----------------|
| Contador del `logmarActual` **≥ 2** | `logmarFinal` + `letraFinal` en ese ojo; **sin** `tv` para seguir en ese ojo. Ojo **R** → `evento: cierre_ojo_R_e_inicio_L` + foróptero + TV H@0.3 para L en el **mismo** turno. |
| Contador **= 1** y `logmarActual > 0.0` | **Bajar** un paso logMAR, nueva letra, acción `tv`; `evento: siguiente_optotipo`. |
| Contador **= 1** y `logmarActual == 0.0` | Permanecer en 0.0, rotar letra, `tv`. |

### Anti-patrón: solo contador (regresión log T3)

**Rechazar** si:

- Clasificación **correcta**
- Patch solo incrementa `aciertosPorLogmar`
- `evento: siguiente_optotipo`
- `acciones: []` (o sin `tv`)
- `logmarActual > 0.0` y contador simulado queda en **1**

---

## Checklist tras **incorrecta** / **no_ve**

- Subida de logMAR: como máximo un paso (`0.0→0.1→0.2→0.3`).
- En **0.3**: rotar letra + `tv` (no rechazar solo por `letraElegida` no Sloan; ver **auditoria-estructural.md**).

---

## Otros anti-patrones (agudeza)

| Anti-patrón | Regla |
|-------------|--------|
| Cierre R sin MQTT L en mismo turno | `cierre_ojo_R_e_inicio_L` + foróptero + TV |
| Correcta con contador ≥ 2 y además baja logMAR o `tv` en mismo ojo | Cierre manda |
| `tv` con letra/logmar ≠ patch | Deben coincidir |
| `fase: finalizado` sin L cerrado | Rechazar |

---

## Ejemplo QA (ojo R)

| Paso | logMAR | Clasificación | Esperado |
|------|--------|---------------|----------|
| 1 | 0.3 | correcta H | `0.3:1`; bajar a **0.2** + **tv** |
| 4 | 0.2 | correcta (2.º en 0.2) | Cierre R + inicio L |

---

## Caso crítico ojo L

`logmarActual: 0.1`, `0.1:1` en contadores, correcta → `0.1:2`, cierre L, **sin** bajar a 0.0 con `tv`.
