# Frontend Realtime — Next.js + OpenAI Realtime API

**Ubicación código:** `src/`  
**Puerto local:** `:3000`  
**Stack:** Next.js 15, React, `@openai/agents`, TypeScript

---

## Responsabilidad

El frontend es intencionalmente delgado: establece la sesión de voz, transmite lo que dice el paciente sin interpretación clínica, y pronuncia textualmente los mensajes que devuelve el orquestador. No tiene lógica clínica propia.

---

## Flujo de una sesión

```
1. App.tsx carga → fetchEphemeralKey() → GET /api/session → ephemeral key
2. useRealtimeSession crea RealtimeSession (WebRTC, modelo gpt-realtime-mini-2025-12-15)
3. Agente recibe evento `session.created` → llama consultarExamen sin parámetros (bootstrap)
4. Orquestador responde { ok, pasos, contextoVoz }
5. Agente pronuncia pasos[].mensaje en orden
6. Si contextoVoz = "esperar_respuesta": espera audio del paciente
7. useHandleSessionHistory escucha transcript STT → asignarDesdeTranscripcion()
8. Agente llama consultarExamen con respuestaPaciente + confianza
9. Repetir desde 4
```

---

## Agente de voz: `chatSupervisor`

Definición: `src/app/agentConfigs/chatSupervisor/index.ts`

- **Nombre:** "Oftalmólogo Virtual"
- **Voz:** alloy
- **Handoffs:** ninguno (agente único)
- **Herramienta:** `consultarExamen` (única herramienta expuesta)

### Reglas clave del agente (instrucciones)

- Pronuncia `pasos[].mensaje` palabra por palabra, sin agregar texto propio.
- Envía la transcripción literal del paciente, sin "corregir" por contexto del examen.
- `confianza` mide la calidad del audio (0–1), no la corrección clínica de la respuesta.
- Primer turno siempre sin parámetros (bootstrap), aunque el paciente ya haya hablado.
- No guarda estado del examen; el servidor lo maneja.

### Tabla de uso de `consultarExamen`

| Situación | Parámetros enviados |
|-----------|---------------------|
| Arranque de conversación | Sin parámetros (body vacío) |
| Paciente acaba de hablar | `respuestaPaciente` + `confianza` |
| `contextoVoz: continuar_sin_respuesta` tras pronunciar mensajes | Sin parámetros |

### Respuesta recibida del orquestador

El agente solo ve un subconjunto filtrado para evitar sesgo en la transcripción:

```json
{
  "ok": true,
  "pasos": [{ "tipo": "hablar", "mensaje": "Muy bien, bajamos un peldaño." }],
  "contextoVoz": "esperar_respuesta"
}
```

Campos clínicos (`logmarActual`, `letraActual`, etc.) son descartados por `respuestaTurnoParaAgenteVoz()` antes de exponerlos al modelo.

---

## Idempotencia de turno (`turnoPaciente.ts`)

El módulo `src/app/lib/turnoPaciente.ts` mantiene estado de módulo con la transcripción actual y un `timestamp` estable por utterance. Propósito: si el tool call se ejecuta antes de que el STT complete, el mismo `timestamp` permite al orquestador deduplicar reintentos.

```
STT delta → acumulación parcial
STT completion → asignarDesdeTranscripcion(texto, timestamp)
Tool call → resolverTurnoParaRequest() usa timestamp del STT o genera uno nuevo
Orquestador responde → limpiarTurnoPaciente()
```

---

## Retry HTTP (`examenTurnoClient.ts`)

`src/app/lib/examenTurnoClient.ts` implementa POST con reintentos automáticos sobre el orquestador:

- **Reintentos:** hasta 3 (`MAX_RETRIES`)
- **Backoff:** lineal (`RETRY_BASE_MS × attempt`)
- **Reintenta en:** HTTP 408, 429, 5xx (errores recuperables)
- **No reintenta en:** 4xx (excepto 408/429)

---

## Guardrails

`src/app/agentConfigs/guardrails.ts` define un guardrail de output que clasifica cada mensaje del agente antes de enviarlo al paciente.

- Llama a `POST /api/responses` (proxy Next.js → OpenAI Responses API, modelo `gpt-4o-mini`)
- Categorías: `OFFENSIVE`, `OFF_BRAND`, `VIOLENCE`, `NONE`
- Si tripea guardrail: el evento `guardrail_tripped` se muestra en el event log de la UI

---

## API routes Next.js

### `GET /api/session`

Genera una ephemeral key de OpenAI Realtime para el cliente. El API key no se expone al browser.

```
POST https://api.openai.com/v1/realtime/client_secrets
  session.model: gpt-realtime-mini-2025-12-15
  session.audio.input.transcription.model: gpt-4o-mini-transcribe
  session.audio.input.turn_detection: server_vad
    threshold: 0.9
    silence_duration_ms: 500
```

### `POST /api/responses`

Proxy para guardrails. Llama `openai.responses.create` con schema Zod para clasificación estructurada.

### `GET /api/health`

JSON de uptime, para monitoreo.

---

## UI

| Componente | Función |
|------------|---------|
| `App.tsx` | Lifecyle de sesión, PTT, selección de agente |
| `Transcript.tsx` | Conversación + tool calls con breadcrumbs |
| `Events.tsx` | Log de eventos Realtime cliente/servidor |
| `BottomToolbar.tsx` | Conectar/desconectar, PTT, codec, mute |
| `GuardrailChip.tsx` | Muestra categoría de guardrail si tripea |

Parámetro de URL `?codec=opus|pcm16` para seleccionar codec de audio.

---

## Despliegue

- **Desarrollo:** `npm run dev` en raíz del repo (`:3000`)
- **Producción:** Vercel u otro host Next.js
- Variable de entorno clave en producción: `NEXT_PUBLIC_FOROPTERO_ORCHESTRATOR_URL` con la URL pública del orquestador

Ver configuración completa en [ARQUITECTURA.md → Variables de entorno](./ARQUITECTURA.md#variables-de-entorno).
