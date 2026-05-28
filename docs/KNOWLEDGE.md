# Repositorio de knowledge

**Repo externo:** [digifab-ar/Oftalm_agent_v2_prompts_knowledge](https://github.com/digifab-ar/Oftalm_agent_v2_prompts_knowledge)  
**Copia local (referencia):** `reference/Oftalm_agent_v2_prompts_knowledge/`  
**Versión actual:** `1.0.0`

---

## Responsabilidad

Este repositorio contiene todos los prompts y el conocimiento clínico que los agentes LLM del orquestador necesitan en runtime. El orquestador **no tiene prompts embebidos en código**; los lee desde aquí al arrancar y puede recargarlos sin redeploy.

---

## Estructura

```
knowledge.manifest.json          # índice: prompt + knowledge por agente × fase
knowledge.manifest.schema.json   # JSON schema del manifest

prompts/                         # system prompts por agente (fase agudeza)
│   interprete.md
│   protocolo-agudeza.md
│   auditor.md
│   comunicacion.md

knowledge/
│   dispositivos.md              # shapes MQTT foróptero + TV
│   core/                        # reglas transversales (cualquier fase)
│   │   auditoria-estructural.md # validaciones JSON path, BUG-005
│   │   comunicacion-comun.md    # tono, tabla contextoVoz por flags
│   │   interpretacion-comun.md  # umbrales de confianza, vocabulario
│   └── fases/agudeza/           # reglas de la fase actual
│       auditoria.md             # checklists por clasificación + anti-patterns
│       comunicacion.md          # templates de mensajes al paciente
│       interpretacion.md        # set Sloan, fonética, out-of-vocabulary
│       protocolo-estado.md      # modelo de estado, escala logMAR, BUG catalog 001–006
│       runbook-operador.md      # diagnóstico de síntomas en producción

meta-agent/                      # agente offline (no consumido en runtime)
│   prompts/meta-agente.md
│   knowledge/
│   │   constitucion.md          # libertades y límites al proponer cambios
│   │   formato-propuesta.md     # template de propuesta en propuestas/
│   │   examen-visual-completo.md
│   │   examen-refractivo-simplificado.md
│   └── test-agudeza-visual-paso-a-paso.md

propuestas/                      # salidas del meta-agente (revisión humana)
scripts/
└── validate-manifest.mjs        # validación CI del manifest
```

---

## `knowledge.manifest.json` — el índice

El orquestador lee este archivo para saber qué prompt y qué archivos de knowledge inyectar en el system prompt de cada agente.

```json
{
  "version": "1.0.0",
  "defaultPhase": "agudeza",
  "phases": {
    "agudeza": {
      "interprete":   { "prompt": "prompts/interprete.md",        "knowledge": ["core/interpretacion-comun.md", "fases/agudeza/interpretacion.md"] },
      "auditor":      { "prompt": "prompts/auditor.md",           "knowledge": ["core/auditoria-estructural.md", "fases/agudeza/auditoria.md"] },
      "comunicacion": { "prompt": "prompts/comunicacion.md",      "knowledge": ["core/comunicacion-comun.md", "fases/agudeza/comunicacion.md"] },
      "protocolo":    { "prompt": "prompts/protocolo-agudeza.md", "knowledge": ["fases/agudeza/protocolo-estado.md", "dispositivos.md"] }
    }
  },
  "metaAgent": { ... }
}
```

Si se agrega una nueva fase (ej. `refraccion`), se agrega una key en `phases` con la misma estructura. El orquestador la consumirá sin cambios de código.

---

## Carga en el orquestador

Al arrancar (`lib/knowledgeBootstrap.js`):

1. Verifica o clona el repo externo en `KNOWLEDGE_ROOT` (por defecto `../Oftalm_agent_v2_prompts_knowledge`).
2. Lee `knowledge.manifest.json`.
3. Para cada agente × fase: lee el `.md` del prompt y concatena los `.md` de knowledge.
4. El resultado queda en cache en memoria (`lib/knowledge.js`).
5. Cache se invalida con recarga manual o webhook.

**Variable de entorno:** `KNOWLEDGE_MANIFEST_CACHE_MS=5000` (TTL del cache, default 5 s).

---

## Mapa agente × knowledge (fase agudeza)

| Agente | Prompt | Knowledge files |
|--------|--------|----------------|
| intérprete | `prompts/interprete.md` | `core/interpretacion-comun.md` + `fases/agudeza/interpretacion.md` |
| protocolo | `prompts/protocolo-agudeza.md` | `fases/agudeza/protocolo-estado.md` + `dispositivos.md` |
| auditor | `prompts/auditor.md` | `core/auditoria-estructural.md` + `fases/agudeza/auditoria.md` |
| comunicación | `prompts/comunicacion.md` | `core/comunicacion-comun.md` + `fases/agudeza/comunicacion.md` |

---

## Meta-agente (asíncrono, fuera del pipeline)

El meta-agente es una herramienta offline para que un humano (con apoyo de LLM) **defina o mejore el examen** sin modificar el código.

- **No se consume en runtime** del orquestador.
- Recibe como input: `Documento_completo.pdf-PDFA.pdf` (manual clínico UNLP/CONICET), `examen-visual-completo.md`, `examen-refractivo-simplificado.md`, `test-agudeza-visual-paso-a-paso.md`.
- Produce propuestas en `propuestas/` usando `formato-propuesta.md` como template.
- `constitucion.md` define qué puede y qué no puede proponer (zonas rojas, amarillas, verdes).

---

## Workflow para cambiar el examen

```
1. Branch desde main
2. Editar .md (prompts o knowledge)
3. Si se agregan archivos: actualizar knowledge.manifest.json
4. npm run validate   (valida manifest contra schema)
5. PR → revisión humana → merge a main
6. En servidor: webhook auto-recarga o manual vía /api/admin/recargar-knowledge
7. Verificar GET /api/health → knowledge.version
```

---

## Validación local

```bash
cd reference/Oftalm_agent_v2_prompts_knowledge
npm run validate
```

El CI también corre esta validación en cada PR/push a `main` (`.github/workflows/validate-manifest.yml`).

---

## Versionado

- `version` en `knowledge.manifest.json` (semver).
- Tags git `knowledge-v*` solo en hitos grandes (no en cada PR).
- `CHANGELOG.md` registra cambios por versión.
- Decisiones de diseño del repo: `docs/DECISIONES.md`.
