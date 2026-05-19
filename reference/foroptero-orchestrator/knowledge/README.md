# Knowledge — examen visual multi-fase

El servidor carga **core** (transversal) + **fases/{fase}/** según `estado.fase`. Ver `lib/knowledge.js`.

## Estructura

```text
knowledge/
  core/                    # intérprete, auditor, comunicación (todas las fases)
  dispositivos.md          # MQTT foróptero + TV (compartido)
  fases/
    agudeza/               # fase 1 POC
      interpretacion.md
      protocolo-estado.md
      auditoria.md
      comunicacion.md
    lentes/                # (futuro)
```

## Mapa agente × fase (agudeza)

| Agente | Prompt | Knowledge |
|--------|--------|-----------|
| **intérprete** | `prompts/interprete.md` (genérico) | core/interpretacion-comun + fases/agudeza/interpretacion |
| **auditor** | `prompts/auditor.md` (genérico) | core/auditoria-estructural + fases/agudeza/auditoria |
| **comunicación** | `prompts/comunicacion.md` (genérico) | core/comunicacion-comun + fases/agudeza/comunicacion |
| **protocolo** | `prompts/protocolo-agudeza.md` | fases/agudeza/protocolo-estado + dispositivos |

## Pipeline

```
Voz → servidor → Intérprete → Protocolo → Auditor → [merge + MQTT] → Comunicación → Voz
```

`pipelineTurno.js` + `lib/knowledge.js` + `lib/estimulo.js`.

## Agregar una fase (ej. lentes)

1. Crear `knowledge/fases/lentes/*.md` (4 archivos + opcional auditoría específica).
2. Registrar en `FASE_KNOWLEDGE` en `lib/knowledge.js`.
3. Crear `prompts/protocolo-lentes.md`.
4. Extender `lib/estimulo.js` para el JSON de estímulo de lentes.

Los prompts genéricos de intérprete, auditor y comunicación **no cambian**.

## Archivos legacy (eliminados 2026-05-19)

| Antes | Ahora |
|-------|--------|
| `interpretacion-paciente.md` | core + fases/agudeza/interpretacion |
| `protocolo-agudeza-estado.md` | fases/agudeza/protocolo-estado |
| `auditoria-protocolo.md` | core + fases/agudeza/auditoria |
| `comunicacion-paciente.md` | core + fases/agudeza/comunicacion |
| `prompts/protocolo.md` | `prompts/protocolo-agudeza.md` |
