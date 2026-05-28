# Contratos de vistas por agente

**Alcance:** shapes que el servidor proyecta antes de invocar a cada agente LLM. Implementación: `lib/vistasAgentes.js`, schemas en `agents/schemas.js`.

Ver también: [docs/API.md — Vistas de agentes](../../../docs/API.md#5-vistas-de-agentes) para referencia completa con tipos.

---

## Principios

- **Regla del menor contexto:** cada agente recibe el subconjunto mínimo necesario para su salida.
- **Vista por agente:** no se reutiliza el estado completo entre agentes.
- **Pre-computación obligatoria:** contadores (`contadoresLogmarActual`), flags de comunicación, `letrasUsadasResultantes`.
- **El historial nunca se serializa al LLM.** Vive server-side para auditoría y CSV.
- **Vocabulario de ojos:** solo `R` y `L` literales; `ojoActual` indica el operativo.

---

## VistaInterprete

Campos: `fase`, `modo`, `estimulo` (`letraActual`), `respuestaPaciente`, `confianza`.

Derivación: `estimulo` desde `estimuloParaInterprete(estado)`. Bootstrap no invoca LLM.

---

## VistaProtocolo

Campos: `fase`, `modo`, `ojoActual`, `agudeza` (ojo activo: operativos + `contadoresLogmarActual`; ojo inactivo: solo `logmarFinal`), `rx`, `interpretacion` (`clasificacion`, `letraElegida`), `feedbackAuditor` (null o `{ violaciones, correccionSugerida }` en reintento).

`contadoresLogmarActual`: extraído de `resultadosPorLogmar[String(logmarActual)]` del ojo; `null` si `logmarActual == null`.

**Excluido:** `historial`, `intentosRegistrados`, `resultadosPorLogmar` completo, legacy.

**BUG-005:** lo valida solo el **auditor LLM** vía `letrasUsadasResultantes` (precomputado en servidor para la vista, sin reglas clínicas duplicadas en código). Reglas en `knowledge/core/auditoria-estructural.md` y `knowledge/fases/agudeza/auditoria.md`.

**BUG-006:** el protocolo debe usar `agudeza.R.logmarFinal` / `agudeza.L.logmarFinal` de la vista para no reemitir `cierre_ojo_R_e_inicio_L`. Validación solo por auditor LLM. Reglas en `knowledge/fases/agudeza/auditoria.md`.

---

## VistaAuditor

Igual que VistaProtocolo + `intentoRecienRegistrado` (solo `modo: respuesta`) + `propuestaProtocolo` con `letrasUsadasResultantes` (post-`deepMerge` simulado).

Ante `cierre_ojo_R_e_inicio_L`, el auditor comprueba primero si `estadoAntes.agudeza.R.logmarFinal` ya está definido (**BUG-006**).

---

## VistaComunicacion

Campos: `fase`, `evento`, `detalleEvento`, `huboCambioDispositivo`, cuatro flags booleanos, `interpretacion` (`clasificacion`, `notasInterprete`), `estadoResumido`.

| Flag | Derivación |
|------|------------|
| `esPrimerTurnoExamen` | `historial.length === 0` |
| `esCambioDeOjo` | `estadoAntes.ojoActual !== patch.ojoActual` y patch define `ojoActual` |
| `esPrimerTurnoOjoActivo` | `estadoAntes.agudeza[ojoPostPatch].letraActual == null` |
| `esExamenFinalizado` | `patch.fase === "finalizado"` o `evento === "examen_finalizado"` |

**Tabla `contextoVoz`:** ver `comunicacion-comun.md`.

---

## Orden de invocación (servidor)

| Agente | Depende de |
|--------|------------|
| Intérprete | `estadoAntes`, respuesta del paciente |
| Protocolo | `estadoTrasRegistro`, interpretación |
| Auditor | propuesta del protocolo (VistaAuditor = VistaProtocolo + propuesta) |
| Comunicación | propuesta del protocolo (`VistaComunicacion`), **no** del veredicto del auditor |

Implementación (`pipelineTurno.js`): tras `ejecutarProtocolo` intento 0, `ejecutarAuditor` y `ejecutarComunicacion` en `Promise.all`. Si el auditor rechaza, la salida de comunicación del intento 0 no se usa; en reintento, comunicación se invoca de forma secuencial tras el auditor.

---

## Trazabilidad

- `estadoExamen` completo en memoria con `historial`.
- `registrarTurnoHistorial`, `generarRegistroCsv`, `/api/examen/detalle` usan estado completo, no vistas.
- Introspección/debug: `snapshotEstadoExamen()` (no usar en `agents/`).
- **User prompts LLM:** por turno, `historial[].llmPrompts` (opción B, `lib/llmPrompts.js` + `pipelineTurno.js`). Misma cadena que `construirUser()` en cada `agents/*.js`; no persiste system prompt. Control: `PIPELINE_GUARDAR_PROMPTS`.

---

## Anti-tentación

- Sin alias `ojoActivo` / `ojoContrario`.
- Sin pre-computar la rama clínica (eso sería “camino 3”, fuera de este plan).
---

_Nota: los planes de implementación de vistas (`PLAN_VISTAS_AGENTES.md`) fueron archivados en `docs/historial/` (2026-05-28)._
