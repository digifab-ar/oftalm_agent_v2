# Plan de implementación — Bootstrap del examen como turno explícito

**Versión:** 0.1
**Fecha:** 2026-05-19
**Estado:** Implementado (2026-05-19)
**Relacionado con:** [DISENO_AGENTE_INTERMEDIO.md](./DISENO_AGENTE_INTERMEDIO.md) §3 (pipeline multi-agente), `reference/foroptero-orchestrator/`

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Problema y causa raíz](#2-problema-y-causa-raíz)
3. [Principios de diseño](#3-principios-de-diseño)
4. [Decisiones pendientes](#4-decisiones-pendientes)
5. [Arquitectura objetivo](#5-arquitectura-objetivo)
6. [Inventario de cambios por archivo](#6-inventario-de-cambios-por-archivo)
7. [Fases de implementación](#7-fases-de-implementación)
8. [Criterios de aceptación y pruebas](#8-criterios-de-aceptación-y-pruebas)
9. [Validación de escalabilidad (fases futuras)](#9-validación-de-escalabilidad-fases-futuras)
10. [Riesgos y mitigaciones](#10-riesgos-y-mitigaciones)
11. [Referencias](#11-referencias)

---

## 1. Resumen ejecutivo

Al iniciar el examen, la frase del paciente "iniciar" produjo un fallback ciego ("No llegué a entender bien la letra") porque el bootstrap clínico del examen (setear `H@0.3`, ojo R abierto con RX, ojo L ocluido, TV con letra H) está delegado a tres LLMs en serie sin un disparador determinístico. La fricción desaparece sólo cuando el paciente, por azar, dice "iniciar test" en lugar de "iniciar".

Este plan introduce el **turno bootstrap** como un modo explícito del pipeline: el orquestador lo dispara cuando detecta estado clínico vacío en el ojo activo de la fase actual, y los cuatro agentes lo procesan según reglas del knowledge clínico ya existente.

**Cambios principales:**

| Capa | Cambio |
|------|--------|
| **Pipeline** | Detecta `modo: bootstrap` por estado clínico vacío; lo pasa como contexto a los agentes |
| **Prompts** | Reglas explícitas de bootstrap en intérprete, protocolo, auditor |
| **Knowledge** | Refuerzo del caso "primer turno con estado clínico vacío" en protocolo y auditor |
| **Realtime agent** | Refuerzo del contrato "primer call sin parámetros al arrancar" |
| **Endpoints** | Sin cambios de contrato. `/api/examen/turno` resuelve el bootstrap automáticamente |

**Esfuerzo orientativo:** 0.5–1 día de desarrollo + pruebas E2E con orquestador.

**Escalabilidad:** el patrón es fase-agnóstico. Al agregar futuras fases (comparación de lentes, etc.), basta con que cada knowledge clínico documente sus reglas de "Inicio del test"; el pipeline ya sabe disparar el bootstrap.

---

## 2. Problema y causa raíz

### 2.1 Síntoma observado

Traza real (2026-05-18) del primer turno del examen:

```text
respuestaPaciente: "iniciar"
→ intérprete: clasificación "continuacion"
→ protocolo: propuesta (no aprobada)
→ auditor: rechazado — "No se envía acción de foróptero al iniciar el ojo R con logmarActual 0.3 y letraActual 'H'"
→ pipeline: fallback "No llegué a entender bien la letra. ¿Podés repetir el nombre de la letra que ves en la pantalla?"
```

Pero `estadoAntes` en ese turno tenía `logmarActual: null` y `letraActual: null`. El auditor alucinó la pre-condición. **El paciente, además, recibe un mensaje incoherente: no hay letra en pantalla todavía.**

El turno siguiente con "iniciar test" funciona correctamente: el intérprete clasifica `frase_paciente_no_clinica`, el protocolo emite `evento: inicio_ojo` con patch + acciones MQTT, el auditor aprueba.

### 2.2 Cadena causal

```text
POST /api/examen/nuevo
  → inicializarExamen() crea estado con letraActual:null, logmarActual:null
  → ningún MQTT, ningún mensaje
  ↓
RealtimeAgent arranca
  → (por instrucción) debe llamar consultarExamen() sin parámetros
  → en la práctica, el LLM Realtime puede saltearse el paso o
    el paciente puede hablar primero
  ↓
POST /api/examen/turno con respuestaPaciente:"iniciar"
  → pipeline (intérprete → protocolo → auditor)
  → tres LLMs deben inferir desde estado vacío que toca inicializar
  → si alguno se desalinea: fallback ciego
```

### 2.3 Causa raíz

> El bootstrap del examen es un evento clínico determinístico (siempre `H@0.3`, RX según paciente, oclusión contralateral) modelado como inferencia probabilística sobre tres LLMs sin un disparador explícito.

Cuatro asimetrías concretas convergen:

1. `inicializarExamen()` (`estadoExamen.js`) deja el estado clínico vacío. Toda la inicialización clínica queda colgada del LLM-protocolo del primer turno.
2. El prompt del intérprete (`prompts/interprete.md`) no cubre frases sociales con `letraActual: null`. Mismo input ("iniciar" vs "iniciar test") produce clasificaciones distintas.
3. El prompt del protocolo (`prompts/protocolo.md`) no tiene regla explícita de bootstrap, aunque el knowledge (`protocolo-agudeza-estado.md`) sí la tiene (sección *"Inicio del test por ojo"*).
4. El fallback de `pipelineTurno.js` asume que hay letra en pantalla cuando se gatilla. En bootstrap esto es falso y produce un mensaje incoherente.

### 2.4 Lo que **no** es la causa raíz

- **No es el agente Realtime.** Hace lo correcto al llamar `consultarExamen()` sin parámetros al arrancar. Si lo cumple, igual el pipeline puede fallar.
- **No es el knowledge clínico.** `protocolo-agudeza-estado.md` ya define exactamente cómo iniciar el ojo R.
- **No es una regla mal escrita en el auditor.** `auditoria-protocolo.md` no exige `H@0.3` en `estadoAntes`. La violación del turno 1 fue alucinación del LLM, no del knowledge.

---

## 3. Principios de diseño

| Principio | Justificación |
|-----------|---------------|
| **El protocolo es dueño del QUÉ clínico** | Define letra inicial, logMAR inicial, oclusión, RX, etc. Hoy y en futuras fases. |
| **El orquestador es dueño del CUÁNDO de scheduling** | Decide cuándo invocar al protocolo (por turno con respuesta, por estado vacío, por transición de fase). Sin decisiones clínicas. |
| **El bootstrap es un turno como cualquier otro** | Pasa por el mismo pipeline; cambia el contexto, no la arquitectura. |
| **Fase-agnóstico** | El patrón no asume "agudeza". Cuando exista "lentes" u otra fase, el mismo mecanismo aplica. |
| **Determinístico en el disparador, no en la decisión** | El servidor decide *cuándo* hay bootstrap; el LLM decide *qué* hacer (vía knowledge). |
| **Sin cambios de contratos públicos** | `/api/examen/nuevo` y `/api/examen/turno` mantienen su forma. |
| **Defensa en profundidad** | Auto-init silencioso, fallback diferenciado, prompts y knowledge alineados. |

---

## 4. Decisiones pendientes

Estas decisiones bloquean la implementación. Cada fila tiene la recomendación del equipo técnico; pendiente de confirmación.

| # | Decisión | Opciones | Recomendado | Confirmado |
|---|----------|----------|-------------|------------|
| D1 | **Dónde se ejecuta el bootstrap** | (a) síncrono en `/api/examen/nuevo` con MQTT y mensajes; (b) lazy en el primer `/api/examen/turno` | **(b) lazy** | ☑ |
| D2 | **Frase del paciente antes del bootstrap** (ej. "iniciar" como primera entrada) | (a) ignorar como contenido clínico, loguear en historial; (b) interpretar pero forzar `frase_paciente_no_clinica` | **(a) ignorar** | ☑ |
| D3 | **Cómo se transmite `modo: bootstrap`** | (a) campo extra en el `user` del prompt (sin tocar schemas); (b) campo nuevo en el JSON output del protocolo (cambia schema); (c) inferible solo desde `estadoAntes` | **(a) en user prompt** | ☑ |
| D4 | **Quién setea `fase`** | (a) `inicializarExamen()` (como hoy); (b) el protocolo en el patch del bootstrap | **(a) código** | ☑ |
| D5 | **Realtime: contrato del primer call sin parámetros** | (a) obligatorio y reforzado en prompt; (b) flexibilizado, el backend cubre cualquier orden | **(a) obligatorio** | ☑ |
| D6 | **`MAX_REINTENTOS_PROTOCOLO` en bootstrap** | (a) 1 (como hoy); (b) 2 solo para bootstrap | **(a) 1** | ☑ |
| D7 | **Fallback en bootstrap si LLM falla** | (a) `fallbackBootstrap` diferenciado con mensaje neutro + log error; (b) reutilizar `fallbackRepregunta` actual | **(a) separado** | ☑ |
| D8 | **Mantener auto-`inicializarExamen()` en `/api/examen/turno`** | (a) sí (líneas 177-179 de `server.js`); (b) eliminarlo, requerir `/api/examen/nuevo` explícito | **(a) sí** | ☑ |

---

## 5. Arquitectura objetivo

### 5.1 Diagrama

```text
┌─────────────────────────────────────────────────────────────┐
│ Cliente (Realtime / Frontend / testAgent)                   │
└──────────────┬──────────────────────────────────────────────┘
               │ POST /api/examen/nuevo  → crea memoria vacía
               │ POST /api/examen/turno  → ejecuta turno
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Orquestador (server.js + pipelineTurno.js)                  │
│                                                             │
│  1. detectarModoTurno(estado, respuestaPaciente):           │
│     - si ojo activo tiene letraActual=null,                 │
│       logmarActual=null → modo='bootstrap'                  │
│     - en otro caso → modo='respuesta'                       │
│                                                             │
│  2. invocar pipeline con `modo` como contexto extra         │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Pipeline (mismo flujo, contexto distinto)                   │
│                                                             │
│  modo='bootstrap':                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────┐  ┌────────┐  │
│  │ intérprete  │  │ protocolo   │  │ auditor │  │ comuni-│  │
│  │ (siempre    │→ │ inicio_ojo  │→ │ valida  │→ │ cación │  │
│  │ continuac.) │  │ + acciones  │  │ bootstr.│  │ inicio │  │
│  └─────────────┘  └─────────────┘  └─────────┘  └────────┘  │
│                                                             │
│  modo='respuesta': flujo actual sin cambios                 │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Contrato del `modo`

- **Tipo:** literal `'bootstrap' | 'respuesta'`.
- **Vive en:** contexto del `user` del prompt de cada agente. No en el schema de output.
- **Lo setea:** `pipelineTurno.js` antes de invocar al primer agente.
- **Lo usan:** intérprete (clasificación forzada), protocolo (regla de inicio), auditor (checklist específico), comunicación (informativo, ya distingue `evento: inicio_ojo`).

### 5.3 Reglas por modo

| Agente | `modo='bootstrap'` | `modo='respuesta'` |
|--------|---------------------|---------------------|
| **intérprete** | clasificación forzada a `continuacion`, ignora texto del paciente | flujo actual |
| **protocolo** | aplica sección *"Inicio del test por ojo"* del knowledge → `evento: inicio_ojo` + patch + acciones MQTT | flujo actual |
| **auditor** | valida que el patch inicialice el ojo y que las acciones incluyan foróptero + TV H@0.3 | flujo actual |
| **comunicación** | `contextoVoz: inicio`, plantilla "Mirá la pantalla. Decime qué letra ves." | flujo actual |

### 5.4 Detección de bootstrap

```text
detectarModoTurno(estado):
  ojo = estado.ojoActual
  agudeza = estado.agudeza[ojo]
  si agudeza.letraActual == null AND agudeza.logmarActual == null AND agudeza.logmarFinal == null:
    return 'bootstrap'
  return 'respuesta'
```

**Por qué incluir `logmarFinal == null`:** evita disparar bootstrap si el ojo está cerrado (caso transición R→L, donde el ojo activo cambia a L con valores `null` pero no es bootstrap inicial — es transición, manejada por el flujo actual del protocolo).

> **Nota:** en la transición R→L el protocolo emite el patch con `ojoActual: L` y los valores iniciales de L en el mismo turno (ya documentado en knowledge). En ese turno, en el momento de la decisión, `estadoAntes` tiene `ojoActual: R` (todavía no cambió). Por eso la detección de bootstrap mira el ojo activo *de `estadoAntes`*, no del patch.

### 5.5 Manejo de respuesta del paciente en bootstrap (D2)

Si el paciente envía texto en `respuestaPaciente` y el sistema detecta `modo='bootstrap'`:

- La frase se **registra en el historial** (campo `respuestaPaciente` preservado para QA).
- **No se interpreta clínicamente:** el intérprete recibe el contexto bootstrap y devuelve `continuacion` sin mirar el texto.
- El protocolo procede al bootstrap normal.
- El paciente recibe el mensaje de bienvenida estándar; su frase "iniciar" queda como evento de log.

---

## 6. Inventario de cambios por archivo

### 6.1 Código

| Archivo | Cambio | Tipo |
|---------|--------|------|
| `pipelineTurno.js` | Agregar `detectarModoTurno()`. Pasar `modo` al construir prompts de cada agente. Si `modo='bootstrap'`, saltear el intérprete (forzar `clasificacion: continuacion`) o invocarlo con contexto. Bifurcar fallback en `fallbackBootstrap()` vs `fallbackRepregunta()` actual. | Refactor |
| `agents/interprete.js` | Aceptar parámetro `modo`. Si `bootstrap`, skip de OpenAI y retorno hardcoded `{clasificacion:'continuacion', letrasCandidatas:[], letraElegida:null, notasInterprete:'turno bootstrap'}`. | Refactor |
| `agents/protocolo.js` | Aceptar parámetro `modo`. Pasarlo en el user prompt como sección "## Modo del turno". | Aditivo |
| `agents/auditor.js` | Aceptar parámetro `modo`. Pasarlo en el user prompt como sección "## Modo del turno". | Aditivo |
| `agents/comunicacion.js` | Aceptar parámetro `modo` opcional. Pasarlo en el user prompt si está presente. | Aditivo |
| `orquestadorExamen.js` | Sin cambios (sigue siendo wrapper de `procesarTurnoPipeline`). | — |
| `estadoExamen.js` | **Sin cambios.** Sigue creando estado clínico vacío (D4). | — |
| `server.js` | Sin cambios estructurales (D8). Posible log de modo de turno para QA. | Mínimo |
| `ejecutarAcciones.js` | Sin cambios. | — |
| `agents/schemas.js` | Sin cambios (D3). | — |
| `lib/llmClient.js` | Sin cambios. | — |
| `lib/agentModels.js` | Sin cambios. | — |

### 6.2 Prompts

| Archivo | Cambio |
|---------|--------|
| `prompts/interprete.md` | Agregar sección "## Modo bootstrap" → "Si el user incluye `modo: bootstrap`, devolvé `clasificacion: continuacion` sin mirar `respuestaPaciente`." |
| `prompts/protocolo.md` | Agregar sección "## Modo bootstrap" → "Si el user incluye `modo: bootstrap`, aplicá la sección *Inicio del test por ojo* del knowledge: `evento: inicio_ojo`, patch con `logmarActual: 0.3`, `letraActual: H`, `letrasUsadas: ['H']`, contadores en 0; acciones = foróptero (ojo activo abierto con RX, contralateral ocluido) + TV H@0.3." |
| `prompts/auditor.md` | Agregar sección "## Modo bootstrap" → "Si el user incluye `modo: bootstrap`, validá: (a) patch inicializa ojo activo según *Inicio del test por ojo*; (b) acciones incluyen foróptero válido + TV H@0.3; (c) `evento: inicio_ojo`. Rechazar si falta alguno." |
| `prompts/comunicacion.md` | Sin cambio obligatorio. Eventual: confirmar que `evento: inicio_ojo` → `contextoVoz: inicio` con plantilla de primera letra. |

### 6.3 Knowledge

| Archivo | Cambio |
|---------|--------|
| `knowledge/protocolo-agudeza-estado.md` | Reforzar sección *"Inicio del test por ojo"* con: "Este patrón se aplica cuando el orquestador indica `modo: bootstrap` (estado clínico vacío del ojo activo)." Sin reescribir reglas. |
| `knowledge/auditoria-protocolo.md` | Agregar al checklist obligatorio: "Si `modo: bootstrap` en input: validar patch + acciones contra *Inicio del test por ojo* del knowledge del protocolo. Anti-patrón: aprobar bootstrap sin acciones MQTT o sin patch que setee `H@0.3`." |
| `knowledge/interpretacion-paciente.md` | Sin cambio obligatorio (la regla queda en prompt). Eventual: nota "En modo bootstrap, el texto del paciente no se interpreta." |
| `knowledge/comunicacion-paciente.md` | Sin cambio obligatorio. Eventual: confirmar `contextoVoz: inicio` para `evento: inicio_ojo` del primer ojo. |
| `knowledge/dispositivos.md` | Sin cambio. |

### 6.4 Agente Realtime

| Archivo | Cambio |
|---------|--------|
| `src/app/agentConfigs/chatSupervisor/index.ts` | Reforzar en `INSTRUCCIONES_BASE_CHATAGENT` el contrato "Al arrancar, llamá `consultarExamen` una vez sin parámetros y decí los mensajes recibidos". Explicitar: si el paciente habla antes, igual hay que llamar primero sin parámetros (no enviar la frase como `respuestaPaciente`). El backend cubre el caso, pero el contrato del Realtime se mantiene firme. |

### 6.5 Tests y docs

| Archivo | Cambio |
|---------|--------|
| `testAgent.js` | Agregar escenarios: (a) flujo limpio actual; (b) bootstrap con paciente que habla primero; (c) bootstrap puro `nuevo()` + `turno()` sin params. |
| `reference/foroptero-orchestrator/README.md` | Documentar el "turno bootstrap" como concepto. Actualizar diagrama del pipeline. |
| `reference/DISENO_AGENTE_INTERMEDIO.md` | Si menciona el flujo de inicio: actualizar para reflejar el modo de turno. |

---

## 7. Fases de implementación

### Fase 1 — Detección y enrutamiento del modo (backend)

**Objetivo:** que `pipelineTurno.js` detecte `modo` y lo propague a los agentes.

**Tareas:**

1. Implementar `detectarModoTurno(estado)` en `pipelineTurno.js`.
2. Refactor de `procesarTurnoPipeline()` para calcular `modo` antes del intérprete.
3. Modificar firma de `ejecutarInterprete`, `ejecutarProtocolo`, `ejecutarAuditor` (y opcionalmente `ejecutarComunicacion`) para aceptar `{ modo }`.
4. En modo bootstrap, **saltear** la llamada al intérprete y devolver clasificación hardcoded (ahorra una llamada LLM por bootstrap).
5. En modo bootstrap, pasar el contexto en el `user` de protocolo y auditor.
6. Agregar `fallbackBootstrap()` con mensaje neutro y sin acciones.
7. Log de modo y de eventos QA.

**Salida de fase:** pipeline ejecuta bootstrap correctamente con prompts/knowledge actuales sin reglas nuevas (test manual).

### Fase 2 — Prompts y knowledge

**Objetivo:** anclar el comportamiento de bootstrap en los prompts y knowledge para que el LLM no improvise.

**Tareas:**

1. Editar `prompts/protocolo.md` con sección "## Modo bootstrap".
2. Editar `prompts/interprete.md` con sección "## Modo bootstrap" (aunque se skipee, conviene documentarlo).
3. Editar `prompts/auditor.md` con sección "## Modo bootstrap".
4. Editar `knowledge/protocolo-agudeza-estado.md`: nota cruzada con el modo.
5. Editar `knowledge/auditoria-protocolo.md`: checklist específico para bootstrap.

**Salida de fase:** comportamiento determinístico en bootstrap. Repetir 10 corridas del escenario y verificar que las 10 emiten `inicio_ojo` + acciones MQTT correctas.

### Fase 3 — Agente Realtime

**Objetivo:** asegurar el contrato del primer call sin parámetros y manejar el caso "paciente habla primero".

**Tareas:**

1. Editar `INSTRUCCIONES_BASE_CHATAGENT` en `src/app/agentConfigs/chatSupervisor/index.ts`.
2. Verificar en QA real que la voz cumple el contrato.

**Salida de fase:** primer turno siempre llega al backend sin `respuestaPaciente`.

### Fase 4 — Tests automatizados

**Objetivo:** cobertura del bootstrap en `testAgent.js`.

**Tareas:**

1. Agregar test `bootstrapLimpio()`: `nuevo()` → `turno()` sin params → verificar estado clínico inicializado + acciones MQTT publicadas + mensaje `inicio`.
2. Agregar test `bootstrapConFraseSocial()`: `nuevo()` → `turno('iniciar', 0.9)` → verificar bootstrap correcto + frase logueada como `respuestaPaciente`.
3. Agregar test `bootstrapSinNuevo()`: `turno()` sin params (sin haber llamado `/nuevo`) → verificar auto-init + bootstrap.

**Salida de fase:** tres escenarios verdes.

### Fase 5 — Documentación

**Objetivo:** dejar la decisión escrita para futuras fases del examen.

**Tareas:**

1. Actualizar `reference/foroptero-orchestrator/README.md`.
2. Actualizar `reference/DISENO_AGENTE_INTERMEDIO.md` con la sección "Modos de turno".
3. Cerrar este plan con `Estado: Implementado`.

**Salida de fase:** documentación coherente.

---

## 8. Criterios de aceptación y pruebas

### 8.1 Criterios funcionales

| ID | Criterio | Cómo verificar |
|----|----------|----------------|
| AC1 | Tras `POST /api/examen/nuevo` + `POST /api/examen/turno` sin parámetros, el estado del ojo R queda con `logmarActual: 0.3`, `letraActual: 'H'`, `letrasUsadas: ['H']` | `GET /api/examen/detalle` |
| AC2 | En el mismo flujo, se publican dos comandos MQTT: foróptero (R abierto con RX, L ocluido) y TV (H @ 0.3) | logs MQTT del servidor + estado del dispositivo |
| AC3 | El mensaje al paciente del bootstrap es "Mirá la pantalla. Decime qué letra ves." con `contextoVoz: inicio` | respuesta JSON del `/turno` |
| AC4 | Si el paciente envía `respuestaPaciente: "iniciar"` (o similar) como primer turno, el bootstrap se ejecuta igual y la frase se loguea en `historial[0].respuestaPaciente` | `GET /api/examen/detalle` |
| AC5 | El segundo turno con `respuestaPaciente: "veo una hache"` clasifica como `correcta` y baja a `0.2` | `GET /api/examen/detalle` |
| AC6 | El auditor **nunca** rechaza el turno bootstrap por "falta foróptero con H@0.3" si el patch propuesto lo incluye | `historial[0].auditoria.aprobado === true` |
| AC7 | Si OpenAI devuelve error en el bootstrap, el endpoint responde con `ok:false` + mensaje neutro de error; no se publica MQTT inconsistente | test con `OPENAI_API_KEY` inválida |

### 8.2 Criterios no-funcionales

| ID | Criterio | Cómo verificar |
|----|----------|----------------|
| ANF1 | El bootstrap **no agrega más de una llamada LLM** respecto al turno actual (skip de intérprete compensa el costo) | conteo de llamadas en logs |
| ANF2 | El bootstrap se ejecuta en menos de 3 s en condiciones normales | medición de latencia E2E |
| ANF3 | El pipeline mantiene los contratos públicos: `/api/examen/nuevo` y `/api/examen/turno` aceptan los mismos cuerpos y devuelven los mismos campos | smoke test de contratos |

### 8.3 Pruebas de regresión

| ID | Caso |
|----|------|
| R1 | Flujo completo R→L con doble confirmación: bootstrap → 2 correctas en 0.3 (cierra R) → bootstrap implícito de L → 2 correctas → `fase: finalizado`. |
| R2 | Bootstrap → respuesta `ambigua` → repregunta sin cambio. La letra en pantalla sigue siendo H. |
| R3 | Bootstrap → respuesta `no_ve` → subida (sin sentido porque ya está en 0.3, debería rotar letra). |
| R4 | Dos llamadas seguidas a `/api/examen/nuevo`: el segundo reinicia y el siguiente turno hace bootstrap de nuevo. |

---

## 9. Validación de escalabilidad (fases futuras)

Este plan se justifica porque escala. Cuando se agreguen fases adicionales al examen, los cambios necesarios serán:

| Componente | Cambio para nueva fase (ej. "lentes") |
|------------|----------------------------------------|
| `estadoExamen.js` | Agregar sub-estructura de estado para la fase (igual que `agudeza`) |
| `knowledge/protocolo-lentes-estado.md` | Nuevo archivo, sección *"Inicio del test"* con valores iniciales propios |
| `prompts/protocolo.md` | Extender sección de modo bootstrap con la nueva fase |
| `pipelineTurno.js`/`detectarModoTurno()` | Extender detección: "ojo activo de la fase actual tiene campos clínicos vacíos" — la lógica de detección permanece, cambia qué se mira por fase |
| Agente Realtime | Sin cambios |
| Endpoints | Sin cambios |

**Lo que no cambia con nuevas fases:** la arquitectura de modos, los schemas, la pipeline, los endpoints, el agente Realtime.

**Transiciones entre fases (ej. cierre agudeza + inicio lentes):** se mantienen como hoy las transiciones R→L: el protocolo las emite en un turno con respuesta del paciente, en el mismo turno donde se cierra la fase anterior. El "bootstrap puro" solo aplica al primer arranque del examen.

---

## 10. Riesgos y mitigaciones

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|--------------|------------|
| El LLM del protocolo ignora la regla de bootstrap del prompt | Bootstrap incompleto | Media | Knowledge reforzado + auditor con checklist específico + log de QA |
| El LLM Realtime se salta el call sin parámetros | Paciente habla primero | Baja | Backend cubre el caso (D2 = ignorar texto en bootstrap); prompt Realtime reforzado |
| OpenAI cae durante bootstrap | Examen no arranca | Baja | `fallbackBootstrap` con mensaje neutro + retry manual del frontend |
| MQTT broker desconectado durante bootstrap | Letra no aparece en TV | Baja | `ejecutarAcciones` reporta error; el estado se aplica igual; siguiente turno puede reintentar dispositivos |
| Doble bootstrap accidental (dos `/nuevo` seguidos) | Estado se resetea | Baja (esperado) | Comportamiento documentado: `/nuevo` reinicia siempre |
| Tests no cubren caso real del Realtime | Bugs en producción | Media | QA manual con voz real obligatorio en Fase 3 |

---

## 11. Referencias

- [DISENO_AGENTE_INTERMEDIO.md](./DISENO_AGENTE_INTERMEDIO.md) §3 — pipeline multi-agente.
- [ARQUITECTURA_ENDPOINTS.md](./ARQUITECTURA_ENDPOINTS.md) — contratos de `/api/examen/*`.
- `reference/foroptero-orchestrator/pipelineTurno.js` — flujo actual.
- `reference/foroptero-orchestrator/estadoExamen.js` — inicialización de memoria.
- `reference/foroptero-orchestrator/knowledge/protocolo-agudeza-estado.md` §"Inicio del test por ojo" — reglas clínicas existentes.
- `reference/foroptero-orchestrator/knowledge/auditoria-protocolo.md` — checklist del auditor.
- `src/app/agentConfigs/chatSupervisor/index.ts` — contrato del agente Realtime.
- Traza de fricción observada el 2026-05-18 (turno 1 con `respuestaPaciente: "iniciar"`, fallback ciego). Disponible en `historial` del examen `iniciado: 1779140010235`.
