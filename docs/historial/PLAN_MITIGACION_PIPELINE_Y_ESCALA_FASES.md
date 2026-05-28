> **Archivo archivado** — movido a `docs/historial/` el 2026-05-28. Estado original: Implementado (2026-05-19)
> Ver [docs/ARQUITECTURA.md](../ARQUITECTURA.md) para la documentación vigente del sistema.

---

# Plan de acción — Mitigación del pipeline (log agudeza) y escalabilidad multi-fase

**Versión:** 0.1  
**Fecha:** 2026-05-19  
**Estado:** Implementado (2026-05-19)  
**Relacionado con:** [PLAN_BOOTSTRAP_EXAMEN.md](./PLAN_BOOTSTRAP_EXAMEN.md), [DISENO_AGENTE_INTERMEDIO.md](./DISENO_AGENTE_INTERMEDIO.md), `reference/foroptero-orchestrator/`

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Principios de arquitectura](#2-principios-de-arquitectura)
3. [Mapa problema → solución](#3-mapa-problema--solución)
4. [Reorganización de prompts y knowledge](#4-reorganización-de-prompts-y-knowledge)
5. [Fases de implementación](#5-fases-de-implementación)
6. [Inventario de cambios por archivo](#6-inventario-de-cambios-por-archivo)
7. [Criterios de aceptación y pruebas](#7-criterios-de-aceptación-y-pruebas)
8. [Riesgos y mitigaciones](#8-riesgos-y-mitigaciones)
9. [Fuera de alcance inmediato](#9-fuera-de-alcance-inmediato)

---

## 1. Resumen ejecutivo

Un examen de agudeza falló en producción de prueba por una **cadena de desalineaciones** entre intérprete, protocolo, auditor y fallback del pipeline, no por el bootstrap (turno 1 correcto). El paciente permaneció en **H @ 0.3** en TV mientras el sistema pedía “otra letra” o “repetí la letra”.

Este plan mitiga los **siete problemas** del log y, en paralelo, introduce la **estructura de agentes escalable**:

| Agente | Rol | Knowledge |
|--------|-----|-----------|
| **Intérprete** | Genérico (transversal) | `core/interpretacion-comun` + `fases/{fase}/interpretacion` |
| **Auditor** | Genérico | `core/auditoria-estructural` + `fases/{fase}/auditoria` |
| **Comunicación** | Genérico | `core/comunicacion-comun` + `fases/{fase}/comunicacion` |
| **Protocolo** | Específico por fase | `prompts/protocolo-{fase}.md` + `fases/{fase}/protocolo-estado` + `dispositivos` |

**Esfuerzo orientativo:** 1–2 días (documentación + prompts/knowledge + pipeline/fallback + pruebas E2E agudeza).

**Orden recomendado:** estabilizar agudeza con la nueva estructura **antes** de agregar fase `lentes`, para validar el patrón core + fase una sola vez.

---

## 2. Principios de arquitectura

| Principio | Implicación para este plan |
|-----------|----------------------------|
| **Protocolo = dueño del QUÉ clínico** | Problemas 3 y 5 se corrigen en `fases/agudeza/protocolo-estado` y `prompts/protocolo-agudeza.md`. |
| **Intérprete / auditor / comunicación = transversales** | Problemas 1, 2, 4 y 6 en prompts genéricos + `core/*`; reglas Sloan/logMAR solo en fase agudeza. |
| **Auditor no duplica el protocolo** | `fases/agudeza/auditoria.md` = checklist y anti-patrones con **referencia** al protocolo, no copia del árbol completo. |
| **Una fuente de verdad por regla clínica** | Cambio en árbol post-correcta → solo protocolo; auditor solo valida cumplimiento. |
| **Orquestador enruta por `estado.fase`** | Carga knowledge `(agente, fase)`; arma `estimulo` en user para agentes genéricos. |
| **Defensa en profundidad** | Prompts anclan reglas críticas; knowledge detalla; pipeline diferencia fallbacks. |

---

## 3. Mapa problema → solución

| # | Capa | Problema (log) | Causa raíz | Acción principal | Entregable |
|---|------|----------------|-----------|------------------|------------|
| **1** | Intérprete | "X" → `incorrecta` + `letraElegida: "X"` | Regla Sloan solo en knowledge largo; prompt genérico ausente | Clasificar letras fuera de Sloan como **`ambigua`**, `letraElegida: null` | `fases/agudeza/interpretacion.md` + prompt genérico `interprete.md` |
| **2** | Auditor | T2: bloquea rotación por `letraElegida` no Sloan | Auditor mezcla validación de intérprete con decisión de protocolo | Regla **estructural**: ante `incorrecta`/`no_ve`, no rechazar protocolo solo por `letraElegida` inválida; nota en `correccionSugerida` si intérprete debió `ambigua` | `core/auditoria-estructural.md` + `prompts/auditor.md` |
| **3** | Protocolo | T3: no baja 0.3→0.2 ni `tv` tras 1.er acierto | Árbol “contador = 1” no anclado en prompt de protocolo | Obligar paso 3 del árbol: bajar logMAR + rotar letra + `tv`; prohibir `siguiente_optotipo` con `acciones: []` en ese caso | `prompts/protocolo-agudeza.md` + `fases/agudeza/protocolo-estado.md` |
| **4** | Auditor | T3: aprobó propuesta inválida | Checklist post-correcta solo en knowledge, no en prompt | Anti-patrón explícito: “solo contador” + `siguiente_optotipo` sin `tv` con logMAR > 0.0 | `fases/agudeza/auditoria.md` + `prompts/auditor.md` |
| **5** | Protocolo | T4: cierre R→L sin evento/MQTT | Checklist R→L insuficiente en prompt | Mismo turno: `cierre_ojo_R_e_inicio_L` + patch L + foróptero + TV H@0.3 | `prompts/protocolo-agudeza.md` (árbol paso 2, contador ≥ 2) |
| **6** | Pipeline / comunicación | Fallback “no entendí” en T2/T4 con respuestas clínicas válidas/semiválidas | Un solo `fallbackRepregunta` para todo rechazo de auditor | Bifurcar fallbacks por causa; comunicación alineada a `repregunta_clinica` vs `error_auditoria` vs `ambigua` | `pipelineTurno.js` + `core/comunicacion-comun.md` |
| **7** | Coherencia dispositivo–estado | TV no actualiza tras T1 | Efecto acumulado de 2–6: turnos aprobados sin `tv` o fallbacks sin MQTT | Corregir 1–5; test E2E que exija `accionesEjecutadas` con `tv` tras 1.ª correcta | Tests + AC en §7 |

---

## 4. Reorganización de prompts y knowledge

### 4.1 Estructura objetivo de carpetas

```text
reference/foroptero-orchestrator/
  prompts/
    interprete.md              # GENÉRICO
    auditor.md                 # GENÉRICO
    comunicacion.md            # GENÉRICO
    protocolo-agudeza.md       # ESPECÍFICO fase agudeza
    protocolo-lentes.md        # (futuro)

  knowledge/
    core/
      interpretacion-comun.md
      auditoria-estructural.md
      comunicacion-comun.md
    dispositivos.md            # compartido (foróptero + TV)
    fases/
      agudeza/
        interpretacion.md      # ← hoy interpretacion-paciente.md (recortado)
        protocolo-estado.md    # ← hoy protocolo-agudeza-estado.md
        auditoria.md           # ← hoy auditoria-protocolo.md (checklist, sin duplicar árbol)
        comunicacion.md        # ← hoy comunicacion-paciente.md (plantillas agudeza)
      lentes/                  # (futuro, misma forma)
```

### 4.2 Contenido mínimo por capa (mitigación del log)

#### `prompts/interprete.md` (genérico)

- Rol: clasificación lingüística para la **fase del user** (`fase: agudeza`).
- Usar **estímulo de referencia** del user (no hardcodear `letraActual`).
- Bootstrap / continuacion / `confianza < 0.7` → reglas transversales.
- Remisión: “reglas de estimulo en knowledge de la fase activa”.

#### `knowledge/fases/agudeza/interpretacion.md` (problema 1)

- Letras Sloan: H, O, T, E, C, F, Z, L, P, D.
- Fuera de Sloan (X, A, I, S, N, …) → **`ambigua`**, `letraElegida: null`.
- `incorrecta` solo con Sloan ≠ `letraActual`.
- Ejemplo explícito: pantalla H, paciente “equis” → `ambigua`.

#### `prompts/auditor.md` (genérico)

- Dos capas: (1) `core/auditoria-estructural`, (2) checklist fase en user/knowledge.
- Modo bootstrap: validar contra checklist de fase.
- No rechazar protocolo por `letraElegida` no Sloan si clasificación es `incorrecta`/`no_ve` (problema 2).

#### `knowledge/core/auditoria-estructural.md` (problema 2)

- Separar responsabilidades intérprete vs protocolo.
- `ambigua` / `confianza_baja` → `acciones: []`.
- Orden foróptero → TV.
- Coherencia grave: `correcta` con `letraElegida` ≠ estímulo de fase.

#### `knowledge/fases/agudeza/auditoria.md` (problemas 4, 5)

- Checklist simulación `aciertosPorLogmar` post-patch.
- Anti-patrón **solo contador** (T3).
- Cierre ≥ 2: `logmarFinal`, sin `tv` en ese ojo; R → `cierre_ojo_R_e_inicio_L` + MQTT L (T4).
- Referencias por sección a `protocolo-estado.md` (no reescribir el árbol).

#### `prompts/protocolo-agudeza.md` (problemas 3, 5)

- Árbol post-**correcta** en orden (simular → ≥2 cierre → =1 bajar/rotar + `tv`).
- Prohibiciones explícitas del log.
- Incorrecta en 0.3: rotar + `tv` (independiente de `letraElegida`).
- Mini-ejemplo QA: 1.ª correcta en 0.3 → 0.2 + nueva letra + `tv`.

#### `knowledge/fases/agudeza/protocolo-estado.md`

- Mantener reglas actuales; añadir nota “prompt de rol repite pasos críticos 3 y 5”.
- Sin duplicar en auditoría.

#### `prompts/comunicacion.md` + `core/comunicacion-comun.md` (problema 6, apoyo 7)

- Plantillas por `evento` + clasificación vienen de `fases/agudeza/comunicacion.md`.
- `siguiente_optotipo` → plantilla “siguiente letra”; `repregunta_sin_cambio` → repetir sin anunciar cambio.
- (Futuro user payload) Si `acciones` vacías y evento no es repregunta → no anunciar nuevo estímulo.

#### `pipelineTurno.js` (problema 6 — código)

| Causa del fallo | Fallback / mensaje |
|-----------------|-------------------|
| Auditor rechazó tras reintentos | `fallbackAuditoria`: mensaje neutro (“Un momento, ajustamos el examen”) + log violaciones; **no** “no entendí la letra” si clasificación fue `correcta` o `incorrecta` con candidata clara |
| Intérprete `ambigua` / `confianza_baja` (turno normal) | Mantener `fallbackRepregunta` o dejar al protocolo `repregunta_sin_cambio` + comunicación |
| Bootstrap fallido | Mantener `fallbackBootstrap` existente |

Registrar en historial: `detalleEvento.motivo`: `fallback_auditoria` | `fallback_repregunta` | `fallback_bootstrap`.

---

## 5. Fases de implementación

### Fase A — Reorganización documental (sin cambiar comportamiento)

**Objetivo:** crear carpetas `core/` y `fases/agudeza/`; mover contenido actual; actualizar `knowledge/README.md`.

| Tarea | Detalle |
|-------|---------|
| A.1 | Crear `knowledge/core/*` y `knowledge/fases/agudeza/*` copiando desde archivos actuales |
| A.2 | Recortar duplicación: auditoría-agudeza = checklist; protocolo = árbol completo |
| A.3 | Renombrar `prompts/protocolo.md` → `protocols/protocolo-agudeza.md` (contenido agudeza) |
| A.4 | Redactar prompts genéricos vacíos de referencias Sloan/logMAR |

**Salida:** estructura lista; tests aún pueden apuntar a rutas viejas hasta Fase B.

---

### Fase B — Mitigación clínica agudeza (problemas 1, 3, 5)

**Objetivo:** corregir reglas que produjeron el log.

| Tarea | Problema |
|-------|----------|
| B.1 | `fases/agudeza/interpretacion.md`: X → ambigua |
| B.2 | `protocolo-agudeza.md` + protocolo-estado: árbol contador = 1 y cierre ≥ 2 |
| B.3 | Ejemplos trabajados en protocolo (1.ª correcta 0.3; cierre R→L) |

**Salida:** contenido clínico correcto en documentación; pendiente cableado si `knowledge.js` aún no enruta por fase.

---

### Fase C — Auditoría y prompts genéricos (problemas 2, 4)

| Tarea | Problema |
|-------|----------|
| C.1 | `core/auditoria-estructural.md`: regla letraElegida vs incorrecta |
| C.2 | `fases/agudeza/auditoria.md`: anti-patrón solo contador; checklist R→L |
| C.3 | `prompts/auditor.md`: dos capas + remisión a fase |

**Salida:** criterios de rechazo/aprobación alineados al log esperado.

---

### Fase D — Orquestador: carga por fase (habilita escala)

| Tarea | Detalle |
|-------|---------|
| D.1 | `lib/knowledge.js`: `cargarSystemAgente(agente, fase)` → core + `fases/{fase}/*` |
| D.2 | Protocolo: `cargarSystemAgente('protocolo', fase)` con `protocolo-{fase}.md` |
| D.3 | `interprete.js`: `estadoParaInterprete` → objeto `estimulo` por fase (agudeza: letra + logmar + ojo) |
| D.4 | `comunicacion.js`: incluir en user `acciones.length` o flag `huboCambioDispositivo` (problema 7 UX) |

**Salida:** agudeza funciona con bundles; agregar `lentes` = nueva carpeta sin nuevos agentes.

---

### Fase E — Pipeline y fallbacks (problema 6)

| Tarea | Detalle |
|-------|---------|
| E.1 | `fallbackAuditoria()` distinto de `fallbackRepregunta()` |
| E.2 | Elegir fallback según `traza.auditoria` + `traza.interpretacion.clasificacion` |
| E.3 | Mensajes en `core/comunicacion-comun.md` para fallo auditoría |
| E.4 | Log `motivo` en `detalleEvento` |

**Salida:** T2/T4 no dicen “no entendí” cuando el paciente fue entendido.

---

### Fase F — Validación E2E (problema 7 + regresión)

**Escenario mínimo (repro del log corregido):**

```text
T0  bootstrap        → TV H@0.3, R abierto
T1  "veo una X"      → ambigua, repregunta, TV sigue H (o rotación si se elige incorrecta+Sloan en otro test)
T2  "veo una H"      → correcta, TV nueva letra @ 0.2, aciertos 0.3:1
T3  (continuar 0.2)  → no cierre R en segunda H@0.3
```

**Escenario cierre R→L:**

```text
… dos aciertos acumulados en mismo logMAR …
→ evento cierre_ojo_R_e_inicio_L, foróptero L, TV H@0.3, ojoActual L
```

| ID | Criterio |
|----|----------|
| AC1 | Tras 1.ª `correcta` en 0.3: `accionesEjecutadas` incluye `tv` con `logmar: 0.2` |
| AC2 | "veo una X" → `interpretacion.clasificacion === 'ambigua'` |
| AC3 | Auditor no rechaza rotación en 0.3 solo por `letraElegida` no Sloan si clasificación es `incorrecta` |
| AC4 | Auditor rechaza patch que solo incrementa contador con `siguiente_optotipo` y sin `tv` |
| AC5 | Cierre R: un turno con `cierre_ojo_R_e_inicio_L` y ≥2 acciones MQTT |
| AC6 | Fallback auditoría ≠ texto de ambigua fonética |
| AC7 | 10 corridas escenario T0–T2: ≥9 cumplen AC1–AC2 |

---

## 6. Inventario de cambios por archivo

| Archivo | Acción | Fases |
|---------|--------|-------|
| `knowledge/core/interpretacion-comun.md` | **Crear** | A |
| `knowledge/core/auditoria-estructural.md` | **Crear** | A, C |
| `knowledge/core/comunicacion-comun.md` | **Crear** | A, E |
| `knowledge/fases/agudeza/interpretacion.md` | **Mover/adaptar** desde `interpretacion-paciente.md` | A, B |
| `knowledge/fases/agudeza/protocolo-estado.md` | **Mover** desde `protocolo-agudeza-estado.md` | A, B |
| `knowledge/fases/agudeza/auditoria.md` | **Mover/recortar** desde `auditoria-protocolo.md` | A, C |
| `knowledge/fases/agudeza/comunicacion.md` | **Mover** desde `comunicacion-paciente.md` | A |
| `prompts/interprete.md` | **Reescribir** genérico | A, B |
| `prompts/auditor.md` | **Reescribir** genérico | A, C |
| `prompts/comunicacion.md` | **Reescribir** genérico | A |
| `prompts/protocolo-agudeza.md` | **Crear** (contenido actual + árbol T3/T5) | A, B |
| `prompts/protocolo.md` | **Deprecar** o alias a agudeza | A |
| `lib/knowledge.js` | **Refactor** `KNOWLEDGE_BY_AGENT` → `(agente, fase)` | D |
| `agents/interprete.js` | User: `estimulo` + `fase` | D |
| `agents/comunicacion.js` | User: flag cambio dispositivo | D |
| `pipelineTurno.js` | `fallbackAuditoria` | E |
| `knowledge/README.md` | Mapa core + fases | A |
| Archivos viejos en raíz `knowledge/*.md` | **Eliminar** tras migración | A (final) |

---

## 7. Criterios de aceptación y pruebas

### 7.1 Matriz turno esperado (post-plan)

| Turno | Input paciente | Intérprete | Protocolo (evento) | TV / estado |
|-------|----------------|------------|----------------------|-------------|
| 0 | (bootstrap) | continuacion | `inicio_ojo` | H@0.3 |
| 1 | "veo una X" | `ambigua` | `repregunta_sin_cambio` | H@0.3 sin cambio |
| 2 | "veo una H" | `correcta` | `siguiente_optotipo` | Letra nueva @ **0.2** |
| … | … | … | … | … |
| n | 2.ª correcta mismo logMAR ≥2 | `correcta` | `cierre_ojo_R_e_inicio_L` | L H@0.3 |

### 7.2 Pruebas automatizables (cuando existan)

- Snapshot de `historial[].acciones` con presencia de `tv` tras correcta con contador 1.
- Assert `interpretacion.clasificacion` para corpus ["veo una X", "equis", "la equis"] → `ambigua`.
- Assert auditoría rechaza propuesta “solo contador” (fixture JSON).

### 7.3 Validación multi-fase (smoke futuro)

Al crear `fases/lentes/`:

- Intérprete/auditor/comunicación **sin cambiar prompts genéricos**.
- Solo agregar bundle + `protocolo-lentes.md` + routing `fase === 'lentes'`.

---

## 8. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| LLM ignora knowledge largo | Persisten T3/T4 | Reglas críticas duplicadas en **prompt de protocolo-agudeza** (corto) |
| Migración de paths rompe deploy | Build roto | Fase A mantiene aliases temporales en `knowledge.js` |
| Fallback nuevo confunde al paciente | UX | Copy revisado con operador clínico; A/B en logs |
| Schema `evento` solo agudeza | Bloquea lentes | Fase futura: schema por fase o union documentada (§9) |
| Duplicación core vs fase | Drift | README con tabla “dónde vive cada regla” |

---

## 9. Fuera de alcance inmediato

- Fase **lentes** (solo carpeta placeholder y convención de nombres).
- Validador determinista en código del árbol logMAR.
- Persistencia de sesión / multi-paciente.
- Cambio del contrato Realtime (`respuestaPaciente` + `confianza` se mantiene).
- `MAX_REINTENTOS_PROTOCOLO > 1` (evaluar tras Fase E si fallos de auditoría bajan).

---

## 10. Orden de ejecución recomendado (checklist)

- [x] **A** Reorganizar knowledge core + fases/agudeza  
- [x] **B** Reglas clínicas protocolo (T3, T5) + intérprete Sloan (T1)  
- [x] **C** Auditor estructural + checklist agudeza (T2, T4)  
- [x] **D** Cablear `knowledge.js` y user `estimulo` por fase  
- [x] **E** Fallback auditoría en pipeline  
- [ ] **F** E2E escenario log + cierre R→L; cerrar AC1–AC7 (manual con `npm run test:agent`)  

---

## Referencias

- Log analizado: sesión 2026-05-19 (bootstrap OK; T2–T4 fallidos).
- `reference/foroptero-orchestrator/knowledge/protocolo-agudeza-estado.md` — árbol post-correcta.
- `reference/PLAN_BOOTSTRAP_EXAMEN.md` §9 — escalabilidad multi-fase.
