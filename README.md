# Examen visual con agente AI — PoC agudeza

PoC de examen visual oftalmológico por voz: un **agente de voz** (OpenAI Realtime) conversa con el paciente y un **agente intermedio** (LLM en servidor) define el protocolo clínico, el estado del examen y los comandos a dispositivos (foróptero + TV vía MQTT).

**Alcance fase 1:** agudeza visual monocular (ojo derecho → izquierdo), escalera logMAR desde 0.3.

## Arquitectura

```
Frontend (Next.js + Realtime)
    → POST /api/examen/turno  (tool consultarExamen)
        → foroptero-orchestrator (Express + OpenAI + MQTT)
            → Foróptero (ESP32) + TV (optotipos)
```

| Componente | Ubicación |
|------------|-----------|
| Agente de voz | `src/app/agentConfigs/chatSupervisor/index.ts` |
| Servidor PoC | `reference/foroptero-orchestrator/` |
| Diseño y contrato API | [reference/DISENO_AGENTE_INTERMEDIO.md](./reference/DISENO_AGENTE_INTERMEDIO.md) |
| Backend legado (referencia) | `reference/foroptero-server/` — motor determinista; no usado en esta PoC |

## Documentación

**Punto de entrada:** [docs/ARQUITECTURA.md](./docs/ARQUITECTURA.md) — síntesis del sistema, diagrama, componentes y links a todo lo demás.

| Documento | Contenido |
|-----------|-----------|
| [docs/ARQUITECTURA.md](./docs/ARQUITECTURA.md) | Síntesis del sistema, diagrama, inicio rápido |
| [docs/REALTIME.md](./docs/REALTIME.md) | Frontend Next.js, agente de voz, guardrails |
| [docs/ORQUESTADOR.md](./docs/ORQUESTADOR.md) | Pipeline 4 agentes, estado, MQTT, tests |
| [docs/KNOWLEDGE.md](./docs/KNOWLEDGE.md) | Repo de knowledge, manifest, meta-agente |
| [docs/API.md](./docs/API.md) | Endpoints HTTP y contratos de vistas |
| [docs/historial/](./docs/historial/) | Planes de implementación archivados |
| [reference/DISENO_AGENTE_INTERMEDIO.md](./reference/DISENO_AGENTE_INTERMEDIO.md) | Diseño original completo (PoC) |

## Requisitos

- Node 18+
- `OPENAI_API_KEY` (frontend y orchestrator)
- Broker MQTT accesible (por defecto HiveMQ público en el orchestrator)

## Inicio rápido

### 1. Orchestrator (backend PoC)

```bash
cd reference/foroptero-orchestrator
cp .env.example .env
# Editar .env: OPENAI_API_KEY
npm install
npm start
```

Puerto por defecto: **3001**

Prueba sin voz (otra terminal):

```bash
BACKEND_URL=http://localhost:3001 npm run test:agent
```

### 2. Frontend

```bash
npm install
```

Crear `.env.local` en la raíz del proyecto:

```
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_FOROPTERO_ORCHESTRATOR_URL=http://localhost:3001
```

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000). La app usa el agente `chatSupervisor` (oftalmólogo virtual).

### 3. Despliegue

- **Orchestrator:** servicio separado en Railway (carpeta `reference/foroptero-orchestrator/`). Ver su README.
- **Frontend:** Vercel u otro host Next.js; configurar `NEXT_PUBLIC_FOROPTERO_ORCHESTRATOR_URL` con la URL del orchestrator.

## UI

- Transcript (izquierda): conversación, tool calls y respuestas del backend.
- Event log (derecha): eventos Realtime cliente/servidor.
- Barra inferior: conectar/desconectar, PTT, audio, logs.

## Stack

Basado en el [OpenAI Realtime Agents](https://github.com/openai/openai-realtime-agents) demo (Next.js + [@openai/agents](https://github.com/openai/openai-agents-js)), adaptado para el flujo de examen visual con orchestrator.
