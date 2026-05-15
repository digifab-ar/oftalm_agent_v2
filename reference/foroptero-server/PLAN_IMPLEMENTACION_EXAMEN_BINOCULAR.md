# Plan de implementación — Examen binocular (nuevo flujo)

**Especificación base:** `DEFINICIONES_EXAMEN_BINOCULAR.md`  
**Estado:** **implementado** (2026-04-22). El flujo operativo está en `motorExamen.js` (ETAPA_6, `binocularEstado`, fases `FB_TRANS_LISTO`, `FB_ESF_MOSTRAR`, `FB_ESF_PREG`, `FB_CIL_MOSTRAR`, `FB_CIL_PREG`) y en el agente `src/app/agentConfigs/chatSupervisor/index.ts`.  
Este plan se conserva como trazabilidad y checklist de QA; las secciones “Fase 1–9” reflejan el diseño; el comportamiento vigente se describe en `DEFINICIONES_EXAMEN_BINOCULAR.md` (§11, §12).

---

## 0. Alcance y criterios de éxito

- Reemplazar la lógica actual de ETAPA_6 (esfera sola, ramas por diferencia R/L, confirmaciones múltiples) por el flujo de **dos comparaciones** (esférica → cilíndrica opcional) según definiciones.
- Incorporar un subflujo de transición clínica al entrar a ETAPA_6: **base binocular con ambos ojos abiertos + mensaje de adaptación + confirmación "listo"** antes de la primera variante.
- **Éxito:** `obtenerInstrucciones` / `generarPasos` entregan la secuencia correcta de pasos; `interpretacionComparacion` sigue funcionando; resultado final guarda **{ esfera, cilindro, angulo }** por ojo; modo `testbin` válido con `valoresRecalculados` completos; pruebas manuales de la matriz QA pasan.

---

## Fase 1 — Utilidades puras (motor)

**Objetivo:** centralizar reglas numéricas para tests unitarios / revisión fácil.

| Tarea | Detalle |
|-------|---------|
| 1.1 | Función `aplicarMedioDioptriaHaciaCero(valor)` (o nombre acordado) para **esfera**: mueve 0,50 hacia 0, clamp a [−19, +16,5]. |
| 1.2 | Misma idea para **cilindro** en rango plano [−6, 0] / representación interna del proyecto: “hacia cero” = acercar a 0 D, clamp; si resultado cil = 0, eje = 0 a nivel de objeto Rx. |
| 1.3 | Función `construirRxBaseBinocular()` que devuelve `{ R: {esfera,cilindro,angulo}, L: {...} }` según §2 de definiciones (modo normal vs `estadoExamen.modo === 'testbin'`). |
| 1.4 | Función `aplicarVarianteEsferica(rx)` y `aplicarVarianteCilindrica(rx)` que respeten §5 (no mover ojo si esfera o cil ya es 0 en ese dominio). |

**Dependencias:** ninguna de UI.  
**Pruebas:** casos borde documentados en definiciones (+0,25→0, un ojo 0, ambos cil 0).

---

## Fase 2 — Estado `binocularEstado`

**Objetivo:** reemplazar el estado actual por uno alineado al nuevo grafo de fases.

Campos sugeridos (ajustar nombres al estilo del archivo):

- `paso`: `'esfera' | 'cilindro' | null` (o índice 0/1/fin).
- `fase`: incluir explícitamente un estado de transición inicial (ejemplo: `esperando_listo`) además de `mostrando_base` \| `mostrando_variante` \| `esperando_respuesta` \| `fin`.
- `rxBasePasoActual` / `rxVariante` o equivalente (snapshots OD/OI).
- `rxActiva` tras resolver cada preferencia.
- `omitirCilindro` boolean (true si al cerrar esfera ambos cil = 0).
- `transicionInicialCompletada` boolean (o equivalente) para asegurar que el subpaso de adaptación se ejecute una sola vez.
- Flags para evitar doble transición si el cliente llama dos veces con la misma respuesta (opcional).

`inicializarExamen` / reset debe incluir la nueva forma; **revocar** campos legados no usados para evitar confusiones.

---

## Fase 3 — `generarPasosEtapa6()`

**Objetivo:** emitir lista ordenada `foroptero` → `esperar_foroptero` → `tv` → `hablar` según §12 de definiciones.

| Tarea | Detalle |
|-------|---------|
| 3.1 | Al entrar en binocular sin estado: inicializar desde `construirRxBaseBinocular()`, validar prerequisitos (fino en normal; recalculados en testbin). |
| 3.2 | Subflujo de entrada: mostrar base binocular inicial (`open/open`) + TV + mensaje "avisame cuando estés listo"; dejar al motor en `esperando_listo`. |
| 3.3 | Tras confirmación "listo": iniciar secuencia esférica normal (mensaje previo de cambio -> variante -> pregunta); transiciones de `fase` coherentes con `obtenerInstrucciones` (que filtra solo `hablar` al agente). |
| 3.4 | Si `omitirCilindro`: tras resolver esfera, saltar a confirmación final y `confirmarResultadoBinocular`. |
| 3.5 | Secuencia cilíndrica análoga con `rxActiva` post-esfera. |
| 3.6 | TV: letra `H`, `logmar: 0.3` siempre. |
| 3.7 | Foróptero: ambos ojos `occlusion: 'open'`, cil/eje según snapshots. |

**Contrato:** cuando `fase === esperando_respuesta`, devolver `pasos: []` y `contexto` rico (`paso`, `fase`, quizá resumen numérico) para debugging.

---

## Fase 4 — `procesarRespuestaBinocular` y confirmación

**Objetivo:** separar respuesta de transición ("listo") de respuestas de comparación óptica.

| Tarea | Detalle |
|-------|---------|
| 4.1 | En `fase = esperando_listo`, interpretar solo intención de continuidad ("listo", "continuar", equivalentes) y avanzar al primer bloque comparativo. |
| 4.2 | En fases de comparación, reutilizar `interpretarPreferenciaLente` → `anterior` \| `actual` \| `igual`. |
| 4.3 | `igual` → tratar como **anterior** del paso (§8 definiciones). |
| 4.4 | Tras elegir, actualizar `rxActiva`; si terminó paso esfera y aplica cilindro, preparar siguiente subciclo; si no, llamar confirmación final. |
| 4.5 | `confirmarResultadoBinocular`: escribir resultado **por ojo** como objeto o tres campos nuevos; resetear `binocularEstado`; `avanzarTest()` hacia `FINALIZADO`. |

---

## Fase 5 — Resultados, detalle y compatibilidad

**Objetivo:** consumidores saben leer el nuevo formato.

| Tarea | Detalle |
|-------|---------|
| 5.1 | Decidir esquema: p. ej. `resultados.R.binocular` = `{ esfera, cilindro, angulo }` (breaking) **o** nuevas claves + deprecación documentada. |
| 5.2 | Actualizar `obtenerEstadoTest` / `obtenerResultadoTest` / `mapearTipoTestAResultado` si hoy asumen número. |
| 5.3 | Revisar cualquier serialización JSON en `server.js` que documente el campo `binocular`. |
| 5.4 | `obtenerDetalleExamen`: payloads de tests tipo `binocular` con `resultadoR` / `resultadoL` como objetos. |

---

## Fase 6 — Agente (`chatSupervisor`)

**Objetivo:** mensajes y mapeo de lenguaje natural alineados al nuevo guion.

| Tarea | Detalle |
|-------|---------|
| 6.1 | Ajustar `INSTRUCCIONES_BASE_CHATAGENT`: tabla ETAPA_6 si hace falta (mejor antes / ahora / igual). |
| 6.2 | Confirmar que el backend envía **literalmente** el texto acordado en `pasos[].mensaje` (§11 definiciones); el agente no parafrasea. |
| 6.3 | Definir handling del mensaje de transición "avisame cuando estés listo": el agente debe pasar `respuestaPaciente` y no forzar `interpretacionComparacion` en ese punto. |
| 6.4 | Verificar que llamadas sin `interpretacionComparacion` en `preguntando` sigan teniendo comportamiento definido (error claro o recuperación). |

---

## Fase 7 — UI y referencias externas

| Artefacto | Acción |
|-----------|--------|
| `reference_framer/ForopteroControl.tsx` | Mostrar resultado binocular como Rx completa si aplica. |
| Clientes / informes fuera del repo | Lista manual según uso interno. |

---

## Fase 8 — Documentación del repo

| Archivo | Acción |
|---------|--------|
| `DEFINICIONES_EXAMEN_BINOCULAR.md` | Marcar sección “implementado” o fecha cuando se mergee. |
| `examenprueba.md` | Actualizar § modo `testbin` y prerequisitos. |
| `PLAN_IMPLEMENTACION_TEST_BINOCULAR.md` | Obsoleto o redirigir a este plan + definiciones. |
| `DOCUMENTACION.md` | Breve nota de cambio breaking en `binocular` si aplica. |

---

## Fase 9 — QA y regresión

- Matriz manual mínima: examen normal con cil; sin cil (recalculados); testbin; un ojo esfera 0; un ojo cil 0; ambos cil 0 (omisión paso 2); respuestas `anterior` / `actual` / `igual` en cada paso.
- Validar transición nueva: al terminar `agudeza_alcanzada (L)` se abre binocular base, se emite mensaje de adaptación, y el flujo no cambia lentes hasta recibir "listo"/equivalente.
- Validar robustez conversacional: respuestas no esperadas en `esperando_listo` no deben disparar error de comparación binocular.
- Regresión: ETAPA_5 intacta; avance de secuencia post-binocular = `FINALIZADO`.
- Revisar logs del foróptero: orden de comandos y valores OD/OI.

---

## Orden recomendado de trabajo

1. Fase 1 → 2 → 3 → 4 (núcleo `motorExamen.js`).  
2. Fase 5 (resultados / API de detalle).  
3. Fase 6 (agente).  
4. Fase 7–8 (periféricos + docs).  
5. Fase 9 (cerrar).

---

## Riesgos y mitigación

| Riesgo | Mitigación |
|--------|------------|
| Breaking change en `binocular` | Versionado en API, o campos duplicados durante transición. |
| Doble submit de respuesta | Idempotencia o validación de `fase`. |
| Divergencia signos cilindro | Tests unitarios en Fase 1 contra ejemplos del doc (+ definiciones). |

---

## Checklist pre-merge

- [ ] Cumple `DEFINICIONES_EXAMEN_BINOCULAR.md` en comportamiento observable.
- [ ] Sin regresiones ETAPA_4/5.
- [ ] `testbin` documentado y probado.
- [ ] Agente alineado a mensajes y `interpretacionComparacion`.
