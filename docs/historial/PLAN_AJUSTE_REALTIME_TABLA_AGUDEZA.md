> **Archivo archivado** — movido a `docs/historial/` el 2026-05-28. Estado original: Implementado (2026-05-19)
> Ver [docs/ARQUITECTURA.md](../ARQUITECTURA.md) para la documentación vigente del sistema.

---

# Plan de acción — Ajuste agente Realtime (tabla logMAR + idempotencia)

**Versión:** 0.1  
**Fecha:** 2026-05-19  
**Estado:** Implementado (2026-05-19) — R1–R4 en `src/app/`; E2E manual (R5) pendiente  
**Relacionado con:** [PLAN_TABLA_RESULTADOS_AGUDEZA.md](./PLAN_TABLA_RESULTADOS_AGUDEZA.md) (D4, AC-G5, §8.3, §12), [PLAN_MIGRACION_REALTIME_GA.md](./PLAN_MIGRACION_REALTIME_GA.md), `src/app/agentConfigs/chatSupervisor/index.ts`

---

## Tabla de contenidos

1. [Objetivo](#1-objetivo)
2. [Diagnóstico (estado actual)](#2-diagnóstico-estado-actual)
3. [Decisiones de diseño](#3-decisiones-de-diseño)
4. [Alcance](#4-alcance)
5. [Fases de implementación](#5-fases-de-implementación)
6. [Criterios de aceptación](#6-criterios-de-aceptación)
7. [Pruebas](#7-pruebas)
8. [Riesgos](#8-riesgos)
9. [Documentación a actualizar](#9-documentación-a-actualizar)
10. [Fuera de alcance](#10-fuera-de-alcance)

---

## 1. Objetivo

Alinear el **agente Realtime** (frontend) con el orquestador ya implementado en [PLAN_TABLA_RESULTADOS_AGUDEZA.md](./PLAN_TABLA_RESULTADOS_AGUDEZA.md), en particular:

| Requisito del plan tabla | Qué debe hacer Realtime |
|--------------------------|-------------------------|
| **D4** — Idempotencia `respuestaPaciente` + `timestamp` | Enviar un `timestamp` **estable por utterance del paciente** en cada `POST /api/examen/turno` con respuesta clínica |
| **AC-G5** | Reintento HTTP con el **mismo** body no duplica contadores en `resultadosPorLogmar` |
| **§8.3** — Contrato API | Body: `{ respuestaPaciente, confianza, timestamp }` cuando hay respuesta del paciente |

El orquestador **ya acepta** `timestamp` (`server.js`, `pipelineTurno.js`). El gap está **solo en el cliente de voz**.

---

## 2. Diagnóstico (estado actual)

### 2.1 Qué ya está bien

| Aspecto | Estado |
|---------|--------|
| Tool `consultarExamen` → `POST /api/examen/turno` | Correcto |
| Solo envía datos lingüísticos (`respuestaPaciente`, `confianza`) | Correcto (D6 intérprete) |
| No envía clasificación clínica ni letra “corregida” | Correcto |
| Bootstrap: primer call sin parámetros | Correcto |
| `continuar_sin_respuesta`: call sin parámetros tras mensajes | Correcto |
| Respuesta filtrada al LLM (`pasos`, `contextoVoz` solamente) | Correcto — evita sesgar transcripción |
| Instrucciones: transcripción literal, confianza = audio | Correcto |

### 2.2 Brecha principal

En `chatSupervisor/index.ts`, el `execute` de `consultarExamen` arma:

```json
{ "respuestaPaciente": "...", "confianza": 0.9 }
```

**Sin `timestamp`.** El servidor, si falta, genera `new Date().toISOString()` **en cada request** (`pipelineTurno.js`). Consecuencias:

- Reintento de red tras timeout → segundo POST con **otro** timestamp → **segundo** incremento en `resultadosPorLogmar` (rompe AC-G5).
- Si el modelo Realtime invoca la tool dos veces en el mismo turno de usuario (comportamiento posible) → dos timestamps distintos → doble registro.

### 2.3 Contradicción interna en instrucciones

Las instrucciones actuales dicen explícitamente:

> Solo podés enviar **respuestaPaciente** y **confianza** (nada más)

Eso **impide** cumplir D4 si se delega el timestamp al LLM. La solución recomendada es generar `timestamp` en **código cliente**, no pedirlo al modelo (ver §3).

### 2.4 Documentación desalineada

| Documento | Problema |
|-----------|----------|
| `PLAN_MIGRACION_REALTIME_GA.md` | Afirma que `consultarExamen` **no requiere cambios** para la migración GA — ya no es cierto tras tabla logMAR |
| `DISENO_AGENTE_INTERMEDIO.md` §6.4 | No lista `timestamp` en el body de `/turno` |
| `PLAN_TABLA_RESULTADOS_AGUDEZA.md` §12 | Riesgo “documentar en Realtime” — **sin plan ejecutado** |

---

## 3. Decisiones de diseño

| ID | Decisión | Implicación |
|----|----------|-------------|
| **R-D1** | El **`timestamp` lo genera el frontend (código)**, no el LLM | El modelo **no** recibe `timestamp` como parámetro de tool; evita timestamps inventados o distintos por reintento del modelo |
| **R-D2** | Un timestamp por **utterance del paciente** (turno de voz), no por invocación HTTP | Se asigna al cerrar la transcripción del usuario (evento STT) o al inicio del bloque “paciente habló → tool”; se reutiliza en reintentos |
| **R-D3** | Formato **ISO 8601** (`2026-05-19T18:39:01.391Z`) | Coincide con ejemplo del plan tabla y con `buildIntentId` en servidor |
| **R-D4** | `timestamp` **solo** cuando hay `respuestaPaciente` | Bootstrap y `continuar_sin_respuesta` siguen con body vacío (sin registro de intento) |
| **R-D5** | Reintento HTTP en `execute` reutiliza el **mismo body** (incl. `timestamp`) | Máx. 1–2 reintentos con backoff corto; no generar nuevo timestamp en el retry |
| **R-D6** | Mantener regla “el LLM no envía clasificación clínica” | Solo se agrega campo técnico opaco en capa HTTP; instrucciones al modelo pueden decir “el sistema adjunta metadatos de turno automáticamente” sin pedir que lo rellene |

### 3.1 Opciones evaluadas

| Opción | Pros | Contras | Veredicto |
|--------|------|---------|-----------|
| **A.** Timestamp en parámetro de tool (LLM) | Simple de esquematizar | Modelo puede omitirlo, cambiarlo o regenerarlo | Rechazada |
| **B.** Timestamp en `execute` al llamar fetch (`Date.now()` cada vez) | Mínimo diff | Cada reintento = timestamp nuevo → no idempotente | Rechazada |
| **C.** Timestamp en ref al completar transcripción del usuario | Estable por utterance; reintentos seguros | Requiere enganchar evento STT o ciclo de turno | **Recomendada** |
| **D.** Hash determinista solo de `respuestaPaciente` sin timestamp | Sin estado | Dos respuestas iguales en turnos distintos colisionan | Rechazada |

### 3.2 Dónde guardar el timestamp (implementación futura)

```
conversation.item.input_audio_transcription.completed
        │
        ▼
  turnoPacienteRef = { texto, timestamp: new Date().toISOString() }
        │
        ▼
  consultarExamen.execute() lee turnoPacienteRef al armar body
        │
        ▼
  tras respuesta ok del orquestador → limpiar turnoPacienteRef
```

**Archivos candidatos** (sin decidir aún el diff exacto):

- `src/app/hooks/useRealtimeSession.ts` — ya recibe `input_audio_transcription.completed`
- Nuevo módulo `src/app/lib/turnoPaciente.ts` — ref + helpers (testeable)
- `src/app/agentConfigs/chatSupervisor/index.ts` — `execute` consume el ref e inyecta `timestamp`

---

## 4. Alcance

### 4.1 Incluido

- Generación y envío de `timestamp` en turnos con `respuestaPaciente`
- Reintento HTTP idempotente (mismo body)
- Actualización de instrucciones del agente (quitar “solo dos campos” / aclarar metadatos automáticos)
- Tests unitarios del helper de turno
- Prueba manual / E2E documentada (AC-G5)
- Actualización de docs listadas en §9

### 4.2 No incluido (ya cubierto por otro plan o backend)

- Cambios en orquestador (`registrarIntentoAgudeza`, pipeline, prompts protocolo/auditor)
- Persistencia multi-sesión del timestamp
- Exponer `timestamp` al paciente o en UI de transcript (opcional debug en Events, baja prioridad)
- Cambiar lógica clínica del intérprete/protocolo

---

## 5. Fases de implementación

### Fase R0 — Diseño y criterios (0,5 d)

| Tarea | Entregable |
|-------|------------|
| R0.1 | Aprobar decisiones R-D1…R-D6 en este documento |
| R0.2 | Definir evento exacto que marca “fin de utterance” (transcripción completed vs. tool call) |
| R0.3 | Definir política si el paciente habla dos veces antes de que el agente llame la tool (¿dos timestamps o el último?) → **recomendación: un ref por última utterance completada; sobrescribir** |

### Fase R1 — Módulo `turnoPaciente` (1 d)

| Tarea | Archivo(s) |
|-------|------------|
| R1.1 | `crearTurnoPaciente()`, `asignarDesdeTranscripcion(texto)`, `consumirParaRequest(): { respuestaPaciente, timestamp } \| null`, `limpiar()` |
| R1.2 | Tests: mismo texto + mismo timestamp en dos `consumir` sin limpiar; tras `limpiar`, nuevo timestamp |
| R1.3 | Exportar singleton o contexto React según convención del App |

### Fase R2 — Cableado STT → tool (1 d)

| Tarea | Archivo(s) |
|-------|------------|
| R2.1 | En `useRealtimeSession` (o handler de historial), al `input_audio_transcription.completed`, llamar `asignarDesdeTranscripcion` |
| R2.2 | En `consultarExamen.execute`, si hay `respuestaPaciente` en args del modelo, **preferir** texto del ref si coincide o si el ref está vacío usar args; **siempre** inyectar `timestamp` del ref |
| R2.3 | Tras `response.ok`, `limpiar()` el ref |
| R2.4 | Si el modelo llama la tool **sin** `respuestaPaciente` (bootstrap / continuar), no tocar ref ni enviar timestamp |

**Nota:** si el texto del modelo y el del ref difieren levemente, documentar regla: **priorizar transcripción del ref (STT)** como fuente de `respuestaPaciente` para alinear con lo que realmente se oyó.

### Fase R3 — Reintento HTTP idempotente (0,5 d)

| Tarea | Detalle |
|-------|---------|
| R3.1 | Función `postTurno(body, { maxRetries: 2 })` con mismo `JSON.stringify(body)` en cada intento |
| R3.2 | Solo reintentar en errores de red / 5xx / timeout; **no** reintentar en 4xx de negocio |
| R3.3 | Log en consola (dev): `intentId` no visible en cliente; opcional log `timestamp` + hash truncado para QA |

### Fase R4 — Instrucciones y tool schema (0,5 d)

| Tarea | Detalle |
|-------|---------|
| R4.1 | Actualizar `INSTRUCCIONES_BASE_CHATAGENT`: quitar “solo respuestaPaciente y confianza”; añadir “el cliente adjunta identificador de turno; no lo menciones al paciente” |
| R4.2 | **No** agregar `timestamp` al schema JSON de la tool (R-D1) |
| R4.3 | Revisar que `additionalProperties: false` en la tool **no** bloquee nada (el timestamp va en HTTP body, no en args del modelo) |

### Fase R5 — Validación E2E (1 d)

Ver §7.

### Fase R6 — Documentación (0,5 d)

Ver §9.

**Orden sugerido:** R0 → R1 → R2 → R3 → R4 → R5 → R6.

---

## 6. Criterios de aceptación

| ID | Criterio |
|----|----------|
| AC-R1 | Turno con respuesta del paciente: body HTTP incluye `timestamp` ISO 8601 |
| AC-R2 | Bootstrap y `continuar_sin_respuesta`: body **sin** `timestamp` (vacío o solo campos omitidos) |
| AC-R3 | Dos `POST` consecutivos con mismo `respuestaPaciente` + mismo `timestamp` → un solo incremento en `GET /api/examen/detalle` (`intentosRegistrados` / `resultadosPorLogmar`) |
| AC-R4 | Simular fallo de red + retry en cliente → mismo `timestamp` en ambos intentos → AC-R3 cumple |
| AC-R5 | Flujo E2E voz: al menos un turno `correcta` con tabla incrementada y mensajes pronunciados (hereda AC-G4 del plan tabla) |
| AC-R6 | Instrucciones del agente ya no dicen “solo dos campos” de forma que impida R-D1 |

---

## 7. Pruebas

### 7.1 Unitarias (frontend)

| Caso | Esperado |
|------|----------|
| `asignar` + `consumir` | Devuelve mismo `timestamp` |
| `consumir` dos veces sin `limpiar` | Mismo par texto+timestamp (o segunda consumición definida en R1 — documentar) |
| `limpiar` + nuevo `asignar` | Timestamp distinto |

### 7.2 Integración manual (orquestador local)

1. `POST /api/examen/nuevo`
2. Bootstrap: `POST /turno` `{}`
3. Turno paciente con body fijo vía **curl** (simula cliente correcto):

```bash
TS="2026-05-19T20:00:00.000Z"
curl -s -X POST http://localhost:3001/api/examen/turno \
  -H 'Content-Type: application/json' \
  -d "{\"respuestaPaciente\":\"veo una hache\",\"confianza\":0.9,\"timestamp\":\"$TS\"}"
# Repetir el mismo curl → verificar en /detalle que 0.3.correcto no pasó de 1
```

4. Repetir flujo desde la **app Realtime** con DevTools → Network: verificar campo `timestamp` y prueba AC-R3.

### 7.3 Regresión comportamiento voz

| Escenario | Verificar |
|-----------|-----------|
| Primer turno sin hablar paciente | Bootstrap OK, H@0.3 |
| Paciente dice letra tras `esperar_respuesta` | Un solo ciclo MQTT + mensaje |
| `continuar_sin_respuesta` (cierre R→L) | Segundo call sin params tras mensajes |
| Confianza baja | Repregunta sin doble registro si solo hubo un utterance |

### 7.4 Actualizar matrices de prueba

Añadir filas en `PLAN_MIGRACION_REALTIME_GA.md` §10 (T6, T11):

- T6b: Request de tool incluye `timestamp` en body HTTP (no en args del modelo)
- T11b: Reintento idempotente (opcional: mock 503)

---

## 8. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Transcripción completed llega **después** de que el modelo ya llamó la tool | Fallback: en `execute`, si no hay ref, generar timestamp **una vez** y guardarlo en ref de “turno en vuelo” hasta `limpiar` (documentar en R2) |
| Dos utterances seguidas sin respuesta del agente | Sobrescribir ref (R0.3); solo la última utterance cuenta |
| Modelo llama tool dos veces con misma respuesta | Mismo ref + timestamp hasta `limpiar` → segundo POST idempotente (correcto) o bloquear segunda llamada si ya hay request en vuelo (opcional R2.5) |
| CORS / URL orquestador | Sin cambio; mismo endpoint |
| Desfase texto STT vs. texto que el modelo manda a la tool | Priorizar STT (R2.2) |

---

## 9. Documentación a actualizar

| Archivo | Cambio |
|---------|--------|
| [PLAN_TABLA_RESULTADOS_AGUDEZA.md](./PLAN_TABLA_RESULTADOS_AGUDEZA.md) | §12: marcar riesgo “documentar en Realtime” como **cubierto** tras R6; enlazar este plan |
| [PLAN_MIGRACION_REALTIME_GA.md](./PLAN_MIGRACION_REALTIME_GA.md) | Corregir “consultarExamen no requiere cambios”; añadir fase R y tests T6b/T11b |
| [DISENO_AGENTE_INTERMEDIO.md](./DISENO_AGENTE_INTERMEDIO.md) | §6.4: campo `timestamp` opcional; nota “generado por cliente de voz” |
| [foroptero-orchestrator/README.md](./foroptero-orchestrator/README.md) | Ya menciona `timestamp`; añadir “Realtime debe enviarlo en turnos con respuesta” |
| Comentario en `chatSupervisor/index.ts` | Referencia a este plan y a R-D1 |

---

## 10. Fuera de alcance

- Enviar `timestamp` desde Framer / `ForopteroControl.tsx` (solo debug HTTP manual)
- Sincronizar `timestamp` con reloj del servidor
- Cambiar `buildIntentId` en backend
- Implementar cola offline de turnos

---

## Apéndice A — Checklist rápido pre-merge

- [ ] `timestamp` en body HTTP cuando hay `respuestaPaciente`
- [ ] Sin `timestamp` en bootstrap / continuar sin respuesta
- [ ] Ref STT cableado y limpiado tras éxito
- [ ] Reintento HTTP con mismo body
- [ ] Instrucciones del agente actualizadas (sin “solo dos campos”)
- [ ] Tests unitarios R1
- [ ] Prueba manual AC-R3 (curl o Network)
- [ ] Docs §9 actualizadas

---

## Apéndice B — Diff conceptual (referencia, no aplicar aún)

**Antes** (`execute`):

```typescript
body.respuestaPaciente = ...
body.confianza = ...
// POST sin timestamp
```

**Después** (`execute`):

```typescript
const turno = consumirTurnoPaciente() // { texto, timestamp }
body.respuestaPaciente = turno?.texto ?? args.respuestaPaciente
body.confianza = ...
if (body.respuestaPaciente) body.timestamp = turno.timestamp
// POST con retry idempotente
limpiarTurnoPaciente() // solo si ok
```

---

*Este documento es solo planificación. No modifica código hasta que se apruebe e implemente por fases.*
