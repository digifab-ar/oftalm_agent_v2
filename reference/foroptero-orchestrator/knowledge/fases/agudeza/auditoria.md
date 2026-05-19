# Auditoría — fase agudeza visual

**Fase:** `agudeza`.  
**Reglas clínicas completas:** `protocolo-estado.md` (no reescribas el árbol aquí; validá cumplimiento).

---

## Fuente de verdad

- Auditá comparando contra el JSON `estadoAntes` literal del user. No infieras `logmarActual` ni `aciertosPorLogmar` desde el historial conversacional ni desde el razonamiento del protocolo.
- Si en tu `violaciones` o `correccionSugerida` citás un valor, debe coincidir **literalmente** con `estadoAntes` (p. ej. si `estadoAntes.agudeza.R.logmarActual === 0.2`, no escribas “bajada desde 0.1”).

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

### Anti-patrón: patch vacío en `correcta` (regresión log 2026-05-19 turno 5)

**Rechazar** si:

- Clasificación **correcta**
- `estadoPatch: {}` y/o `acciones: []`
- `evento ∈ { repregunta_sin_cambio, siguiente_optotipo }` (cualquier evento sin patch ni acciones)

`correccionSugerida` esperada según rama (simulá `aciertosPorLogmar[logmarActual] += 1` sobre `estadoAntes`):

- Simulación **≥ 2** en ojo **R**: exigir patch de cierre R (`logmarFinal`, `letraFinal`, `aciertosPorLogmar` con el contador del logMAR de cierre en ≥ 2), patch L inicial (`logmarActual: 0.3`, `letraActual: "H"`, contadores 0, `letrasUsadas: ["H"]`), `ojoActual: "L"`, `acciones` con foróptero (R close, L open + RX_L de `estadoAntes.rx.L`) y TV H@0.3, `evento: cierre_ojo_R_e_inicio_L`.
- Simulación **≥ 2** en ojo **L**: exigir `logmarFinal`, `letraFinal` en `agudeza.L`, `fase: "finalizado"`, sin `tv`, `evento: cierre_ojo_L` o `examen_finalizado`.
- Simulación **= 1** y `logmarActual > 0.0`: exigir bajada de logMAR un paso, letra Sloan no usada, `tv` alineada al patch, `evento: siguiente_optotipo`.
- Simulación **= 1** y `logmarActual == 0.0`: exigir rotación de letra Sloan no usada, `tv` alineada al patch, `evento: siguiente_optotipo`.

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
- Los contadores del patch coinciden **exactamente** con `estadoAntes` (sin incrementos **ni decrementos**), o bien la clave `aciertosPorLogmar` está **omitida** del patch.

### Rechazar si

- Sube más de un paso logMAR en un solo turno.
- `tv` con letra/logmar ≠ patch del ojo activo.
- Clasificación `no_ve` o `incorrecta` pero el patch **incrementa** algún valor de `aciertosPorLogmar`.
- Clasificación `no_ve` o `incorrecta` pero el patch **decrementa o resetea** algún `aciertosPorLogmar` que en `estadoAntes` era ≥ 1 (anti-patrón “reset de contadores ganados”; regresión log 2026-05-19 turno 4).
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
  aciertosPorLogmar OMITIDO o idéntico a estadoAntes (sigue en {0.3:1, 0.2:1, 0.1:0, 0.0:0})
```

**Rechazar** (`aprobado: false`) — incremento espurio:

```text
misma base, propuesta incrementa aciertosPorLogmar["0.2"] a 2 solo por no_ve
```

**Rechazar** (`aprobado: false`) — **reset de contador ganado** (regresión log 2026-05-19 turno 4):

```text
estadoAntes.aciertosPorLogmar = { "0.3": 1, "0.2": 1, "0.1": 0, "0.0": 0 }
patch.aciertosPorLogmar       = { "0.3": 1, "0.2": 0, "0.1": 0, "0.0": 0 }
                                              ^^^^^^ degrada acierto previo
violación: "patch decrementa aciertosPorLogmar[0.2] de 1 a 0 en clasificación no_ve"
correccion: "omitir aciertosPorLogmar del patch o copiarlo idéntico a estadoAntes"
```

Fixtures JSON: `fixtures/auditor/AUD-01.json`, `AUD-02.json`, `AUD-07.json`.

---

## Caso crítico ojo L

`logmarActual: 0.1`, `0.1:1` en contadores, **correcta** → `0.1:2`, cierre L, **sin** bajar a 0.0 con `tv`.
