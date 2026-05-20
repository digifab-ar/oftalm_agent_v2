# Auditoría — fase agudeza visual

**Fase:** `agudeza`.  
**Reglas clínicas canónicas:** `protocolo-estado.md` (*Decisión clínica*, *Gramática del patch*, *Eventos*, *Catálogo de regresiones*). No reescribir el árbol aquí; validar cumplimiento.

---

## Fuente de verdad

- Auditá contra el JSON del user (**estado tras registro del intento** en servidor). Los contadores ya incluyen este turno.
- Leé `resultadosPorLogmar[logmar].correcto` / `.incorrecto` — **no** simules +1.
- Si citás valores en `violaciones`, deben coincidir **literalmente** con el JSON.
- **Antes** del checklist clínico: validá la **forma** del `estadoPatch` según `auditoria-estructural.md` § *Validación de rutas JSON* y *Gramática del patch* en `protocolo-estado.md`.

---

## Registro en servidor (pipeline)

- Tras el intérprete, el orquestador incrementa `resultadosPorLogmar` antes de invocar al protocolo.
- **Rechazar** si el patch del protocolo incluye o altera `resultadosPorLogmar` o `aciertosPorLogmar`.

---

## Campos de estado (agudeza)

- **Cierre por ojo:** `resultadosPorLogmar[logmarActual].correcto >= 2` en el estado **tras registro** (clasificación **correcta** en ese turno).
- **`confirmaciones`:** puede aparecer en JSON legacy; **no** es criterio de auditoría en agudeza. No generes violaciones ni exijas cambios en ese campo.

---

## Tabla de decisión por clasificación

Usá **un solo** checklist según `interpretacion.clasificacion`:

| `clasificacion` | Checklist a usar | Ignorar |
|-----------------|------------------|---------|
| **correcta** | [Checklist tras correcta](#checklist-tras-correcta) | Reglas de subida `no_ve` / `incorrecta` |
| **incorrecta**, **no_ve** | [Checklist tras incorrecta / no_ve](#checklist-tras-incorrecta--no_ve) | Post-correcta, anti-patrones de cierre |
| **ambigua**, **confianza_baja** | Estructural: `acciones: []`, `repregunta_sin_cambio` | Contadores, logMAR |
| **continuacion** (bootstrap) | [Inicio del test](#inicio-del-test-modo-bootstrap) | Contadores previos null en arranque |

---

## Inicio del test (`modo: bootstrap`)

Validar patch + acciones contra **Plantilla A** de `prompts/protocolo-agudeza.md` y *Eventos → `inicio_ojo`* en `protocolo-estado.md`:

- `agudeza.{ojo}` con `logmarActual: 0.3`, `letraActual: "H"`, `letrasUsadas: ["H"]`
- `ojoActual` del ojo que inicia
- `acciones`: foróptero (ojo activo open + RX, contralateral close) + TV H @ 0.3
- `evento: inicio_ojo`
- **Contadores no van en el patch** (los inicializa el servidor en memoria).

---

## Checklist tras **correcta**

**Solo** si `interpretacion.clasificacion === "correcta"`.

Leé `c = resultadosPorLogmar[logmarActual].correcto` del estado (ya incrementado por el servidor).

**Selección de fila (obligatoria).** Una sola fila según `c`. No mezclar violaciones de ramas distintas.

| Condición (`c` = correctos en logMAR del estímulo) | Debe cumplirse |
|------------------------------------------------------|----------------|
| **c ≥ 2** | `logmarFinal` en ese ojo (**sin** exigir `letraFinal`); **sin** `tv` para seguir en ese ojo. Ojo **R** → `cierre_ojo_R_e_inicio_L` + foróptero + TV H@0.3 L en el **mismo** turno. |
| **c = 1** y `logmarActual > 0.0` | **Bajar** un paso logMAR, nueva letra, `tv`; `siguiente_optotipo`. |
| **c = 1** y `logmarActual == 0.0` | Permanecer en 0.0, rotar letra, `tv`. |

### Anti-patrón: cierre prematuro con `c == 1` (BUG-003, 2026-05-20)

**Rechazar** si:

- Clasificación **correcta**
- `resultadosPorLogmar[logmarActual].correcto === 1` en el estado (tras registro)
- `evento: cierre_ojo_R_e_inicio_L` o `examen_finalizado`

Cierre solo con `c >= 2`. Citar `BUG-003` en `violaciones`.

`correccionSugerida` (resumen):

- Si `logmarActual > 0.0`: Plantilla B (BAJAR) — `agudeza.{ojo}.logmarActual = logmarActual - 0.1`, letra Sloan no usada, `tv` con la nueva letra y logmar, `evento: siguiente_optotipo`.
- Si `logmarActual == 0.0`: Plantilla B (ROTAR_0) — mantener logmar, rotar letra.

### Anti-patrón: solo contador / sin TV

**Rechazar** si clasificación **correcta** con `c == 1`, `logmarActual > 0.0`, `evento: siguiente_optotipo` y `acciones: []` o sin `tv`, **o** patch no baja logMAR.

### Anti-patrón: patch vacío en `correcta`

**Rechazar** si clasificación **correcta** y `estadoPatch: {}` y/o `acciones: []` sin lógica de cierre válida.

`correccionSugerida` según `c = resultadosPorLogmar[logmarActual].correcto` del estado (**sin** simular +1). Si rechazás por forma o cierre, **pegá el JSON completo** (no solo viñetas):

- **c ≥ 2** ojo **R**: bloque completo con `estadoPatch.ojoActual:"L"`, `estadoPatch.agudeza.R.logmarFinal`, `estadoPatch.agudeza.L` (H@0.3), `evento:"cierre_ojo_R_e_inicio_L"`, `acciones` foróptero + TV — ver AUD-04. **Sin** contadores ni `letraFinal` en patch.
- **c ≥ 2** ojo **L**: `agudeza.L.logmarFinal`, `fase:"finalizado"`, sin `tv`.
- **c = 1**, logMAR > 0: bajada un paso + `tv` + `siguiente_optotipo` (patch solo bajo `agudeza.{ojoActivo}`).
- **c = 1**, logMAR = 0: rotar letra + `tv`.
- **Forma / L mal anidado** (BUG-001): `Fallo: protocolo.` + JSON de AUD-04 o Plantilla D en `prompts/protocolo-agudeza.md`.

### Anti-patrón: patch parcial en cierre R → L

**Rechazar** si clasificación **correcta**, `c ≥ 2` en R, y falta en el **mismo** JSON:

- `agudeza.R.logmarFinal`
- `agudeza.L` con `logmarActual:0.3`, `letraActual:"H"`, `letrasUsadas:["H"]`
- `ojoActual: "L"`
- `evento: "cierre_ojo_R_e_inicio_L"`
- `acciones`: foróptero (R close, L open + RX_L) + TV H@0.3

**No aprobar** si las `acciones` MQTT son correctas pero el patch no cumple la lista anterior.

### Anti-patrón: `L` mal anidado (regresión log 2026-05-19, turno 5)

**Rechazar** si `evento === "cierre_ojo_R_e_inicio_L"` y el patch tiene `estadoPatch.L` en la **raíz** (hermano de `agudeza`) en lugar de `estadoPatch.agudeza.L`.

**Ejemplo inválido (clínica OK, forma NO):**

```json
{
  "estadoPatch": {
    "agudeza": { "R": { "logmarFinal": 0.2 } },
    "L": { "logmarActual": 0.3, "letraActual": "H", "letrasUsadas": ["H"] }
  },
  "evento": "cierre_ojo_R_e_inicio_L",
  "acciones": [ "foroptero R close / L open", "tv H@0.3" ]
}
```

Violaciones típicas (usar texto fijo):

| Violación |
|-----------|
| `estadoPatch.L en raíz: debe ser estadoPatch.agudeza.L` |
| `Falta ojoActual: "L" en cierre R→L` |

`correccionSugerida`: pegar el JSON válido de `fixtures/auditor/AUD-04-correcta-cierre-R.json` o la **Plantilla D** de `prompts/protocolo-agudeza.md`, ajustando `logmarFinal` al logMAR de cierre del `estadoAntes`. Citar `BUG-001` en `violaciones` para trazabilidad.

### Anti-patrón: patch parcial sin `agudeza.L` ni `ojoActual`

**Ejemplo inválido:**

```text
estado (tras registro): 0.2.correcto = 2
propuesta: { ojoActual:"L", agudeza:{ R:{ logmarFinal:0.2 } }, acciones:[], evento:"siguiente_optotipo" }
```

Violaciones: falta `agudeza.L`; evento/acciones incorrectos; posible falta de foróptero + TV.

---

## Checklist tras **incorrecta** / **no_ve**

**Solo** si `interpretacion.clasificacion` es `incorrecta` o `no_ve`.

En el protocolo de agudeza, incorrecta y no_ve implican subida de logMAR (o rotación en 0.3) **sin contadores** (ver `protocolo-estado.md`).

### Prohibido en este turno

- Que el patch **modifique** `resultadosPorLogmar` o `aciertosPorLogmar` (el servidor ya registró `incorrecto` en el logMAR del estímulo).
- Aplicar checklist post-**correcta** ni anti-patrones de cierre.
- Auditar `confirmaciones`.

### Aprobar si

- Subida de `logmarActual` ≤ **un paso** (o rotar letra en **0.3**).
- `tv` alineada al patch.
- Patch **sin** claves de contadores (preferido).

### Rechazar si

- Sube más de un paso logMAR.
- `tv` desalineada.
- Patch incluye o altera `resultadosPorLogmar` / `aciertosPorLogmar` (el merge del código podría haberlos ignorado, pero el auditor debe rechazar la **intención** del protocolo).
- Clasificación **correcta** con solo subida logMAR (checklist equivocado).

### Coherencia TV ↔ patch

| Campo patch | Acción `tv` |
|-------------|-------------|
| `agudeza.{ojo}.logmarActual` | `logmar` |
| `agudeza.{ojo}.letraActual` | `letra` |

---

## Otros anti-patrones (agudeza)

| Anti-patrón | Regla |
|-------------|--------|
| Cierre R sin MQTT L en mismo turno | `cierre_ojo_R_e_inicio_L` + foróptero + TV |
| Correcta con contador ≥ 2 y además baja logMAR o `tv` en mismo ojo | Cierre manda |
| `tv` con letra/logmar ≠ patch | Deben coincidir |
| `fase: finalizado` sin L cerrado | Rechazar |

---

## Ejemplos QA (ojo R)

| Paso | logMAR | Clasificación | Esperado auditor |
|------|--------|---------------|------------------|
| 1 | 0.3 | correcta H | tras registro `0.3.correcto:1`; bajar a **0.2** + **tv** → **aprobado** |
| 4 | 0.2 | correcta (2.º en 0.2) | tras registro `0.2.correcto:2`; cierre R + L → **aprobado** |

### Caso regresión T4-log (`no_ve` con `0.2.correcto` previo)

**Aprobar** — estado tras registro: `0.1.incorrecto:1`, `0.2.correcto:1` intacto; patch sube a E@0.2 **sin** contadores.

**Rechazar** — patch con `resultadosPorLogmar` / `aciertosPorLogmar` que alteren valores.

Fixtures: `fixtures/auditor/AUD-01.json`, `AUD-02.json`, `AUD-04-correcta-cierre-R.json` (cierre válido), `AUD-07.json`. Regresión cambio de ojo: rechazar propuesta con `estadoPatch.L` en raíz (ver § Anti-patrón L mal anidado).

---

## Caso crítico ojo L

Tras registro de **correcta** en 0.1 con `0.1.correcto:2` → cierre L con `logmarFinal:0.1`, **sin** bajar a 0.0 con `tv`.
