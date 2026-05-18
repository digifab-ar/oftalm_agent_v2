# Foróptero Orchestrator (POC)

Servidor de examen visual con **agente intermedio** (OpenAI) + MQTT. Fase 1: agudeza monocular R → L desde logMAR 0.3.

Documentación de diseño: [../DISENO_AGENTE_INTERMEDIO.md](../DISENO_AGENTE_INTERMEDIO.md)

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
```

## Frontend

Configurar en `.env.local` del proyecto Next.js:

```
NEXT_PUBLIC_FOROPTERO_ORCHESTRATOR_URL=http://localhost:3001
```

El agente Realtime en `chatSupervisor` usa `consultarExamen` → `/api/examen/turno`.

## Railway

- Variables: `OPENAI_API_KEY`, `OPENAI_MODEL` (opcional, default `gpt-5-mini`), `OPENAI_REASONING_EFFORT` (opcional, default `low` para modelos reasoning), `PORT`
- Desplegar esta carpeta como servicio separado del backend legado.
