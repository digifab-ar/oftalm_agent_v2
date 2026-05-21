# Foróptero Orchestrator (POC)

Servidor de examen visual con **agente intermedio** (OpenAI) + MQTT. Fase 1: agudeza monocular R → L desde logMAR 0.3.

Documentación de diseño: [../DISENO_AGENTE_INTERMEDIO.md](../DISENO_AGENTE_INTERMEDIO.md)

**Prompts y knowledge (runtime):** repo externo [Oftalm_agent_v2_prompts_knowledge](https://github.com/digifab-ar/Oftalm_agent_v2_prompts_knowledge), índice `knowledge.manifest.json`. Ver [docs/PLAN_INTEGRACION_KNOWLEDGE_REPO.md](./docs/PLAN_INTEGRACION_KNOWLEDGE_REPO.md).

**Solo en este repo (servidor):** [docs/contratos-agentes.md](./docs/contratos-agentes.md) (vistas/schemas), `fixtures/auditor/`, código del pipeline.

## Pipeline multi-agente

Por turno (`modo: respuesta`): **intérprete** → **registro de intento** (servidor, `resultadosPorLogmar`) → **protocolo** → **auditor** (hasta 1 reintento) → patch + MQTT → **comunicación**.

El protocolo **no escribe contadores** en el patch; lee la tabla ya actualizada. Ver [../PLAN_TABLA_RESULTADOS_AGUDEZA.md](../PLAN_TABLA_RESULTADOS_AGUDEZA.md).

### Turno bootstrap

Cuando el ojo activo aún no tiene `letraActual` ni `logmarActual` (estado vacío tras `POST /api/examen/nuevo`), el pipeline entra en **`modo: bootstrap`**:

- Detectado en `detectarModoTurno()` (`pipelineTurno.js`).
- El intérprete se omite (clasificación fija `continuacion`).
- Protocolo y auditor reciben `modo: bootstrap` en el user prompt y aplican *Inicio del test por ojo* (H@0.3, foróptero + TV).

```
agents/              # llamadas OpenAI por rol
pipelineTurno.js     # orquestación
lib/knowledge.js     # carga manifest + prompts/knowledge externos
lib/knowledgeBootstrap.js
fixtures/auditor/    # QA manual (no cargados por el LLM)
docs/contratos-agentes.md
```

## Requisitos

- Node 18+
- `OPENAI_API_KEY`
- Broker MQTT
- Clone del repo de knowledge (ver abajo)
- `git` en PATH (Railway: imagen con git instalado)

## Instalación

```bash
cd reference/foroptero-orchestrator
cp .env.example .env

# Clone del repo de prompts/knowledge (hermano por defecto)
git clone https://github.com/digifab-ar/Oftalm_agent_v2_prompts_knowledge.git \
  ../Oftalm_agent_v2_prompts_knowledge

# Opcional si el clone está en otra ruta:
# KNOWLEDGE_ROOT=/ruta/absoluta/Oftalm_agent_v2_prompts_knowledge

npm install
npm start
```

Sin `KNOWLEDGE_ROOT`, el servidor usa `../Oftalm_agent_v2_prompts_knowledge` si existe.

Puerto por defecto: **3001**

## Knowledge — actualizar sin redeploy

1. Merge a `main` en [Oftalm_agent_v2_prompts_knowledge](https://github.com/digifab-ar/Oftalm_agent_v2_prompts_knowledge).
2. **Prod:** webhook GitHub → `POST /api/admin/webhook/knowledge` (o recarga manual).
3. **Manual:**

```bash
curl -X POST http://localhost:3001/api/admin/recargar-knowledge \
  -H "Authorization: Bearer $KNOWLEDGE_RELOAD_TOKEN"
```

4. Verificar `GET /api/health` → campo `knowledge.version`.

Cache del manifest: `KNOWLEDGE_MANIFEST_CACHE_MS=5000` (default). Se invalida en cada recarga.

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado + `knowledge` (versión, commit) |
| POST | `/api/admin/recargar-knowledge` | `git pull` + validar manifest (Bearer token) |
| POST | `/api/admin/webhook/knowledge` | Webhook GitHub push a `main` |
| POST | `/api/examen/nuevo` | Inicializa examen |
| POST | `/api/examen/turno` | Turno |
| GET | `/api/examen/estado` | Resumen |
| GET | `/api/examen/detalle` | Estado + historial |
| GET | `/api/examen/registro.csv` | Export QA |

## Tests

```bash
npm run test:knowledge
npm run test:vistas
npm run test:registro
```

## Prueba sin voz

```bash
OPENAI_API_KEY=sk-... npm start
BACKEND_URL=http://localhost:3001 npm run test:agent
```

## Frontend

```
NEXT_PUBLIC_FOROPTERO_ORCHESTRATOR_URL=http://localhost:3001
```

## Railway

Variables mínimas:

| Variable | Valor |
|----------|--------|
| `OPENAI_API_KEY` | … |
| `PORT` | 3001 |
| `KNOWLEDGE_ROOT` | `/app/knowledge-repo` |
| `KNOWLEDGE_GIT_URL` | `https://github.com/digifab-ar/Oftalm_agent_v2_prompts_knowledge.git` |
| `KNOWLEDGE_GIT_REF` | `main` |
| `KNOWLEDGE_RELOAD_TOKEN` | secreto |
| `KNOWLEDGE_GITHUB_WEBHOOK_SECRET` | secreto webhook GitHub |
| `KNOWLEDGE_MANIFEST_CACHE_MS` | `5000` |

El servicio debe tener **git** disponible (Nixpacks suele incluirlo; si no, Dockerfile con `apt-get install git`).

Webhook GitHub: URL `https://<tu-servicio>/api/admin/webhook/knowledge`, evento **push**, secret = `KNOWLEDGE_GITHUB_WEBHOOK_SECRET`.

Staging: `KNOWLEDGE_WEBHOOK_ENABLED=false` y recarga manual.
