# Auditoría — fase agudeza visual

**Fase:** `agudeza`.  
**Reglas clínicas completas:** `protocolo-estado.md` (no reescribas el árbol aquí; validá cumplimiento).

---

## Campos de estado (agudeza)

- **Cierre por ojo:** `aciertosPorLogmar` del ojo activo (≥ 2 en el **mismo** logMAR tras clasificación **correcta**).
- **`confirmaciones`:** puede aparecer en JSON legacy; **no** es criterio de auditoría en agudeza. No generes violaciones ni exijas cambios en ese campo.

---

## Tabla de decisión por clasificación

Usá **un solo** checklist según `interpretacion.clasificacion`:

| `clasificacion` | Checklist a usar | Ignorar |
|-----------------|------------------|---------|
| **correcta** | [Checklist tras correcta](#checklist-tras-correcta) | Reglas de subida `no_ve` / `incorrecta` |
| **incorrecta**, **no_ve** | [Checklist tras incorrecta / no_ve](#checklist-tras-incorrecta--no_ve) | Post-correcta, anti-patrón “solo contador” |
| **ambigua**, **confianza_baja** | Estructural: `acciones: []`, `repregunta_sin_cambio` | Contadores, logMAR |
| **continuacion** (bootstrap) | [Inicio del test](#inicio-del-test-modo-bootstrap) | Contadores previos null en arranque |

---

## Inicio del test (`modo: bootstrap`)

Validar patch + acciones según *Inicio del test por ojo* en **protocolo-estado.md**:

- `logmarActual: 0.3`, `letraActual: H`, contadores en 0, `letrasUsadas: ["H"]`
- `acciones`: foróptero (ojo activo open + RX, contralateral close) + TV H @ 0.3
- `evento: inicio_ojo`

---

## Checklist tras **correcta**

**Solo** si `interpretacion.clasificacion === "correcta"`.

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

**Solo** si `interpretacion.clasificacion` es `incorrecta` o `no_ve`.

En el protocolo de agudeza, incorrecta y no_ve implican subida de logMAR (o rotación en 0.3) **sin contadores** (ver `protocolo-estado.md`).

### Prohibido en este turno

- Incrementar `aciertosPorLogmar` en ningún nivel.
- Exigir que el contador del logMAR **destino** suba porque ya sea ≥ 1 por aciertos **anteriores** en ese mismo logMAR.
- Aplicar simulación post-**correcta** ni el anti-patrón “solo contador”.
- Auditar ni exigir cambios en `confirmaciones`.

### Aprobar si

- Subida de `logmarActual` como máximo **un paso** en la escala `0.0 → 0.1 → 0.2 → 0.3` (o en **0.3**: solo rotar letra, sin subir más).
- `acciones` incluye `tv` con `letra` y `logmar` iguales al patch del ojo activo en `estadoPatch`.
- `evento` coherente (p. ej. `siguiente_optotipo` si cambió estímulo).
- Los contadores del patch coinciden con `estadoAntes` (sin incrementos).

### Rechazar si

- Sube más de un paso logMAR en un solo turno.
- `tv` con letra/logmar ≠ patch del ojo activo.
- Clasificación `no_ve` o `incorrecta` pero el patch **incrementa** algún valor de `aciertosPorLogmar`.
- Clasificación **correcta** pero la propuesta solo sube logMAR sin lógica de contador (eso corresponde al otro checklist).

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
| 1 | 0.3 | correcta H | `0.3:1`; bajar a **0.2** + **tv** → **aprobado** |
| 4 | 0.2 | correcta (2.º en 0.2) | Cierre R + inicio L → **aprobado** |

### Caso regresión T4-log (`no_ve` con contador previo en destino)

**Aprobar** (`aprobado: true`):

```text
estadoAntes: ojo R, logmarActual 0.1, letra T,
  aciertosPorLogmar { "0.3": 1, "0.2": 1, "0.1": 0, "0.0": 0 }
interpretacion: no_ve (ej. "veo borroso")
propuesta: logmarActual 0.2, letra E, tv E@0.2,
  aciertosPorLogmar sin incrementar "0.2" (sigue en 1)
```

**Rechazar** (`aprobado: false`):

```text
misma base, propuesta incrementa aciertosPorLogmar["0.2"] a 2 solo por no_ve
```

Fixtures JSON: `fixtures/auditor/AUD-01.json`, `AUD-02.json`.

---

## Caso crítico ojo L

`logmarActual: 0.1`, `0.1:1` en contadores, **correcta** → `0.1:2`, cierre L, **sin** bajar a 0.0 con `tv`.
