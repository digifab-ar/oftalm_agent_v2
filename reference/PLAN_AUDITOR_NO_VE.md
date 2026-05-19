# Plan — Corrección agente auditor (`no_ve` / contadores)

**Versión:** 0.1  
**Fecha:** 2026-05-19  
**Estado:** Implementado (documentación y fixtures)  
**Alcance:** prompts + knowledge + fixtures QA (sin cambios en `*.js`)

---

## Problema

En log 2026-05-19, turno 4 (`no_ve`, “veo borroso”), el auditor rechazó una propuesta válida del protocolo (subida 0.1→0.2, TV E@0.2, sin incrementar `aciertosPorLogmar`), aplicando por error el checklist de **correcta**.

## Implementación realizada

| Entregable | Archivo |
|------------|---------|
| Checklist `no_ve` ampliado + tabla decisión + caso T4 | `knowledge/fases/agudeza/auditoria.md` |
| Ramificación por clasificación + coherencia salida | `prompts/auditor.md` |
| Regla estructural contadores / `confirmaciones` | `knowledge/core/auditoria-estructural.md` |
| Fixtures AUD-01…06 | `fixtures/auditor/` |
| Mapa knowledge | `knowledge/README.md` |
| Cuadro de síntesis | `CUADRO_SINTESIS_PIPELINE_AGENTES.html` |

## Criterios de aceptación (validación manual)

| ID | Criterio |
|----|----------|
| AC-AUD-1 | AUD-01: `aprobado: true` en ≥ 4/5 corridas |
| AC-AUD-2 | AUD-02: `aprobado: false` en ≥ 4/5 corridas |
| AC-AUD-3 | AUD-03: sigue rechazando (no regresión T3) |
| AC-AUD-4 | E2E hasta “veo borroso”: sin `fallback_auditoria` en ≥ 4/5 |
| AC-AUD-5 | Violaciones sin contradicciones “es correcto” + rechazo |
| AC-AUD-6 | Documentación no exige `confirmaciones` en agudeza |

## Fuera de alcance (futuro)

- Runner `auditFixture.js` automatizado
- Cargar extracto de `protocolo-estado.md` en system del auditor
- Eliminar `confirmaciones` del schema / estado
