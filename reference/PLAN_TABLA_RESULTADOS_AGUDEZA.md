# Plan de implementación — Tabla de resultados logMAR (servidor) + protocolo LLM

**Versión:** 0.1  
**Fecha:** 2026-05-19  
**Estado:** Implementado (2026-05-19) — G1–G3 en orquestador; G4 E2E manual pendiente  
**Relacionado con:** [PLAN_BOOTSTRAP_EXAMEN.md](./PLAN_BOOTSTRAP_EXAMEN.md), [PLAN_MITIGACION_PIPELINE_Y_ESCALA_FASES.md](./PLAN_MITIGACION_PIPELINE_Y_ESCALA_FASES.md), `reference/foroptero-orchestrator/`

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Decisiones de diseño confirmadas](#2-decisiones-de-diseño-confirmadas)
3. [Problema que resuelve](#3-problema-que-resuelve)
4. [Arquitectura objetivo](#4-arquitectura-objetivo)
5. [Modelo de datos](#5-modelo-de-datos)
6. [Contrato del servidor (registro, sin decisión)](#6-contrato-del-servidor-registro-sin-decisión)
7. [Rol del agente protocolo (decisión + patch)](#7-rol-del-agente-protocolo-decisión--patch)
8. [Pipeline por turno (un solo ciclo paciente)](#8-pipeline-por-turno-un-solo-ciclo-paciente)
9. [Auditor y comunicación](#9-auditor-y-comunicación)
10. [Fases de implementación](#10-fases-de-implementación)
11. [Criterios de aceptación](#11-criterios-de-aceptación)
12. [Riesgos y mitigaciones](#12-riesgos-y-mitigaciones)
13. [Fuera de alcance](#13-fuera-de-alcance)
14. [Referencias](#14-referencias)

---

## 1. Resumen ejecutivo

Hoy el agente **protocolo** debe, en un solo JSON, **simular contadores**, **elegir rama del árbol**, **calcular logMAR**, **elegir letra** y **escribir el patch**. Los logs de agudeza muestran fallos en ramas y en `aciertosPorLogmar` (contadores en cero o reseteados), con bucles 0.1↔0.2 y cierre R→L que no dispara.

Este plan introduce una **tabla de resultados por logMAR** mantenida por el **servidor** (código en `estadoExamen`, no un LLM):

- Tras el **intérprete**, el pipeline registra el intento (**correcto** / **incorrecto** por nivel logMAR) de forma **determinista e idempotente**.
- El servidor **no decide** el siguiente estímulo ni el cierre; solo devuelve la tabla actualizada.
- El **protocolo (LLM)** lee esa tabla, aplica el árbol clínico, elige la **letra** del siguiente optotipo y emite `estadoPatch` + `acciones` + `evento`.
- En cierre por **≥ 2 correctos** en el mismo logMAR, el protocolo setea solo **`logmarFinal`** por ojo (no `letraFinal`).

Todo ocurre en **un único turno de paciente** (sin esperar una segunda respuesta entre registro y MQTT).

---

## 2. Decisiones de diseño confirmadas

| ID | Decisión | Implicación |
|----|----------|-------------|
| **D1** | Un solo turno paciente entre registro y TV | `registrarIntento` es **síncrono** dentro de `procesarTurnoPipeline`, antes de `ejecutarProtocolo`, en el mismo request HTTP. |
| **D2** | Tabla incluye **correctos e incorrectos** por logMAR | Nuevo shape `resultadosPorLogmar`; reemplaza o convive con `aciertosPorLogmar` (ver §5). |
| **D3** | La **letra** la elige el **LLM** (protocolo) | El servidor no devuelve `letraSiguiente`; solo contadores. |
| **D4** | Idempotencia: **`respuestaPaciente` + `timestamp`** | Clave de intento; reintentos de red o pipeline no duplican contadores. |
| **D5** | El **servidor no toma decisiones clínicas**; el **cierre lo hace el LLM** | Tras registrar, el protocolo ve `correcto: 2` en un nivel y emite cierre + `logmarFinal`; **`letraFinal` no se usa** (omitir o siempre `null`). |
| **D6** | Calidad del **intérprete** es responsabilidad aparte | Errores de clasificación se corrigen en su agente/prompt; este plan no bloquea por ello. |

---

## 3. Problema que resuelve

| Síntoma (log 2026-05-19) | Causa | Cómo lo mitiga este plan |
|--------------------------|-------|---------------------------|
| Rama 3 vs 4 (no baja logMAR) | LLM calcula mal | Protocolo lee tabla ya incrementada; razonamiento sobre `correcto` literal |
| `aciertosPorLogmar` en 0 tras aciertos | LLM omite contadores en patch | Servidor es único escritor de contadores |
| Bucle 0.1 ↔ 0.2 | Contadores no reflejan 2.º acierto en 0.2 | Tabla muestra `0.2.correcto: 2` → protocolo debe cerrar R |
| Patch resetea contadores en `no_ve` | LLM reescribe bloque completo | Protocolo **prohibido** de incluir `resultadosPorLogmar` en patch |
| Turno perdido tras rechazo auditor | Fallback sin MQTT | Sigue existiendo; tabla ya registrada → riesgo de desync si fallback no revierte registro (ver §12) |

---

## 4. Arquitectura objetivo

### 4.1 Diagrama de secuencia (modo `respuesta`)

```text
Paciente / STT
    │ respuestaPaciente + confianza + timestamp (turno)
    ▼
┌──────────────────────────────────────────────────────────────┐
│ pipelineTurno (UN request)                                    │
│                                                               │
│  estadoAntes ← obtenerEstadoParaOrquestador()                 │
│       │                                                       │
│       ▼                                                       │
│  intérprete(estadoAntes, respuesta, confianza)               │
│       → interpretacion { clasificacion, letraElegida, ... }   │
│       │                                                       │
│       ▼                                                       │
│  registrarIntentoAgudeza({                                    │
│    estadoAntes, interpretacion,                               │
│    respuestaPaciente, timestamp,                              │
│    estimulo: { ojo, logmar, letra }  ← literal estadoAntes    │
│  })  ──────────► SERVIDOR (JS determinista)                   │
│       → estadoTrasRegistro (tabla actualizada)                │
│       │                                                       │
│       ▼                                                       │
│  protocolo(estadoTrasRegistro, interpretacion)  [LLM]         │
│       → estadoPatch, acciones, evento                         │
│       │                                                       │
│       ▼                                                       │
│  auditor(estadoTrasRegistro, interpretacion, propuesta)       │
│       │                                                       │
│       ▼                                                       │
│  comunicacion(...)                                            │
│       │                                                       │
│       ▼                                                       │
│  aplicarEstadoPatch (solo campos protocolo)                   │
│  ejecutarAcciones (TV / foróptero)                            │
└──────────────────────────────────────────────────────────────┘
    ▼
Paciente ve nuevo estímulo + mensaje de voz (mismo turno)
```

### 4.2 División de responsabilidades

| Responsable | Qué hace | Qué no hace |
|-------------|----------|-------------|
| **Intérprete** | `clasificacion`, `letraElegida` | Contadores, logMAR, MQTT |
| **Servidor (`registrarIntento`)** | Incrementar `correcto` o `incorrecto` en el logMAR del **estímulo actual**; idempotencia | Bajar/subir logMAR, elegir letra, cierre, MQTT |
| **Protocolo (LLM)** | Leer tabla; decidir rama; `logmarActual`, `letraActual`, `letrasUsadas`, `logmarFinal`, `ojoActual`, `fase`; `acciones` + `evento` | Escribir / resetear contadores en patch |
| **Auditor** | Validar coherencia propuesta vs tabla + reglas de transición | Re-clasificar paciente |
| **Comunicación** | Mensajes según `evento` | Estado clínico |

---

## 5. Modelo de datos

### 5.1 Reemplazo de `aciertosPorLogmar`

Por ojo (`agudeza.R` / `agudeza.L`):

```json
"resultadosPorLogmar": {
  "0.3": { "correcto": 0, "incorrecto": 0 },
  "0.2": { "correcto": 0, "incorrecto": 0 },
  "0.1": { "correcto": 0, "incorrecto": 0 },
  "0.0": { "correcto": 0, "incorrecto": 0 }
}
```

**Regla de lectura para el protocolo (equivalente al árbol actual):**

- Cierre en el ojo activo: `resultadosPorLogmar[logmarActual].correcto >= 2` **después** del registro del turno (es decir, el servidor ya incrementó si fue `correcta`).
- “Primer acierto en este nivel” (bajar logMAR): tras registro, `correcto === 1` en el logMAR del estímulo y `logmarActual > 0.0`.
- Los **incorrectos** son informativos y para QA; **no** resetean correctos (acumulación como hoy).

### 5.2 Migración

| Fase implementación | Estrategia |
|---------------------|------------|
| Fase 1 | Introducir `resultadosPorLogmar`; en bootstrap inicializar en 0; mantener `aciertosPorLogmar` como espejo derivado (`correcto` solo) para CSV/historial legacy, o deprecar en documentación |
| Fase 2 | Eliminar `aciertosPorLogmar` del patch schema y prompts |

### 5.3 Campos que sigue escribiendo el protocolo en el patch

| Campo | ¿En patch? |
|-------|------------|
| `logmarActual`, `letraActual`, `letrasUsadas` | Sí |
| `logmarFinal` | Sí, solo al **cierre** del ojo (valor = logMAR donde `correcto >= 2`) |
| `letraFinal` | **No** (D5) |
| `resultadosPorLogmar` | **No** — solo servidor |
| `ojoActual`, `fase` | Sí, en transición R→L o fin examen |

### 5.4 Idempotencia (D4)

```text
intentId = hash( respuestaPaciente_normalizada + "|" + timestamp_turno )
```

- Guardar `intentId` en `historial[]` o set `intentosRegistrados[]` en memoria de examen.
- Si `registrarIntento` recibe un `intentId` ya visto → devolver la **misma tabla** sin incrementar.
- El `timestamp` lo provee el cliente (Realtime) en el body de `/api/examen/turno` o lo genera el servidor al recibir el request (documentar una sola fuente).

---

## 6. Contrato del servidor (registro, sin decisión)

### 6.1 Función (conceptual)

```text
registrarIntentoAgudeza({
  ojo,
  logmarEstimulo,      // estadoAntes.agudeza[ojo].logmarActual
  letraEstimulo,       // estadoAntes.agudeza[ojo].letraActual
  clasificacion,       // interpretacion.clasificacion
  respuestaPaciente,
  timestamp
}) → {
  resultadosPorLogmar,  // tabla completa del ojo
  intentId,
  duplicado: boolean
}
```

**No** devuelve: `siguiente`, `bajar`, `subir`, `letra`, `evento`.

### 6.2 Reglas de incremento (deterministas)

| `clasificacion` | Incremento en `logmarEstimulo` |
|-----------------|--------------------------------|
| `correcta` | `correcto += 1` |
| `incorrecta` | `incorrecto += 1` |
| `no_ve` | `incorrecto += 1` (mismo nivel del estímulo; D2) |
| `ambigua`, `confianza_baja` | **Sin cambio** en tabla |
| `continuacion` (bootstrap) | No se llama registro en ese turno |

**Prohibido:** decrementar cualquier contador; resetear fila; tocar el ojo no activo.

### 6.3 Entrada atada al estímulo, no a la letra dicha

El registro usa **`logmarEstimulo` y `letraEstimulo` de `estadoAntes`**, no valores inferidos por el protocolo. Así se evita POST con logMAR erróneo (ej. “i” registrada en 0.2 cuando en pantalla era 0.1).

---

## 7. Rol del agente protocolo (decisión + patch)

### 7.1 Input al LLM (cambio respecto a hoy)

Además de `interpretacion`, el user incluye:

```markdown
## Estado tras registro del intento (fuente de verdad de contadores)
```json
{ ... estadoTrasRegistro ... }
```

Los contadores en `resultadosPorLogmar` ya incluyen este turno. **No simules +1**: leé los valores literales.
```

### 7.2 Árbol de decisión (sigue en LLM)

Orden (igual que `protocolo-agudeza.md`, renombrar ramas en prompt):

1. Si `ambigua` / `confianza_baja` → patch vacío, `repregunta_sin_cambio` (sin registro previo o registro sin cambio).
2. Si `correcta` → mirar `resultadosPorLogmar[logmarDelEstímulo].correcto`:
   - `>= 2` → cierre ojo activo; si R → transición L; patch con **`logmarFinal`** = ese logMAR; **sin** `letraFinal`.
   - `=== 1` y logMAR > 0.0 → bajar un paso; letra Sloan (LLM); `tv`.
   - `=== 1` y logMAR === 0.0 → rotar letra en 0.0; `tv`.
3. Si `incorrecta` / `no_ve` → subir un paso (o rotar en 0.3); letra (LLM); `tv`; **no** incluir `resultadosPorLogmar` en patch.

### 7.3 Ejemplo narrativo (camino feliz)

| Paso | Pantalla | Paciente | Intérprete | Tras registro (servidor) | Protocolo |
|------|----------|----------|------------|--------------------------|-----------|
| 1 | O @ 0.3 | “veo una o” | correcta | `0.3.correcto:1` | Bajar → E @ 0.2 (letra LLM) |
| 2 | E @ 0.2 | “veo una e” | correcta | `0.2.correcto:1` | Bajar → T @ 0.1 |
| 3 | T @ 0.1 | “veo una i” | incorrecta | `0.1.incorrecto:1` | Subir → E @ 0.2 |
| 4 | E @ 0.2 | “veo una e” | correcta | `0.2.correcto:2` | Cierre R: `logmarFinal:0.2`, L H@0.3 |

---

## 8. Pipeline por turno (un solo ciclo paciente)

### 8.1 Orden estricto (D1)

```text
1. estadoAntes
2. intérprete
3. registrarIntento  → muta resultadosPorLogmar en memoria
4. estadoTrasRegistro = { ...estadoAntes, agudeza[ojo].resultadosPorLogmar actualizado }
5. protocolo(estadoTrasRegistro, interpretacion)
6. auditor(estadoTrasRegistro, ...)
7. comunicacion
8. aplicarEstadoPatch + ejecutarAcciones
9. historial
```

### 8.2 Modo `bootstrap`

Sin cambio: no hay `registrarIntento`; intérprete hardcoded `continuacion`; protocolo `inicio_ojo`; inicializa `resultadosPorLogmar` en ceros.

### 8.3 Contrato API (extensión mínima)

`POST /api/examen/turno` body:

```json
{
  "respuestaPaciente": "veo una o",
  "confianza": 0.9,
  "timestamp": "2026-05-19T18:39:01.391Z"
}
```

Si falta `timestamp`, el servidor usa `Date.now()` del request (documentar para idempotencia en reintentos).

---

## 9. Auditor y comunicación

### 9.1 Auditor

- Compara contra **`estadoTrasRegistro`**, no `estadoAntes`.
- Rechaza si el patch incluye `resultadosPorLogmar` o `aciertosPorLogmar` con valores distintos a los del estado tras registro.
- Cierre: si tabla tiene `correcto >= 2` en logMAR X y clasificación fue `correcta`, exige `logmarFinal: X` y evento de cierre (R→L o fin L); **no** exige `letraFinal`.
- Sigue validando TV ↔ `logmarActual` / `letraActual` del patch.

### 9.2 Comunicación

Sin cambio estructural: depende de `evento` y si hubo `acciones`.

### 9.3 Fallback auditoría + tabla

**Riesgo:** si el auditor rechaza **después** de `registrarIntento`, la tabla ya incrementó pero no hay MQTT.

| Opción | Recomendación |
|--------|----------------|
| (a) Revertir registro en fallback | Complejo; requiere snapshot pre-intento |
| (b) No registrar hasta auditoría OK | **Rompe D1** (protocolo necesita tabla) |
| (c) Registrar siempre; fallback deja estímulo igual y mensaje neutro | **Recomendado para v1**: coherente con “el paciente acertó aunque falle el LLM”; siguiente turno puede continuar con tabla correcta |

Documentar (c) en operaciones: fallback clínico ≠ deshacer contador.

---

## 10. Fases de implementación

### Fase G0 — Especificación y fixtures (sin comportamiento)

| Tarea | Entregable |
|-------|------------|
| G0.1 | Este plan aprobado |
| G0.2 | Fixtures JSON: 8–10 turnos (log 2026-05-19 corregido) con `estadoAntes`, `interpretacion`, tabla esperada tras registro, patch esperado |
| G0.3 | Actualizar `protocolo-estado.md` / `auditoria.md`: `resultadosPorLogmar`, prohibición patch de contadores, sin `letraFinal` |

### Fase G1 — Servidor: registro determinista

| Tarea | Archivo(s) |
|-------|------------|
| G1.1 | `registrarIntentoAgudeza()` en `estadoExamen.js` o `lib/registroAgudeza.js` |
| G1.2 | Modelo `resultadosPorLogmar` en init bootstrap |
| G1.3 | Idempotencia `intentId` |
| G1.4 | Tests unitarios registro (correcta, incorrecta, ambigua, duplicado) |

**Salida:** función pura testeable sin LLM.

### Fase G2 — Pipeline: encadenar registro → protocolo

| Tarea | Archivo(s) |
|-------|------------|
| G2.1 | `pipelineTurno.js`: después de intérprete, llamar registro; construir `estadoTrasRegistro` |
| G2.2 | `agents/protocolo.js`: user con sección “Estado tras registro” |
| G2.3 | `POST /turno`: aceptar `timestamp` |
| G2.4 | `aplicarEstadoPatch`: merge que **no** pise `resultadosPorLogmar` si viniera en patch por error |

**Salida:** E2E manual un turno correcta con tabla incrementada y TV.

### Fase G3 — Prompts protocolo y auditor

| Tarea | Detalle |
|-------|---------|
| G3.1 | `protocolo-agudeza.md`: leer tabla literal; ramas CIERRE / BAJAR / SUBIR; prohibir contadores en patch; sin `letraFinal` |
| G3.2 | `auditoria.md`: validar contra `estadoTrasRegistro`; anti-patrón patch con contadores |
| G3.3 | Quitar checklist “simulá +1” del protocolo (ya no aplica) |

### Fase G4 — Validación E2E y regresión

| Escenario | Criterio |
|-----------|----------|
| Log corregido completo R | Sin bucle 0.1↔0.2; cierre R cuando `0.2.correcto:2` |
| Idempotencia | Mismo `respuestaPaciente`+`timestamp` dos veces → un solo incremento |
| Fallback auditoría | Tabla conservada; mensaje neutro |

### Fase G5 — Limpieza legacy

| Tarea | Detalle |
|-------|---------|
| G5.1 | Deprecar `aciertosPorLogmar` en prompts y CSV |
| G5.2 | Actualizar `PLAN_MITIGACION` §9: sacar “validador determinista” de fuera de alcance → **parcialmente implementado** en servidor |

---

## 11. Criterios de aceptación

| ID | Criterio |
|----|----------|
| AC-G1 | Tras `correcta` en O@0.3, `resultadosPorLogmar["0.3"].correcto === 1` **antes** de llamar al LLM protocolo |
| AC-G2 | El patch del protocolo **no** contiene `resultadosPorLogmar` ni resetea contadores |
| AC-G3 | Tras 2.ª `correcta` en mismo logMAR (ej. 0.2), protocolo emite `logmarFinal: 0.2` y cierre R→L; **`letraFinal` ausente o null** |
| AC-G4 | Un request `/turno` con respuesta válida termina con MQTT y mensaje de voz **sin** segundo request del paciente |
| AC-G5 | Reintento con mismo `respuestaPaciente`+`timestamp` no duplica contadores |
| AC-G6 | `incorrecta` en T@0.1 incrementa `0.1.incorrecto` y protocolo sube estímulo según árbol |
| AC-G7 | 10 corridas escenario cierre R→L: ≥9 cumplen AC-G3 |

---

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Desync tabla vs pantalla si fallback sin MQTT | Mensaje neutro; siguiente turno usa `estadoTrasRegistro` coherente con voz del paciente (D6 + operador) |
| LLM ignora tabla y simula contadores | Prompt + auditor rechaza patch con contadores; opcional post-check en código |
| `timestamp` distinto en reintento duplica intento | Cliente debe reenviar mismo timestamp; documentar en Realtime |
| Registro con clasificación errónea del intérprete | D6: fuera de alcance; tabla refleja intérprete |
| Letras agotadas (4 Sloan usadas) | Sigue en LLM (D3); definir en prompt política de reutilización |

---

## 13. Fuera de alcance

- Mejoras al agente intérprete (D6).
- Servidor que devuelve `siguiente` / `letraSiguiente` (D5).
- Persistencia multi-sesión / base de datos externa (tabla sigue en `estadoExamen` en memoria).
- Segundo turno paciente entre registro y TV (D1).
- `letraFinal` en informes clínicos.

---

## 14. Referencias

- Conversación y log agudeza 2026-05-19 (rama 3/4, contadores, bucle).
- `reference/foroptero-orchestrator/pipelineTurno.js`
- `reference/foroptero-orchestrator/knowledge/fases/agudeza/protocolo-estado.md`
- [PLAN_MITIGACION_PIPELINE_Y_ESCALA_FASES.md](./PLAN_MITIGACION_PIPELINE_Y_ESCALA_FASES.md) §9 (validador determinista → cubierto por Fase G1).

---

## Apéndice A — Comparación con plan de mitigación anterior

| Tema | PLAN_MITIGACION (v0.1) | Este plan |
|------|------------------------|-----------|
| Contadores | LLM en `estadoPatch` | Servidor en `registrarIntento` |
| Árbol logMAR | LLM + prompts largos | LLM lee tabla; servidor no decide |
| Validador en código | Fuera de alcance | **En alcance** (registro) |
| Letra siguiente | LLM | LLM (D3) |
| Cierre | LLM + `logmarFinal` + `letraFinal` | LLM + **`logmarFinal` solo** (D5) |

**Orden sugerido:** implementar **G1 → G2** antes de seguir alargando prompts del protocolo; Fase F pendiente del plan de mitigación se valida con escenarios de este plan.
