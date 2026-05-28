# Plan — Ajuste de user prompts (mínima información necesaria)

**Estado:** etapas 1–3 implementadas (2026-05-28); etapa 4 (`rx` condicional) pendiente  
**Scope:** solo strings de user prompts y campos de vistas; sin tocar lógica de negocio, schemas de output, ni knowledge/prompts existentes.  
**Referencia análisis:** chat [Análisis user prompts por agente](análisis-previo)

---

## Principio rector

`contratos-agentes.md`: *"Regla del menor contexto: cada agente recibe el subconjunto mínimo necesario para su salida."*

El análisis del log del 2026-05-28 detectó cuatro violaciones sistemáticas a este principio:

| # | Violación | Agentes afectados |
|---|-----------|-------------------|
| V-1 | Header del user prompt duplica instrucciones del system prompt | Protocolo, Auditor, Comunicación |
| V-2 | `rx` enviado en todos los turnos; solo se necesita en plantillas A y D | Protocolo, Auditor |
| V-3 | Datos del ojo no activo completos; solo se necesita `logmarFinal` | Protocolo, Auditor |
| V-4 | Campos de `interpretacion` no utilizados por el agente receptor | Protocolo, Auditor |

Violación exclusiva del intérprete:

| # | Violación | Agente |
|---|-----------|--------|
| V-5 | `confianza` duplicado (en JSON + sección separada) | Intérprete |
| V-6 | `estimulo.logmarActual` y `estimulo.ojo` no utilizados para clasificar | Intérprete |

---

## Cambios propuestos por agente

### A. Agente Intérprete

**Afecta:** `agents/interprete.js` → función de construcción del user + `lib/vistasAgentes.js` (VistaInterprete)

#### A-1. Eliminar sección duplicada de confianza

Actualmente el user prompt incluye el valor de confianza dentro del JSON **y** como sección de texto:

```
## Confianza de captura (0-1)

0.95

Clasificá y devolvé el JSON del schema.
```

**Cambio:** eliminar la sección `## Confianza de captura`. El valor ya está en `confianza` dentro del JSON. La instrucción de cierre queda como línea única al final del JSON.

#### A-2. Eliminar `estimulo.logmarActual` y `estimulo.ojo` de VistaInterprete

El intérprete compara `respuestaPaciente` con `estimulo.letraActual`. El tamaño de la letra (logmar) y el ojo no condicionan ninguna regla de clasificación lingüística.

El knowledge `interpretacion.md` confirma: *"`estimulo.logmarActual` es solo contexto; no decidís transiciones."*

**Cambio:** VistaInterprete pasa de:
```json
"estimulo": { "tipo": "letra_logmar", "letraActual": "H", "logmarActual": 0.3, "ojo": "R" }
```
a:
```json
"estimulo": { "letraActual": "H" }
```

**Dependencia en knowledge:** `knowledge/fases/agudeza/interpretacion.md` línea 4 menciona `logmarActual` y `ojo` como campos de la vista. Actualizar para reflejar que son campos eliminados. No modifica ninguna regla de clasificación.

#### A-3. Eliminar `estimulo.tipo` de VistaInterprete

`"tipo": "letra_logmar"` es constante en toda la fase agudeza. La fase ya está indicada en `"fase": "agudeza"`.

**Cambio:** eliminar campo `tipo` de `estimulo`.

**Dependencia en knowledge:** `interpretacion.md` línea 4 referencia `estimulo.tipo`. Actualizar a: *"En fase agudeza el estímulo es siempre una letra Sloan; el campo de referencia es `estimulo.letraActual`."*

---

### B. Agente Protocolo

**Afecta:** `agents/protocolo.js` → construcción del user + `lib/vistasAgentes.js` (VistaProtocolo)

#### B-1. Eliminar el header de instrucciones del user prompt

El header actual contiene cuatro recordatorios que ya están íntegramente en `prompts/protocolo-agudeza.md`:

```
Los contadores en `agudeza[ojoActual].contadoresLogmarActual` **ya incluyen** este turno...
**Prohibido** incluir `resultadosPorLogmar` ni `aciertosPorLogmar` en `estadoPatch`.
En plantillas B/C: `letraActual` debe ser **∉** `letrasUsadas`...
Si `agudeza.R.logmarFinal != null`, está prohibido `cierre_ojo_R_e_inicio_L` (BUG-006)...
```

**Cambio:** eliminar el bloque de header. El user prompt queda como JSON directo seguido de la instrucción de cierre: `Aplicá el protocolo y devolvé el JSON del schema.`

Los códigos `BUG-005` / `BUG-006` son jerga interna de desarrollo; no deben aparecer en el user prompt.

#### B-2. Condicionar `rx` según ojo activo

`rx` solo es necesaria en:
- Plantilla A (bootstrap): config foróptero del ojo activo + oclusión contralateral
- Plantilla D (CIERRE R→L): config foróptero de L con RX_L

En todos los turnos con `ojoActual == "L"` (plantillas B, C, E, F del ojo L), el protocolo no emite ninguna acción de foróptero y `rx` es irrelevante.

**Cambio en VistaProtocolo:** incluir `rx` solo cuando `ojoActual == "R"`. Cuando `ojoActual == "L"`, omitir `rx` del JSON.

*Nota: para `ojoActual == "R"` siempre se incluye porque no podemos saber de antemano si el turno terminará en CIERRE R→L (depende del contador post-registro).*

#### B-3. Reducir datos del ojo no activo a solo `logmarFinal`

El protocolo necesita del ojo no activo únicamente `agudeza[otroOjo].logmarFinal` para evaluar si R ya está cerrado (gate BUG-006).

Los campos `letraActual`, `letrasUsadas`, `logmarActual` y `contadoresLogmarActual` del ojo no activo no participan en ninguna rama de la tabla de decisión.

**Cambio en VistaProtocolo:** para el ojo no activo, incluir solo:
```json
"<otroOjo>": { "logmarFinal": <valor o null> }
```

#### B-4. Reducir `interpretacion` a campos utilizados

El protocolo usa `interpretacion.clasificacion` (para elegir plantilla) e `interpretacion.letraElegida` (para verificar coherencia). No usa `letrasCandidatas` ni `notasInterprete`.

**Cambio en VistaProtocolo:** pasar de:
```json
"interpretacion": { "clasificacion": "correcta", "letraElegida": "H", "letrasCandidatas": ["H"], "notasInterprete": "..." }
```
a:
```json
"interpretacion": { "clasificacion": "correcta", "letraElegida": "H" }
```

---

### C. Agente Auditor

**Afecta:** `agents/auditor.js` → construcción del user + `lib/vistasAgentes.js` (VistaAuditor)

La VistaAuditor es igual a VistaProtocolo + `intentoRecienRegistrado` + `propuestaProtocolo`. Los mismos cambios B-2, B-3 y B-4 aplican. Se agregan:

#### C-1. Eliminar el header de instrucciones del user prompt

El header actual repite tres reglas del system prompt (`auditor.md`):

```
El estado clínico está en la vista; **no** hay historial ni razonamientos de turnos previos.
Validá `propuestaProtocolo.letrasUsadasResultantes[ojoActual]` contra...
Para correcta, citá `intentoRecienRegistrado.contadoresPostRegistro` o...
```

**Cambio:** eliminar el bloque de header. Instrucción de cierre: `Auditá y devolvé el JSON del schema.`

#### C-2. Mismos cambios B-2, B-3, B-4 aplicados a VistaAuditor

El auditor tampoco necesita `rx` cuando `ojoActual == "L"`, ni datos del ojo no activo más allá de `logmarFinal`, ni `letrasCandidatas` / `notasInterprete` de interpretación.

*Nota: `intentoRecienRegistrado` y `propuestaProtocolo` (incluyendo `letrasUsadasResultantes`) se mantienen intactos.*

---

### D. Agente Comunicación

**Afecta:** `agents/comunicacion.js` → construcción del user + `lib/vistasAgentes.js` (VistaComunicacion)

#### D-1. Eliminar el header de instrucciones del user prompt

El header actual repite dos reglas de `comunicacion.md`:

```
Usá los flags pre-computados para `contextoVoz` (tabla en comunicacion-comun.md).
**No** derivar `contextoVoz` del `evento` ni de razonamientos previos.
```

**Cambio:** eliminar el bloque de header. Instrucción de cierre: `Redactá mensajes y devolvé el JSON del schema.`

#### D-2. Eliminar `modo` de VistaComunicacion

Ninguna regla de `comunicacion-comun.md` ni de `knowledge/fases/agudeza/comunicacion.md` depende del valor `modo` (bootstrap vs respuesta). La selección de plantilla se basa en `evento` y en los flags booleanos.

**Cambio:** eliminar campo `modo` de VistaComunicacion.

#### D-3. Mantener `interpretacion.notasInterprete` solo en el caso ambigua

`comunicacion.md` usa `notasInterprete` para desambiguación:
> *"Desambiguación (si `notasInterprete` indica par): '¿Decís hache o ce?'"*

Por lo tanto **no se elimina** `notasInterprete` de VistaComunicacion.  
Sí se elimina `letrasCandidatas` (no referenciada en ninguna plantilla de comunicación).

**Cambio:** en `interpretacion` de VistaComunicacion, eliminar solo `letrasCandidatas`.

---

## Casuísticas de validación

Para cada cambio propuesto, se define la casuística que lo ejercita y confirma que el prompt mínimo es suficiente.

### Tabla de casuísticas — Intérprete

| ID | Escenario | Campos mínimos necesarios | Valida cambio |
|----|-----------|--------------------------|---------------|
| I-1 | correcta: H → "veo una h" (confianza 0.95) | `letraActual: H`, `respuestaPaciente`, `confianza` | A-1, A-2, A-3 |
| I-2 | incorrecta Sloan: H → "veo una o" | `letraActual: H`, `respuestaPaciente`, `confianza` | A-2, A-3 |
| I-3 | incorrecta fuera de Sloan: H → "veo una equis" | `letraActual: H`, `respuestaPaciente`, `confianza` | A-2, A-3 |
| I-4 | no_ve: "no la veo" | `letraActual: T`, `respuestaPaciente`, `confianza` | A-2 |
| I-5 | ambigua: par de riesgo H/C → "veo una che" | `letraActual: H`, `respuestaPaciente`, `confianza` | A-2 |
| I-6 | confianza_baja: confianza 0.60 | `letraActual: E`, `respuestaPaciente`, `confianza: 0.60` | A-1 |
| I-7 | frase_paciente_no_clinica: "muy bien gracias" | `letraActual: O`, `respuestaPaciente`, `confianza` | A-2 |

*Bootstrap no invoca el intérprete; no aplica casuística.*

**Argumento:** en todos los casos, la decisión del intérprete depende solo de `letraActual` + `respuestaPaciente` + `confianza`. `logmarActual`, `ojo` y `tipo` no aparecen en ninguna regla del `interpretacion-comun.md` ni de `interpretacion.md` (agudeza).

---

### Tabla de casuísticas — Protocolo

Basado en la tabla de decisión de `protocolo-agudeza.md` (filas 1–8) + reintento con feedback.

| ID | Escenario (fila tabla) | Cambios validados | Campos mínimos requeridos |
|----|------------------------|-------------------|--------------------------|
| P-1 | Bootstrap ojo R (modo bootstrap) | B-1 | `ojoActual:R`, `agudeza.R` null, `agudeza.L.logmarFinal:null`, `rx.R`, `rx.L` |
| P-2 | Bootstrap ojo L (modo bootstrap) | B-1 | `ojoActual:L`, `agudeza.L` null, `agudeza.R.logmarFinal: 0.2`, `rx.L` |
| P-3 | Fila 2: correcta, c=1, logmar=0.3→0.2, ojo R | B-1, B-2\*, B-3, B-4 | `ojoActual:R`, `agudeza.R` completo, `agudeza.L.logmarFinal:null`, `interpretacion.clasificacion`, `letraElegida` |
| P-4 | Fila 3: correcta, c=1, logmar=0.0, ROTAR_0, ojo R | B-1, B-2\*, B-3, B-4 | ídem P-3 |
| P-5 | Fila 4: correcta, c=2, ojo R, R.logmarFinal null → Plantilla D | B-1, B-3 | `ojoActual:R`, `agudeza.R` completo, `agudeza.L.logmarFinal:null`, `rx.R`, `rx.L`, `interpretacion.clasificacion` |
| P-6 | Fila 5: correcta, c=2, ojo L → Plantilla E | B-1, **B-2 elimina rx**, B-3, B-4 | `ojoActual:L`, `agudeza.L` completo, `agudeza.R.logmarFinal: valor`, `interpretacion.clasificacion` |
| P-7 | Fila 6: no_ve, logmar=0.1→0.2, ojo R | B-1, B-2\*, B-3, B-4 | `ojoActual:R`, `agudeza.R` completo, `agudeza.L.logmarFinal:null`, `interpretacion.clasificacion` |
| P-8 | Fila 7: no_ve, logmar=0.3, ROTAR_TOPE, ojo R | B-1, B-2\*, B-3, B-4 | ídem P-7 |
| P-9 | Fila 8: ambigua → Plantilla F | B-1, B-2\*, B-3, B-4 | `ojoActual`, `agudeza[ojoActual]`, `interpretacion.clasificacion` |
| P-10 | Fila 2: correcta, c=1, ojo L (R.logmarFinal set) → NO cerrar | B-1, **B-2 elimina rx**, B-3, B-4 | `ojoActual:L`, `agudeza.L` completo, `agudeza.R.logmarFinal: valor`, `interpretacion.clasificacion` |
| P-11 | Reintento con feedbackAuditor (correccionSugerida) | B-1 | todos los anteriores + `feedbackAuditor` |

\* B-2 para ojo R: `rx` se incluye (no se puede descartar CIERRE R→L sin conocer c de antemano).

**Argumento clave B-2 (rx en ojo L):** cuando `ojoActual == "L"`, las plantillas posibles son B, C, E, F. Ninguna de ellas emite acción de foróptero. `rx` no es referenciada en ninguna de esas plantillas. El protocolo puede ejecutar P-6 y P-10 sin `rx`.

**Argumento clave B-3 (ojo no activo):** en todos los escenarios, la única información del ojo no activo que el protocolo consulta es `logmarFinal` (para el gate BUG-006). `letraActual`, `letrasUsadas` y `contadoresLogmarActual` del ojo no activo no aparecen en ninguna plantilla ni en la tabla de decisión.

---

### Tabla de casuísticas — Auditor

Basado en los fixtures `AUD-01` a `AUD-14` y el checklist de `auditoria.md`.

| ID | Fixture / escenario | Resultado esperado | Cambios validados |
|----|--------------------|--------------------|-------------------|
| AU-01 | AUD-01: no_ve @0.1, patch sube a E@0.2 sin contadores | `aprobado: true` | C-1, B-3, B-4 |
| AU-02 | AUD-02: no_ve pero patch incrementa contador | `aprobado: false` | C-1 |
| AU-03 | AUD-03: correcta sin tv (solo contador) | `aprobado: false` | C-1, B-4 |
| AU-04 | AUD-04: correcta 2.º en 0.2 ojo R, cierre R→L completo | `aprobado: true` | C-1, B-3 |
| AU-05 | AUD-05: no_ve sube dos pasos 0.1→0.3 | `aprobado: false` | C-1 |
| AU-06 | AUD-06: ambigua, acciones vacías | `aprobado: true` | C-1, B-4 |
| AU-07 | AUD-07: no_ve resetea contador ganado | `aprobado: false` | C-1 |
| AU-11 | AUD-11: BUG-005 correcto — letra T ∉ previas ["H","O"] | `aprobado: true` | C-1, B-3 |
| AU-12 | AUD-12: BUG-005 — BAJAR 0.1→0.0, reutiliza H | `aprobado: false` | C-1, B-3 |
| AU-13 | AUD-13: BUG-006 — L@0.3 c=1, R.logmarFinal set, propone cierre R→L | `aprobado: false` | C-1, **B-2 (rx ausente en L)**, B-3 |
| AU-14 | AUD-14: corrección BUG-006 — BAJAR L O@0.2 | `aprobado: true` | C-1, **B-2 (rx ausente en L)**, B-3 |
| AU-15 | Bootstrap ojo R, patch H@0.3 + foróptero correcto | `aprobado: true` | C-1 |
| AU-16 | BUG-003: cierre prematuro c=1 | `aprobado: false` | C-1, B-3 |
| AU-17 | BUG-004: c≥2 en L, protocolo emite siguiente_optotipo en vez de cierre | `aprobado: false` | C-1, B-3 |
| AU-18 | L mal anidado en raíz del patch (regresión 2026-05-19) | `aprobado: false` | C-1, B-3 |

**Argumento clave AU-13 / AU-14 (rx en ojo L):** en estos fixtures `ojoActual == "L"` y `R.logmarFinal` ya está definido. El auditor necesita verificar BUG-006 con `agudeza.R.logmarFinal` del estado. La `rx` no aparece en ningún checklist del auditor. Confirma que B-2 no rompe la validación.

---

### Tabla de casuísticas — Comunicación

Basado en la tabla canónica de `contextoVoz` y las plantillas de `comunicacion.md`.

| ID | Escenario | `contextoVoz` esperado | Cambios validados |
|----|-----------|------------------------|-------------------|
| CO-1 | `esPrimerTurnoExamen: true` → inicio_ojo | `inicio` | D-1, D-2 |
| CO-2 | `esCambioDeOjo: true` → cierre_ojo_R_e_inicio_L | `inicio` | D-1, D-2 |
| CO-3 | siguiente_optotipo + correcta, turno normal | `esperar_respuesta` | D-1, D-2, D-3 |
| CO-4 | siguiente_optotipo + no_ve / incorrecta | `esperar_respuesta` | D-1, D-2, D-3 |
| CO-5 | repregunta_sin_cambio + ambigua | `esperar_respuesta` | D-1, D-2 |
| CO-6 | repregunta_sin_cambio + par de riesgo H/C (notasInterprete) | `esperar_respuesta` + pregunta desambiguación | D-2, **D-3 confirma mantener notasInterprete** |
| CO-7 | `esExamenFinalizado: true` → examen_finalizado | `continuar_sin_respuesta` | D-1, D-2 |
| CO-8 | fallback_auditoria | `esperar_respuesta` | D-1, D-2 |
| CO-9 | siguiente_optotipo + `huboCambioDispositivo: false` | no anunciar letra nueva | D-1, D-2 |

**Argumento D-2 (eliminar `modo`):** en todos los escenarios, `contextoVoz` se determina por los 4 flags booleanos (tabla canónica de `comunicacion-comun.md`). El valor `modo: bootstrap` vs `modo: respuesta` no aparece en ninguna regla de comunicación. CO-1 confirma que el bootstrap se maneja por `esPrimerTurnoExamen` o `esPrimerTurnoOjoActivo`, no por `modo`.

**Argumento D-3 (mantener `notasInterprete` en comunicación):** CO-6 ejercita el único caso donde `notasInterprete` afecta el output. El agente debe recibir este campo para elegir "¿Decís hache o ce?" en lugar del genérico "no llegué a entender bien la letra".

---

## Resumen de cambios y dependencias en knowledge

| Cambio | Requiere actualizar knowledge | Archivo | Qué actualizar |
|--------|------------------------------|---------|----------------|
| A-2: eliminar `estimulo.logmarActual` y `ojo` | Sí | `knowledge/fases/agudeza/interpretacion.md` línea 4 | Actualizar descripción de VistaInterprete: eliminar `logmarActual` y `ojo` de la lista de campos |
| A-3: eliminar `estimulo.tipo` | Sí | `knowledge/fases/agudeza/interpretacion.md` línea 4 | Reemplazar referencia a `tipo === "letra_logmar"` por: "en fase agudeza el estímulo siempre es una letra Sloan; campo de referencia: `estimulo.letraActual`" |
| B-1: eliminar header protocolo | No | — | — |
| B-2: condicionar `rx` | No | — | — |
| B-3: reducir ojo no activo | No | — | El system prompt ya lee `agudeza[otroOjo].logmarFinal` literalmente |
| B-4: reducir `interpretacion` | No | — | — |
| C-1: eliminar header auditor | No | — | — |
| C-2 (= B-2/B-3/B-4 en auditor) | No | — | — |
| D-1: eliminar header comunicación | No | — | — |
| D-2: eliminar `modo` de comunicación | No | — | — |
| D-3: eliminar `letrasCandidatas` de comunicación | No | — | — |

**Cambios en knowledge: 2 actualizaciones menores en `interpretacion.md` (agudeza), sin impacto en reglas de clasificación.**

---

## Orden de implementación

### Etapa 1 — Sin riesgo (solo headers y duplicados)

Cambios que eliminan texto redundante del user prompt sin tocar datos:

| Paso | Cambio | Archivo a editar |
|------|--------|-----------------|
| 1.1 | A-1: eliminar sección `## Confianza de captura` duplicada | `agents/interprete.js` |
| 1.2 | B-1: eliminar header de protocolo | `agents/protocolo.js` |
| 1.3 | C-1: eliminar header de auditor | `agents/auditor.js` |
| 1.4 | D-1: eliminar header de comunicación | `agents/comunicacion.js` |

**Validación:** ejecutar `npm run test:vistas`; correr el pipeline con los fixtures AUD-01 a AUD-07. No se espera cambio en outputs — se eliminó ruido, no datos.

### Etapa 2 — Reducción de campos de interpretación

| Paso | Cambio | Archivo a editar |
|------|--------|-----------------|
| 2.1 | A-2 + A-3: reducir `estimulo` en VistaInterprete | `lib/vistasAgentes.js` + `knowledge/fases/agudeza/interpretacion.md` |
| 2.2 | B-4 / C-2: reducir `interpretacion` en Protocolo y Auditor | `lib/vistasAgentes.js` |
| 2.3 | D-2: eliminar `modo` de VistaComunicacion | `lib/vistasAgentes.js` |
| 2.4 | D-3: eliminar `letrasCandidatas` de `interpretacion` en VistaComunicacion | `lib/vistasAgentes.js` |

**Validación:** casuísticas I-1 a I-7 (intérprete), CO-1 a CO-9 (comunicación). Para protocolo/auditor, casuísticas P-3 a P-11 y AU-01 a AU-07.

### Etapa 3 — Reducción del ojo no activo

| Paso | Cambio | Archivo a editar |
|------|--------|-----------------|
| 3.1 | B-3 / C-2: ojo no activo reducido a solo `logmarFinal` | `lib/vistasAgentes.js` |

**Validación:** casuísticas P-5 (CIERRE R→L) y P-10 (correcta L con R cerrado). Fixtures AU-13, AU-14 (BUG-006). Estos son los casos donde `logmarFinal` del ojo no activo es decisivo.

### Etapa 4 — Condicionar `rx`

| Paso | Cambio | Archivo a editar |
|------|--------|-----------------|
| 4.1 | B-2 / C-2: omitir `rx` cuando `ojoActual == "L"` | `lib/vistasAgentes.js` |

**Validación:** casuísticas P-6 (CIERRE FINAL, sin `rx`), P-10 (correcta L BAJAR, sin `rx`), AU-13 / AU-14.

---

## Criterios de aceptación por etapa

Cada etapa se acepta si:

1. **Tests unitarios pasan:** `npm run test:vistas` y `npm run test:registro`.
2. **Fixtures de auditor pasan:** los fixtures afectados devuelven el `aprobado` esperado (tabla de casuísticas de auditor arriba).
3. **Log de turno completo:** una sesión end-to-end produce `historial` con los mismos `razonamientoInterno` correctos (verificar que el LLM no pierde contexto crítico).
4. **Sin regresión de latencia:** `timingMs.totalWallClock` por turno no aumenta respecto al baseline pre-paralelismo auditor/comunicación (o baja ~min(auditor, comunicacion) en camino feliz). `timingMs.total` puede seguir siendo mayor que wall-clock por diseño (suma no paralela de agentes).

---

## Lo que este plan NO modifica

- Lógica de `registrarIntentoAgudeza()`, `aplicarEstadoPatch()`, `ejecutarAcciones()`
- Schemas de output de los agentes (`agents/schemas.js`)
- System prompts (`prompts/*.md`)
- Knowledge files excepto las 2 actualizaciones menores en `interpretacion.md` (agudeza) descritas en Etapa 2
- El contrato de `propuestaProtocolo` (incluyendo `letrasUsadasResultantes`) — se mantiene intacto para el auditor
- `intentoRecienRegistrado` en VistaAuditor — se mantiene intacto
