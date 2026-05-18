# Knowledge — POC agudeza (multi-agente)

Cinco archivos por **responsabilidad de agente**. El servidor carga el subset que corresponda a cada llamada LLM.

| Archivo | Agente | Contenido |
|---------|--------|-----------|
| [interpretacion-paciente.md](./interpretacion-paciente.md) | Intérprete | Confianza, clasificación lingüística, tabla fonética Sloan |
| [protocolo-agudeza-estado.md](./protocolo-agudeza-estado.md) | Protocolo | logMAR, `aciertosPorLogmar`, cierre, transición R→L, `evento` |
| [dispositivos.md](./dispositivos.md) | Protocolo | Comandos y reglas MQTT foróptero + TV |
| [comunicacion-paciente.md](./comunicacion-paciente.md) | Comunicación | Mensajes al paciente, `contextoVoz`, plantillas |
| [auditoria-protocolo.md](./auditoria-protocolo.md) | Auditor | Anti-patrones, checklist, casos QA |

**Agente de voz** (Realtime): sin knowledge en esta carpeta; instrucciones en `src/app/agentConfigs/chatSupervisor/index.ts`.

## Pipeline (objetivo)

```
Voz → servidor → Intérprete → Protocolo → Auditor → [merge + MQTT] → Comunicación → Voz
```

El **pipeline** (`pipelineTurno.js`) carga solo el subset de cada agente vía `lib/knowledge.js` + su prompt en `prompts/`.

## Archivos reemplazados (2026-05)

| Antes | Ahora |
|-------|--------|
| `examen-agudeza.md` | `protocolo-agudeza-estado.md` + partes en otros cuatro |
| `letras-fonetica-es.md` | `interpretacion-paciente.md` (tabla fonética) |
| `foroptero.md` + `tv.md` | `dispositivos.md` |
