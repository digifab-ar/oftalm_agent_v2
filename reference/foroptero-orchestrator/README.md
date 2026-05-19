# Foróptero Orchestrator (POC)

Servidor de examen visual con **agente intermedio** (OpenAI) + MQTT. Fase 1: agudeza monocular R → L desde logMAR 0.3.

Documentación de diseño: [../DISENO_AGENTE_INTERMEDIO.md](../DISENO_AGENTE_INTERMEDIO.md)

Knowledge **core + fases** (multi-fase): [knowledge/README.md](./knowledge/README.md)

## Pipeline multi-agente

Por turno: **intérprete** → **protocolo** → **auditor** (hasta 1 reintento) → patch + MQTT → **comunicación**.

### Turno bootstrap

Cuando el ojo activo aún no tiene `letraActual` ni `logmarActual` (estado vacío tras `POST /api/examen/nuevo`), el pipeline entra en **`modo: bootstrap`**:

- Detectado en `detectarModoTurno()` (`pipelineTurno.js`).
- El intérprete se omite (clasificación fija `continuacion`).
- Protocolo y auditor reciben `modo: bootstrap` en el user prompt y aplican *Inicio del test por ojo* (H@0.3, foróptero + TV).
- Si el paciente envía una frase social ("iniciar") en el primer turno, se loguea en historial pero no se interpreta clínicamente.
- Fallback diferenciado si falla el auditor o OpenAI (mensaje neutro, sin repregunta por letra).

```
agents/          # llamadas OpenAI por rol
pipelineTurno.js # orquestación + detectarModoTurno
prompts/         # genéricos (interprete, auditor, comunicacion) + protocolo-agudeza.md
fixtures/auditor/  # JSON QA manual del auditor (AUD-01…06)
lib/             # knowledge.js (carga por fase), estimulo.js
```

Mitigación auditor `no_ve`: [../PLAN_AUDITOR_NO_VE.md](../PLAN_AUDITOR_NO_VE.md)

## Requisitos

- Node 18+
- `OPENAI_API_KEY`
- Broker MQTT (por defecto HiveMQ público)

## Instalación

```bash
cd reference/foroptero-orchestrator
cp .env.example .env
# Editar .env con OPENAI_API_KEY
npm install
npm start
```

Puerto por defecto: **3001**

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado del servicio |
| POST | `/api/examen/nuevo` | Inicializa examen |
| POST | `/api/examen/turno` | Turno (`respuestaPaciente`, `confianza`) |
| GET | `/api/examen/estado` | Resumen |
| GET | `/api/examen/detalle` | Estado + historial |
| GET | `/api/examen/registro.csv` | Export QA |

## Prueba sin voz

```bash
OPENAI_API_KEY=sk-... npm start
# otra terminal:
BACKEND_URL=http://localhost:3001 npm run test:agent

# Solo escenarios bootstrap (requiere servidor + OPENAI_API_KEY):
BACKEND_URL=http://localhost:3001 node testAgent.js bootstrap
```

## Frontend

Configurar en `.env.local` del proyecto Next.js:

```
NEXT_PUBLIC_FOROPTERO_ORCHESTRATOR_URL=http://localhost:3001
```

El agente Realtime en `chatSupervisor` usa `consultarExamen` → `/api/examen/turno`.

## Railway

- Variables: `OPENAI_API_KEY`, `PORT`
- Modelos LLM por agente: editar `lib/agentModels.js`
- Desplegar esta carpeta como servicio separado del backend legado.
