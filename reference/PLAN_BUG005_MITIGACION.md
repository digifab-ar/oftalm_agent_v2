# Plan de implementación — BUG-005 (letras Sloan / `letrasUsadas`)

**Estado:** implementado (prompts/knowledge/QA); sin validación clínica en código  
**Alcance:** fases 0–5 — definición clínica solo vía **LLM** (protocolo + auditor)

---

## Objetivo

Evitar que el agente protocolo reutilice letras Sloan ya presentes en `letrasUsadas` del ojo activo o encoja el array al hacer `deepMerge`, y que los reintentos reciban correcciones accionables del **auditor LLM** (sin sugerir H si H ya fue usada).

**Principio:** no duplicar reglas BUG-005 en JavaScript; el servidor solo precomputa `letrasUsadasResultantes` para la vista del auditor (merge simulado, no criterio clínico).

---

## Fase 0 — Alineación y caso de referencia

| Entregable | Ubicación |
|------------|-----------|
| Este plan | `reference/PLAN_BUG005_MITIGACION.md` |
| Vista + propuesta inválida/válida (log 2026-05-22) | `reference/foroptero-orchestrator/fixtures/protocolo/BUG005-L-bajar-0.0.json` |

**Caso canónico (log turno 8):** L con `letrasUsadas: ["H","O","T"]`, correcta @0.1, `c=1` → debe **BAJAR** a 0.0 con letra **E** (u otra ∉ previas). Inválido: `letraActual: "H"`.

---

## Fase 1 — Protocolo (prompt + knowledge)

| # | Archivo | Cambio |
|---|---------|--------|
| 1.1 | `prompts/protocolo-agudeza.md` | Regla de elección de letra; BAJAR vs ROTAR_0; anti-trampa BUG-005; auto-verificación ítems 7–8 |
| 1.2 | `knowledge/fases/agudeza/protocolo-estado.md` | Ejemplo L→0.0; `deepMerge`; catálogo BUG-005 |
| 1.3 | `agents/protocolo.js` (user) | Recordatorio: auditor rechaza BUG-005 |

---

## Fase 2 — Auditor (única validación BUG-005)

| # | Archivo | Cambio |
|---|---------|--------|
| 2.1 | `prompts/auditor.md` | Plantilla `correccionSugerida` BUG-005 con letra nueva |
| 2.2 | `knowledge/fases/agudeza/auditoria.md` | Ejemplo JSON; no sugerir H si H ∈ previas |

---

## Fase 3 — Contratos

| # | Archivo | Cambio |
|---|---------|--------|
| 3.1 | `foroptero-orchestrator/docs/contratos-agentes.md` | BUG-005 = auditor LLM + `letrasUsadasResultantes` |

---

## Fase 4 — QA (fixtures manuales)

| Caso | Archivo |
|------|---------|
| BUG-005 negativo | `fixtures/auditor/AUD-12-bug005-letra-reutilizada.json` |
| BUG-005 positivo | `fixtures/auditor/AUD-11-bug005-letra-nueva.json` |
| Replay | `fixtures/protocolo/BUG005-L-bajar-0.0.json` |

---

## Fase 5 — Operación

| # | Archivo |
|---|---------|
| 5.1 | `knowledge/fases/agudeza/comunicacion.md` |
| 5.2 | `knowledge/fases/agudeza/runbook-operador.md` |

---

## Explícitamente fuera de alcance

- `lib/validarProtocoloAgudeza.js` o cualquier rechazo BUG-005 en código antes del auditor LLM.
- Tests automatizados de reglas clínicas de letras en JS.

---

## Criterios de cierre

- [x] Prompt protocolo ítems 7–8 + anti-trampa BUG-005.
- [x] Auditor con corrección BUG-005 sin reutilizar H.
- [x] Fixtures AUD-11 / AUD-12 + BUG005-L-bajar-0.0.
- [x] Pipeline sin validación determinista de letras (solo auditor LLM).
