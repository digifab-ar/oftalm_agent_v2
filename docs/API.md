# API y contratos de servicio

Referencia completa de endpoints HTTP de ambos servicios y los contratos de vistas entre el orquestador y sus agentes LLM.

---

## 1. Next.js — Frontend API (`:3000`)

### `GET /api/session`

Genera una ephemeral key de OpenAI Realtime para el cliente WebRTC. El `OPENAI_API_KEY` nunca se expone al browser.

**Response (200):** objeto `client_secret` de la API de OpenAI, incluyendo el token para establecer la sesión Realtime.

---

### `POST /api/responses`

Proxy para guardrails: clasifica el output del agente de voz antes de enviarlo al paciente.

**Request:**
```json
{ "model": "gpt-4o-mini", "input": "...", "text": { "format": { "type": "json_schema" } } }
```

**Response (200):** JSON estructurado con categoría `OFFENSIVE | OFF_BRAND | VIOLENCE | NONE`.

---

### `GET /api/health`

```json
{ "ok": true }
```

---

## 2. Orquestador — Endpoints del examen (`:3001`)

### `POST /api/examen/nuevo`

Inicializa o reinicia el examen en memoria.

**Request (opcional):**
```json
{
  "rx": {
    "R": { "esfera": 0.75, "cilindro": -1.75, "angulo": 60 },
    "L": { "esfera": 2.75, "cilindro": 0, "angulo": 0 }
  }
}
```

Si no se envía `rx`, se usan valores demo (`R: 0.75/-1.75@60`, `L: 2.75/0@0`).

**Response (200):**
```json
{ "ok": true, "mensaje": "Examen inicializado" }
```

---

### `POST /api/examen/turno`

**Endpoint principal.** Ejecuta un turno del pipeline de agentes.

**Request (bootstrap — sin respuesta del paciente):**
```json
{}
```

**Request (con respuesta del paciente):**
```json
{
  "respuestaPaciente": "H",
  "confianza": 0.95,
  "timestamp": "2026-05-28T15:04:05.123Z"
}
```

- `respuestaPaciente`: transcripción literal de lo que dijo el paciente.
- `confianza`: calidad del audio (0–1), no corrección clínica.
- `timestamp`: identificador de turno para idempotencia; si se omite, el servidor genera uno.

**Response (200, turno ok):**
```json
{
  "ok": true,
  "pasos": [
    { "tipo": "hablar", "orden": 1, "mensaje": "Muy bien. Bajamos un nivel." }
  ],
  "contextoVoz": "esperar_respuesta",
  "modoTurno": "respuesta",
  "timingMs": { "interprete": 420, "protocolo": 680, "auditor": 310, "comunicacion": 290, "total": 1700 }
}
```

**Response (200, error clínico):**
```json
{
  "ok": false,
  "error": "Error del pipeline: ..."
}
```

**`contextoVoz` posibles valores:**

| Valor | Comportamiento del agente de voz |
|-------|----------------------------------|
| `esperar_respuesta` | Pronunciar mensajes y esperar al paciente |
| `continuar_sin_respuesta` | Pronunciar mensajes y volver a llamar sin parámetros |
| `inicio` | Igual que primer turno |

---

### `GET /api/examen/estado`

Resumen del estado actual del examen (campos principales, sin historial).

**Response (200):**
```json
{
  "ok": true,
  "fase": "agudeza",
  "ojoActual": "R",
  "agudeza": {
    "R": { "logmarActual": 0.2, "letraActual": "H", "logmarFinal": null },
    "L": { "logmarActual": null, "letraActual": null, "logmarFinal": null }
  }
}
```

---

### `GET /api/examen/detalle`

Estado completo con historial de turnos. Útil para debugging y QA.

**Response (200):** `{ ok, estado }` con el estado completo incluyendo `historial[]`, `intentosRegistrados[]`, `resultadosPorLogmar`, `timingMs` por turno.

---

### `GET /api/examen/registro.csv`

Export CSV del historial para QA. Una fila por turno.

---

## 3. Orquestador — Endpoints de dispositivos (`:3001`)

Permiten control manual (testing, debugging) independiente del pipeline de agentes.

### `POST /api/movimiento`

Mueve el foróptero via MQTT.

**Request:**
```json
{
  "accion": "movimiento",
  "R": { "esfera": 0.75, "cilindro": -1.75, "angulo": 60, "occlusion": "open" },
  "L": { "occlusion": "close" }
}
```

**Response:** `{ "status": "busy" | "ready" | "offline", "timestamp": 1234567890 }`

---

### `GET /api/estado`

Estado actual del foróptero físico.

**Response:** `{ "status": "ready" | "busy" | "offline", "timestamp": 1234567890 }`

---

### `POST /api/pantalla`

Muestra un optotipo en la TV via MQTT.

**Request:**
```json
{ "dispositivo": "pantalla", "accion": "mostrar", "letra": "H", "logmar": 0.3 }
```

**Response:** `{ "status": "ok", "letra": "H", "logmar": 0.3, "timestamp": 1234567890 }`

---

### `GET /api/pantalla`

Estado actual de la pantalla.

---

## 4. Orquestador — Endpoints admin (`:3001`)

### `GET /api/health`

Estado del servicio + versión del knowledge cargado.

**Response:**
```json
{
  "ok": true,
  "knowledge": { "version": "1.0.0", "commit": "abc1234" }
}
```

### `POST /api/admin/recargar-knowledge`

Recarga el knowledge repo (`git pull` + revalidación del manifest) sin redeploy.

**Headers:** `Authorization: Bearer $KNOWLEDGE_RELOAD_TOKEN`

### `POST /api/admin/webhook/knowledge`

Endpoint para webhook de GitHub. Se activa automáticamente en push a `main` del repo de knowledge.

---

## 5. Vistas de agentes

Las vistas son proyecciones del estado del examen que el servidor calcula antes de invocar cada agente LLM. Implementación: `lib/vistasAgentes.js`.

**Principios:**
- Cada agente recibe el mínimo necesario para su output.
- El historial completo y `resultadosPorLogmar` completo nunca se serializan al LLM.
- Contadores (`contadoresLogmarActual`), flags de comunicación y `letrasUsadasResultantes` se pre-computan en el servidor.

### VistaInterprete

```typescript
{
  fase: string,
  modo: "respuesta",
  estimulo: { tipo: string, letraActual: string, logmarActual: number, ojo: "R" | "L" },
  respuestaPaciente: string,
  confianza: number
}
```

### VistaProtocolo

```typescript
{
  fase: string,
  modo: "respuesta" | "bootstrap",
  ojoActual: "R" | "L",
  agudeza: {
    R: { logmarActual, letraActual, letrasUsadas, logmarFinal, contadoresLogmarActual },
    L: { ... }
  },
  rx: { R: { esfera, cilindro, angulo }, L: { ... } },
  interpretacion: { clasificacion, letrasCandidatas, letraElegida, notasInterprete },
  feedbackAuditor: null | { violaciones: string[], correccionSugerida: string }
}
```

`contadoresLogmarActual`: extraído de `resultadosPorLogmar[String(logmarActual)]` del ojo activo; `null` si `logmarActual` es null.

### VistaAuditor

Igual que VistaProtocolo, más:

```typescript
{
  intentoRecienRegistrado: { ... } | null,  // solo en modo: respuesta
  propuestaProtocolo: {
    estadoPatch: { ... },
    acciones: [ ... ],
    evento: string,
    detalleEvento: { ... },
    letrasUsadasResultantes: string[]  // post-deepMerge simulado
  }
}
```

El auditor usa `letrasUsadasResultantes` para validar BUG-005 (letra reutilizada) y `agudeza.R.logmarFinal` para validar BUG-006 (re-cierre de ojo ya cerrado).

### VistaComunicacion

```typescript
{
  fase: string,
  modo: string,
  evento: string,
  detalleEvento: { ... },
  huboCambioDispositivo: boolean,
  esPrimerTurnoExamen: boolean,
  esCambioDeOjo: boolean,
  esPrimerTurnoOjoActivo: boolean,
  esExamenFinalizado: boolean,
  interpretacion: { clasificacion, letraElegida },
  estadoResumido: { ojoActual, logmarActual, letraActual }
}
```

---

## 6. Contratos de output LLM (schemas)

Definidos en `agents/schemas.js`. Cada agente usa structured outputs de OpenAI; el servidor valida el JSON antes de continuar el pipeline.

| Agente | Output |
|--------|--------|
| intérprete | `{ clasificacion, letrasCandidatas, letraElegida, notasInterprete }` |
| protocolo | `{ estadoPatch, acciones, evento, detalleEvento, razonamientoProtocolo }` |
| auditor | `{ aprobado, violaciones, correccionSugerida }` |
| comunicación | `{ mensajesPaciente, contextoVoz, razonamientoComunicacion }` |

---

## 7. URL de producción

- **Orchestrator (Railway):** `https://foroptero-production.up.railway.app`
- **Frontend:** configurar `NEXT_PUBLIC_FOROPTERO_ORCHESTRATOR_URL` con la URL correspondiente.
