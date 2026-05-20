# Plan de implementación — Vistas mínimas por agente (regla del menor contexto)

**Versión:** 0.2
**Fecha:** 2026-05-20
**Estado:** Propuesta, sin código aún
**Relacionado con:** [PLAN_BOOTSTRAP_EXAMEN.md](./PLAN_BOOTSTRAP_EXAMEN.md), `reference/foroptero-orchestrator/`

**Cambios v0.2 vs v0.1:**
- Decisiones cerradas: renombrar `obtenerEstadoParaOrquestador` → `snapshotEstadoExamen` y validar `VistaX` con JSON Schema.
- Aclarado el uso real de `fixtures/auditor/` (QA manual sin runner) y opciones para los nuevos `AUD-11`/`AUD-12`.

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Problema y causa raíz](#2-problema-y-causa-raíz)
3. [Principios de diseño](#3-principios-de-diseño)
4. [Spec final de las 4 vistas](#4-spec-final-de-las-4-vistas)
5. [Inventario de cambios por archivo](#5-inventario-de-cambios-por-archivo)
6. [Cambios en prompts](#6-cambios-en-prompts)
7. [Cambios en knowledge](#7-cambios-en-knowledge)
8. [Fixtures de QA](#8-fixtures-de-qa)
9. [Fases de implementación](#9-fases-de-implementación)
10. [Criterios de aceptación y pruebas](#10-criterios-de-aceptación-y-pruebas)
11. [Riesgos y mitigaciones](#11-riesgos-y-mitigaciones)
12. [Decisiones cerradas y preguntas abiertas](#12-decisiones-cerradas-y-preguntas-abiertas)
13. [Glosario](#13-glosario)
14. [Referencias](#14-referencias)

---

## 1. Resumen ejecutivo

El log del examen `2026-05-20T15:21:04Z … 15:26:51Z` evidenció dos regresiones clínicas y tres defectos de prompt/knowledge. La regresión más grave (BUG-004 propuesto): el agente protocolo, en el ojo L con `resultadosPorLogmar["0.3"].correcto = 2`, emitió `siguiente_optotipo` (BAJAR) en vez de `examen_finalizado` (CIERRE_FINAL), citando "c=1 en 0.3" cuando el JSON literal del estado decía `c=2` y luego `c=3`. El auditor aprobó tres veces seguidas.

**Causa raíz:** el `JSON.stringify(estado)` que el orquestador inyecta en el user prompt del protocolo y del auditor incluye `estadoExamen.historial` completo. Dentro del `historial` figuran los `razonamientoProtocolo` de turnos previos (`"c=1 en 0.3; bajo a 0.2, nueva letra O."`). El LLM templa desde esa frase, no desde el campo canónico `agudeza.{ojo}.resultadosPorLogmar[logmar].correcto`.

**Solución:** introducir un contrato de **vistas mínimas por agente**. Cada agente recibe únicamente el subconjunto del estado necesario para producir su salida, en un shape pre-procesado por el servidor. El `historial`, los `razonamiento*` previos y los contadores ajenos al logMAR activo dejan de viajar al LLM. Permanecen server-side para auditoría, CSV y endpoints de introspección.

**Cambios principales:**

| Capa | Cambio |
|------|--------|
| **Servidor** | Nuevo módulo `lib/vistasAgentes.js` con `armarVistaInterprete`, `armarVistaProtocolo`, `armarVistaAuditor`, `armarVistaComunicacion`. |
| **Agentes** | `agents/{interprete,protocolo,auditor,comunicacion}.js` consumen `vista` en vez de `estado` completo. Desaparece `JSON.stringify(estado)` de los `construirUser`. |
| **Pipeline** | `pipelineTurno.js` arma cada vista antes de invocar al agente correspondiente. Computa los flags pre-procesados de comunicación. |
| **Prompts** | Renombre de paths de lectura. Agregado de la "Regla dura simétrica" (BUG-004). |
| **Knowledge** | `contratos-agentes.md` nuevo. Catálogo de regresiones extendido con BUG-004 y BUG-005. Reordenamiento de anti-patrones del auditor. |

**Esfuerzo orientativo:** 1–2 días de desarrollo + replay del log analizado como smoke test E2E.

**Escalabilidad:** patrón fase-agnóstico. Al agregar la fase de lentes, cada agente recibe su `armarVistaX_lentes` y el resto del sistema no se entera.

---

## 2. Problema y causa raíz

### 2.1 Síntomas observados (log 2026-05-20T15:21-15:26)

Bugs clínicos identificados en el log:

| # | Turno (índice `historial`) | Componente | Síntoma |
|---|----------------------------|------------|---------|
| 1 | 7 (`15:25:27.701Z`), 10 (`15:26:51.846Z`) | Protocolo | `c >= 2` en L@0.3 → no cierra; emite BAJAR. Razonamiento "c=1 en 0.3" repetido literal |
| 2 | 7, 10 | Auditor | Aprueba la propuesta inválida en vez de rechazarla por BUG-004 |
| 3 | 6 (`15:25:04.910Z`), 9 (`15:26:29.564Z`) | Protocolo | Reutiliza letra `H` ya en `letrasUsadas`; emite `letrasUsadas: ["H"]` encogiendo el array |
| 4 | 6, 9 | Auditor | No detecta encogimiento de `letrasUsadas` ni reutilización |
| 5 | 1, 2, 5, 7, 10 | Comunicación | Emite `contextoVoz: "inicio"` fuera de turno bootstrap, justificado como "cambio de dispositivo" |

### 2.2 Causa raíz del bug 1 y 2

`agents/protocolo.js`:

```js
partes.push(
  '## Estado actual del examen (tras registro del intento en servidor)',
  '...',
  '```json',
  JSON.stringify(estado, null, 2),
  '```',
  ...
);
```

Donde `estado` viene de `obtenerEstadoParaOrquestador()` en `estadoExamen.js`, que devuelve **el objeto completo**, incluyendo `historial: [...]`. Cada entrada del historial contiene `razonamientoInterno`, `propuestaProtocolo.razonamientoProtocolo`, `interpretacion`, etc.

Resultado: el LLM del protocolo del turno T recibe en su user prompt, dentro del mismo bloque `json`, el `razonamientoProtocolo` literal del turno T-2 (y T-4, T-6...). Al pedirle "leé `resultadosPorLogmar[logmarActual].correcto` literal del JSON", **debería** ignorar las frases del historial; en la práctica, las usa como template.

Evidencia: en cuatro turnos con `c` ∈ {1, 1, 2, 3} el `razonamientoProtocolo` emitido fue idéntico carácter por carácter:

```text
"c=1 en 0.3; bajo a 0.2, nueva letra O."
```

El mismo patrón aplica al auditor, que recibe `JSON.stringify(estadoAntes)` con la misma estructura.

### 2.3 Causa raíz del bug 3 y 4

El protocolo emite `letrasUsadas: ["H"]` reemplazando el array previo `["H", "O"]`. El `deepMerge` del servidor reemplaza arrays (no concatena), así que el patch encoge el historial Sloan del ojo. Knowledge / prompt **no contemplan** anti-patrones de "letra reutilizada" ni "letrasUsadas encogida", por lo que el auditor no rechaza.

### 2.4 Causa raíz del bug 5

La tabla `contextoVoz` en `comunicacion-comun.md` enumera tres valores con descripciones cortas:

```text
inicio                   → Primer turno tras inicializar examen o fase.
esperar_respuesta        → Preguntaste algo al paciente; necesitás respuesta.
continuar_sin_respuesta  → Solo informativo sin cambio de dispositivos/ojo.
```

La definición de `inicio` es descriptiva, no acotada. El LLM la extiende por analogía: "si hubo cambio de dispositivo, también es un 'inicio'". Falta un disparador determinístico (flag pre-computado) que cierre la ambigüedad.

### 2.5 Verificación: agentes ya acotados vs. agentes comprometidos

| Agente | ¿Recibe `historial`? | ¿Contiene la regresión? |
|--------|----------------------|--------------------------|
| Intérprete | No (recibe `estimuloParaInterprete`) | No |
| Protocolo | **Sí** | **Sí** |
| Auditor | **Sí** | **Sí** |
| Comunicación | No (recibe `estadoResumido`) | Defecto menor (bug 5) |

Solo dos agentes están comprometidos. Que los otros dos ya funcionen con vistas acotadas confirma que el patrón de "vista mínima" es viable y aplicable de forma uniforme.

---

## 3. Principios de diseño

> **Regla del menor contexto.** Cada agente recibe el subconjunto mínimo del estado que necesita para producir su salida, en un shape pre-procesado por el servidor. Cualquier campo derivable se calcula server-side y se entrega ya resuelto. El `historial`, los `razonamiento*` y los contadores ajenos al logMAR activo **no se serializan al LLM** (siguen viviendo server-side para auditoría y CSV).

Tres reglas operativas:

1. **Una vista por agente.** No se reutiliza el mismo blob: cada agente tiene su `vistaParaX`.
2. **Pre-computación obligatoria.** Si una decisión depende de un número, ese número se entrega ya extraído. El LLM no busca "el contador del logMAR activo en `resultadosPorLogmar`": recibe `contadoresLogmarActual: { correcto, incorrecto }`.
3. **Lo prohibido se omite, no se enuncia.** Si la regla es "no inferir del historial", la solución es **no enviar** el historial.

Reglas auxiliares:

4. **Vocabulario de ojos sin alias.** Solo `R` y `L` literal. No se introduce `ojoActivo` / `ojoContrario`. `ojoActual` indica cuál es el operativo; el LLM dereferencia con `agudeza[ojoActual]`. Mantiene simetría entre lectura (vista) y escritura (patch).
5. **El patch que el protocolo emite no cambia.** Sigue siendo `estadoPatch.agudeza.{R|L}.{...}`. Lo que cambia es solo la **vista de lectura**.
6. **Trazabilidad intacta.** `estadoExamen.historial` sigue creciendo server-side. `registrarTurnoHistorial` no cambia. `generarRegistroCsv` y endpoints `/api/examen/detalle` no cambian.

---

## 4. Spec final de las 4 vistas

### 4.1 `VistaInterprete`

```json
{
  "fase": "agudeza",
  "modo": "respuesta",
  "estimulo": {
    "tipo": "letra_logmar",
    "letraActual": "H",
    "logmarActual": 0.3,
    "ojo": "L"
  },
  "respuestaPaciente": "veo una h",
  "confianza": 0.9
}
```

Notas:

- Modo `bootstrap` no invoca al LLM (se sigue usando `interpretacionBootstrapHardcoded`); `armarVistaInterprete` se llama solo en `respuesta`.
- Sin respuesta del paciente: mismo shape con `respuestaPaciente: null`; el LLM debe emitir `clasificacion: continuacion` (regla canónica preexistente).

### 4.2 `VistaProtocolo`

Modo `respuesta`:

```json
{
  "fase": "agudeza",
  "modo": "respuesta",

  "ojoActual": "L",

  "agudeza": {
    "R": {
      "logmarActual": null,
      "letraActual": null,
      "letrasUsadas": ["H", "O", "T", "E"],
      "logmarFinal": 0.2,
      "contadoresLogmarActual": null
    },
    "L": {
      "logmarActual": 0.3,
      "letraActual": "H",
      "letrasUsadas": ["H", "O"],
      "logmarFinal": null,
      "contadoresLogmarActual": { "correcto": 2, "incorrecto": 0 }
    }
  },

  "rx": {
    "R": { "esfera": 0.75, "cilindro": -1.75, "angulo": 60 },
    "L": { "esfera": 2.75, "cilindro": 0.0,  "angulo": 0  }
  },

  "interpretacion": {
    "clasificacion": "correcta",
    "letraElegida": "H",
    "letrasCandidatas": ["H"],
    "notasInterprete": "Respuesta clara y correcta para letra H."
  },

  "feedbackAuditor": null
}
```

Modo `bootstrap`:

```json
{
  "fase": "agudeza",
  "modo": "bootstrap",
  "ojoActual": "R",
  "agudeza": {
    "R": { "logmarActual": null, "letraActual": null, "letrasUsadas": [], "logmarFinal": null, "contadoresLogmarActual": null },
    "L": { "logmarActual": null, "letraActual": null, "letrasUsadas": [], "logmarFinal": null, "contadoresLogmarActual": null }
  },
  "rx": { "R": { ... }, "L": { ... } },
  "interpretacion": {
    "clasificacion": "continuacion",
    "letraElegida": null,
    "letrasCandidatas": [],
    "notasInterprete": "turno bootstrap"
  },
  "feedbackAuditor": null
}
```

Reintento por rechazo del auditor: `feedbackAuditor` se rellena con `{ violaciones, correccionSugerida }`. La vista del estado no cambia entre intentos.

Reglas de proyección:

| Campo de la vista | Origen / regla |
|-------------------|----------------|
| `ojoActual` | `estadoTrasRegistro.ojoActual` |
| `agudeza.R` / `agudeza.L` | Ambos presentes, shape uniforme |
| `agudeza.{ojo}.logmarActual`, `letraActual`, `letrasUsadas`, `logmarFinal` | Copia directa |
| `agudeza.{ojo}.contadoresLogmarActual` | `null` si `logmarActual == null`; si no, `estadoTrasRegistro.agudeza[ojo].resultadosPorLogmar[String(logmarActual)]` |
| `rx.R` / `rx.L` | Copia directa de `estadoTrasRegistro.rx` |
| `interpretacion` | Salida del intérprete (o hardcoded en bootstrap) |
| `feedbackAuditor` | `null` en primer intento; objeto en reintento |

Campos del estado que **no** se incluyen:

- `historial`, `intentosRegistrados`, `iniciado`, `finalizado`, `fase` raíz redundante.
- `agudeza.{ojo}.resultadosPorLogmar` completo (todos los logMAR).
- `agudeza.{ojo}.aciertosPorLogmar` (legacy).
- `agudeza.{ojo}.letraFinal`, `ultimoLogmarCorrecto`, `confirmaciones` (legacy).

### 4.3 `VistaAuditor`

Mismos campos que `VistaProtocolo` + dos bloques propios del auditor:

```json
{
  "fase": "agudeza",
  "modo": "respuesta",
  "ojoActual": "L",
  "agudeza": { "R": { ... }, "L": { ... } },
  "rx":      { "R": { ... }, "L": { ... } },
  "interpretacion": { ... },

  "intentoRecienRegistrado": {
    "ojo": "L",
    "logmarEstimulo": 0.3,
    "letraEstimulo": "H",
    "clasificacion": "correcta",
    "duplicado": false,
    "contadoresPostRegistro": { "correcto": 2, "incorrecto": 0 }
  },

  "propuestaProtocolo": {
    "estadoPatch": { ... },
    "acciones": [ ... ],
    "evento": "siguiente_optotipo",
    "detalleEvento": {},
    "razonamientoProtocolo": "...",
    "letrasUsadasResultantes": {
      "R": ["H", "O", "T", "E"],
      "L": ["H", "O"]
    }
  }
}
```

Notas:

- `intentoRecienRegistrado` se omite en modo `bootstrap` (no hay intento registrado).
- `intentoRecienRegistrado.contadoresPostRegistro` repite el valor de `agudeza[ojoActual].contadoresLogmarActual`. La redundancia es intencional: el auditor está obligado a citarlo en `violaciones`, y al estar etiquetado como "post‑registro" no hay margen para que el LLM crea que viene del historial.
- `propuestaProtocolo.letrasUsadasResultantes` lo calcula el servidor simulando `deepMerge` del patch propuesto sobre el estado actual. El auditor compara `letrasUsadasResultantes[ojoActual]` contra `agudeza[ojoActual].letrasUsadas` (post-registro) para detectar encogimiento o reutilización.

### 4.4 `VistaComunicacion`

```json
{
  "fase": "agudeza",
  "modo": "respuesta",

  "evento": "siguiente_optotipo",
  "detalleEvento": {},

  "huboCambioDispositivo": true,

  "esPrimerTurnoExamen": false,
  "esPrimerTurnoOjoActivo": false,
  "esCambioDeOjo": false,
  "esExamenFinalizado": false,

  "interpretacion": {
    "clasificacion": "correcta",
    "notasInterprete": "..."
  },

  "estadoResumido": {
    "ojoActual": "L",
    "R_cerrado": true,
    "L_cerrado": false
  }
}
```

Derivación de los flags (server-side):

| Flag | Derivación |
|------|------------|
| `esPrimerTurnoExamen` | `estadoTrasRegistro.historial.length === 0` |
| `esCambioDeOjo` | `estadoAntes.ojoActual !== estadoPatch.ojoActual && estadoPatch.ojoActual != null` |
| `esPrimerTurnoOjoActivo` | `estadoAntes.agudeza[ojoActualPostPatch].letraActual == null` |
| `esExamenFinalizado` | `estadoPatch.fase === "finalizado"` o `propuesta.evento === "examen_finalizado"` |
| `huboCambioDispositivo` | `acciones.length > 0` (igual que hoy) |

Tabla canónica de `contextoVoz` (a documentar en `comunicacion-comun.md`):

| Condición | `contextoVoz` |
|-----------|----------------|
| `esPrimerTurnoExamen` o `esCambioDeOjo` | `inicio` |
| `esExamenFinalizado` | `continuar_sin_respuesta` |
| Resto (hay pregunta al paciente) | `esperar_respuesta` |

Con esta tabla, el LLM de comunicación no necesita inferir `contextoVoz` a partir del `evento`.

---

## 5. Inventario de cambios por archivo

### 5.1 Archivos nuevos

| Path | Propósito |
|------|-----------|
| `foroptero-orchestrator/lib/vistasAgentes.js` | Exporta `armarVistaInterprete`, `armarVistaProtocolo`, `armarVistaAuditor`, `armarVistaComunicacion`. Único punto de proyección estado → vista por agente. Valida output contra los `VISTA_*_SCHEMA` antes de retornar |
| `foroptero-orchestrator/knowledge/core/contratos-agentes.md` | Documentación canónica de los 4 shapes, derivación de flags, reglas de inclusión/exclusión |
| `foroptero-orchestrator/test/vistasAgentes.test.js` | Unit tests de las 4 funciones `armarVistaX` (proyección, derivados, casos borde, validación de schema) |
| `foroptero-orchestrator/test/schemasVistas.test.js` | Unit tests de los 4 `VISTA_*_SCHEMA` contra ejemplos válidos e inválidos |
| **(Condicional)** `foroptero-orchestrator/fixtures/auditor/AUD-11-*.json`, `AUD-12-*.json` | Solo si se mantiene la opción A de §8. Casos de regresión BUG-004 y BUG-005 |
| **(Condicional)** `foroptero-orchestrator/test/auditor.test.js` | Solo si se elige la opción B de §8. Tests automatizados de los casos de regresión |

### 5.2 Archivos modificados

| Path | Cambio |
|------|--------|
| `foroptero-orchestrator/agents/interprete.js` | `construirUser` consume `vista` en vez de `(estado, respuestaPaciente, confianza, modo)`. La construcción de la vista pasa a `pipelineTurno.js` |
| `foroptero-orchestrator/agents/protocolo.js` | Idem. `construirUser` consume `vista`. Sin `JSON.stringify(estado)` |
| `foroptero-orchestrator/agents/auditor.js` | Idem. Sin `JSON.stringify(estadoAntes)`. Entra `vista` |
| `foroptero-orchestrator/agents/comunicacion.js` | Idem. `estadoResumido` local se elimina (queda en `vistasAgentes.js`) |
| `foroptero-orchestrator/pipelineTurno.js` | Llama `armarVistaX` antes de cada agente. Computa los flags pre-procesados de comunicación a partir de `estadoAntes`, propuesta del protocolo y `historial` |
| `foroptero-orchestrator/lib/estimulo.js` | `estimuloParaInterprete` se mueve como helper interno de `armarVistaInterprete` o se mantiene como utilidad pública re-exportada |
| `foroptero-orchestrator/prompts/interprete.md` | Renombre menor: referencias a `estimulo` dentro de `VistaInterprete` |
| `foroptero-orchestrator/prompts/protocolo-agudeza.md` | Renombre de paths de lectura (`resultadosPorLogmar[logmarActual].correcto` → `agudeza[ojoActual].contadoresLogmarActual.correcto`). Nueva sección "Cómo leés vs. cómo escribís". Regla dura simétrica BUG-004. |
| `foroptero-orchestrator/prompts/auditor.md` | Mismo renombre + referencias a `intentoRecienRegistrado.contadoresPostRegistro` y `propuestaProtocolo.letrasUsadasResultantes` |
| `foroptero-orchestrator/prompts/comunicacion.md` | Documentar los 4 flags y la tabla canónica de `contextoVoz` |
| `foroptero-orchestrator/knowledge/fases/agudeza/interpretacion.md` | Ajuste menor: referencias a `estimulo` dentro de la vista |
| `foroptero-orchestrator/knowledge/fases/agudeza/protocolo-estado.md` | Tabla "Visible al LLM (vista) vs. solo servidor". BUG-004 y BUG-005 en *Catálogo de regresiones*. |
| `foroptero-orchestrator/knowledge/fases/agudeza/auditoria.md` | Sección "Anti-patrón: no-cierre con `c >= 2` (BUG-004)" simétrica a la de BUG-003. Sección "Anti-patrón: letra reutilizada / `letrasUsadas` encogida (BUG-005)". Fila `c >= 2` desdoblada en R y L. |
| `foroptero-orchestrator/knowledge/core/auditoria-estructural.md` | Renombre de campos. Regla estructural sobre `letrasUsadasResultantes` |
| `foroptero-orchestrator/knowledge/core/comunicacion-comun.md` | Reemplazar la tabla `contextoVoz` por la mecánica basada en los 4 flags |
| `foroptero-orchestrator/agents/schemas.js` | **Obligatorio.** Agregar `VISTA_INTERPRETE_SCHEMA`, `VISTA_PROTOCOLO_SCHEMA`, `VISTA_AUDITOR_SCHEMA`, `VISTA_COMUNICACION_SCHEMA`. Usados por `lib/vistasAgentes.js` para validar antes de retornar |
| `foroptero-orchestrator/estadoExamen.js` | Renombrar `obtenerEstadoParaOrquestador` → `snapshotEstadoExamen`. JSDoc explícito: "uso solo introspección / debug; no consumir desde `agents/`". Eliminar todas las llamadas restantes del pipeline (deben pasar por `armarVistaX`) |

### 5.3 Sin cambios

- `foroptero-orchestrator/ejecutarAcciones.js`
- `foroptero-orchestrator/lib/registroAgudeza.js`
- `foroptero-orchestrator/lib/llmClient.js`, `lib/knowledge.js`

---

## 6. Cambios en prompts

### 6.1 `prompts/protocolo-agudeza.md`

Reemplazos de paths de **lectura**:

| Texto actual | Texto nuevo |
|--------------|-------------|
| `resultadosPorLogmar[logmarActual].correcto` | `agudeza[ojoActual].contadoresLogmarActual.correcto` |
| `resultadosPorLogmar[logmarActual].incorrecto` | `agudeza[ojoActual].contadoresLogmarActual.incorrecto` |
| `agudeza.{ojo}.logmarActual` (al leer) | `agudeza[ojoActual].logmarActual` |
| `agudeza.{ojo}.letraActual` (al leer) | `agudeza[ojoActual].letraActual` |
| `agudeza.{ojo}.letrasUsadas` (al leer) | `agudeza[ojoActual].letrasUsadas` |
| `estadoAntes.rx.L` / `rx.R` | `rx.L` / `rx.R` (igual, ya literal) |

**Importante:** estos renombres son **solo para lectura**. El **patch** que el protocolo emite mantiene el shape canónico (`estadoPatch.agudeza.{R|L}.{...}`). La asimetría queda explícita en una nueva sección **"Cómo leés vs. cómo escribís"**:

```text
LECTURA (vista del LLM):
- agudeza[ojoActual].contadoresLogmarActual.correcto
- agudeza[ojoActual].letrasUsadas
- agudeza[ojoActual].logmarActual / letraActual

ESCRITURA (patch que devolvés):
- estadoPatch.agudeza.{R|L}.{logmarActual, letraActual, letrasUsadas, logmarFinal}
- estadoPatch.ojoActual (solo en BOOTSTRAP y CIERRE_R_L)
- estadoPatch.fase (solo en CIERRE_FINAL)
```

Sección nueva al final de "Tabla de decisión":

```text
Reglas duras (lectura literal del contador, no derivar del razonamiento):
- c < 2  ⇒ NUNCA cerrar (D ni E). (BUG-003)
- c >= 2 con correcta ⇒ SIEMPRE cerrar (D o E según ojo). (BUG-004)
```

### 6.2 `prompts/auditor.md`

Mismos renombres de lectura. Adicional:

- En "Reglas críticas (estructural)" agregar:

  > En agudeza: validar `propuestaProtocolo.letrasUsadasResultantes[ojoActual]` contra `agudeza[ojoActual].letrasUsadas`. Si **encoge** o no contiene `propuestaProtocolo.estadoPatch.agudeza.{ojoActual}.letraActual`, rechazar. (BUG-005.)

- En "Fase agudeza — recordatorio por clasificación", desdoblar la fila de `correcta`:

  | Sub-caso | Recordatorio |
  |----------|--------------|
  | `correcta`, `c == 1`, logmar > 0 | BAJAR + `tv`. |
  | `correcta`, `c == 1`, logmar == 0 | ROTAR_0 + `tv`. |
  | `correcta`, `c >= 2`, ojo R | CIERRE R→L. Tres partes obligatorias. |
  | `correcta`, `c >= 2`, ojo L | CIERRE FINAL. `logmarFinal` + `fase:"finalizado"`. **Sin** `tv`. **BUG-004** si el protocolo emite `siguiente_optotipo`. |

### 6.3 `prompts/comunicacion.md`

La sección "Coherencia" se reemplaza por:

```text
El servidor entrega 4 flags pre-computados: esPrimerTurnoExamen, esPrimerTurnoOjoActivo,
esCambioDeOjo, esExamenFinalizado. NO derivar nada de ellos a partir del `evento` ni de
razonamientos previos. La tabla canónica de `contextoVoz` está en `comunicacion-comun.md`.
```

### 6.4 `prompts/interprete.md`

Renombre menor: pasa a hablar de `estimulo` dentro de `VistaInterprete`. Sin cambios semánticos.

---

## 7. Cambios en knowledge

### 7.1 `knowledge/core/contratos-agentes.md` (nuevo)

Estructura:

```text
# Contratos de vistas por agente

## Principios
- Regla del menor contexto.
- Vista por agente. No se reutiliza estado completo.
- Pre-computación obligatoria de campos críticos (contadoresLogmarActual, flags).
- El historial nunca se serializa al LLM. Vive server-side para auditoría y CSV.
- Vocabulario de ojos: R y L literal. Sin alias semánticos.

## VistaInterprete
[shape + derivación]

## VistaProtocolo
[shape + derivación + reintento con feedbackAuditor]

## VistaAuditor
[shape + derivación + intentoRecienRegistrado + letrasUsadasResultantes]

## VistaComunicacion
[shape + derivación de los 4 flags + tabla canónica de contextoVoz]

## Trazabilidad
- estadoExamen completo se guarda en memoria con historial.
- registrarTurnoHistorial sigue grabando todo lo del turno.
- generarRegistroCsv y endpoints de debug consumen estadoExamen directo, sin pasar por las vistas.

## Anti-tentación
- No se introducen alias `ojoActivo` / `ojoContrario`. Los ojos siempre son R y L literales.
- No se pre-computa la rama de decisión clínica (eso sería camino 3, no este plan).
```

### 7.2 `knowledge/fases/agudeza/protocolo-estado.md`

En *Modelo de estado*: agregar columna "Visible al LLM (vista)" con valores ✓ / ✗.

En *Catálogo de regresiones*: agregar BUG-004 y BUG-005.

```text
### BUG-004 — No-cierre con c >= 2 en L (2026-05-20, log turno 7)
- Componente: protocolo (y auditor que aprobó).
- Estado de entrada: L con 0.3.correcto: 2, ojoActual "L", clasificación correcta.
- Propuesta inválida: siguiente_optotipo (BAJAR a 0.2) con razonamientoProtocolo "c=1 en 0.3".
- Efecto: examen no se cerró; siguieron 3 turnos espurios con reutilización de H.
- Causa raíz: el protocolo templó razonamiento desde el historial embebido en el JSON del estado.
- Mitigación: regla dura simétrica en prompt + vista mínima sin historial + caso de regresión BUG-004 (formato según decisión de §8 de PLAN_VISTAS_AGENTES).
- Propuesta correcta: Plantilla E (CIERRE_FINAL).

### BUG-005 — Reutilización de letra Sloan y letrasUsadas encogida (2026-05-20, log turnos 6, 9)
- Componente: protocolo (y auditor que aprobó).
- Estado de entrada: L con letrasUsadas ["H","O"].
- Propuesta inválida: letraActual "H" con letrasUsadas ["H"] (encoge array, reutiliza letra ya usada).
- Efecto agravante: deepMerge reemplaza arrays → historial Sloan del ojo se pierde.
- Mitigación: auditor valida propuestaProtocolo.letrasUsadasResultantes contra agudeza[ojoActual].letrasUsadas + caso de regresión BUG-005 (formato según decisión de §8 de PLAN_VISTAS_AGENTES).
```

### 7.3 `knowledge/fases/agudeza/auditoria.md`

- Sección nueva: **Anti-patrón: no-cierre con `c >= 2` (BUG-004)**, simétrica a la de BUG-003.
- Sección nueva: **Anti-patrón: letra reutilizada / `letrasUsadas` encogida (BUG-005)**.
- La fila `c >= 2` del *Checklist tras correcta* se desdobla en R y L explícitas.

### 7.4 `knowledge/core/comunicacion-comun.md`

Reemplazar la tabla actual de `contextoVoz` por la tabla mecánica basada en flags (§4.4).

### 7.5 `knowledge/core/auditoria-estructural.md`

Agregar fila a la tabla de "Validación de rutas JSON" sobre `letrasUsadasResultantes`:

| Regla | Rechazar si |
|-------|-------------|
| `letrasUsadasResultantes[ojoActual]` no extiende `agudeza[ojoActual].letrasUsadas` | El array post-merge no contiene a todos los elementos del array pre-patch (o no incluye `letraActual` propuesta) |

---

## 8. Fixtures de QA

### 8.1 Estado actual del directorio `fixtures/auditor/`

Los fixtures preexistentes (`AUD-01` … `AUD-07`) **no tienen runner automático**. El `README.md` del directorio lo declara explícitamente:

> Cada fixture incluye `esperado.aprobado` y notas. **No hay runner automatizado en esta iteración.**

En la práctica: son **JSON de QA manual**. Documentan casos de regresión y se usan para armar a mano el user prompt del auditor (en playground del LLM o con un script ad-hoc) cuando alguien quiere reproducir un escenario sin levantar el pipeline completo. Nadie los ejecuta en CI ni desde ningún flujo automatizado.

### 8.2 Tres opciones para los nuevos casos (BUG-004, BUG-005)

Antes de decidir si crear `AUD-11` / `AUD-12`, conviene definir el destino general de los fixtures:

| Opción | Qué implica | Pro | Contra |
|--------|-------------|-----|--------|
| **A. Mantener como QA manual** | Crear `AUD-11` y `AUD-12` en el nuevo shape de `VistaAuditor`. Migrar `AUD-01..07` al mismo shape. Sin runner | Cero esfuerzo de infra; refuerzan la documentación | Siguen siendo opcionales y caen en desuso. Drift silencioso con prompts cuando cambien |
| **B. Reemplazar por tests automatizados** | Crear `test/auditor.test.js` con casos parametrizados que invocan al auditor real (LLM) o un mock con respuestas grabadas. Eliminar `fixtures/auditor/*.json` o convertirlos en data fixtures de los tests | CI los corre; detección temprana de regresiones | Costo de infra: mock o presupuesto de tokens en LLM; flakeo posible |
| **C. Eliminar y no reemplazar** | Borrar `fixtures/auditor/`. Confiar en el smoke test E2E del replay del log (paso 13) como única validación | Menos archivos para mantener | Pierde granularidad: cada vez que falle el E2E hay que reconstruir el caso mínimo |

**Sugerencia técnica** (no decisión): opción B con mocks (respuestas LLM grabadas) es el mejor balance entre cobertura y costo. Pero solo tiene sentido si vamos a invertir en infra de testing más amplia.

Mientras no se decida, los nuevos casos quedan **documentados en este plan** (sección a continuación) pero **no se crean** como archivos físicos.

### 8.3 Casos de regresión a cubrir (independiente del formato)

| Caso | Descripción | Resultado esperado del auditor |
|------|-------------|--------------------------------|
| **BUG-004 negativo** | Estado: `L.contadoresLogmarActual.correcto: 2`. Propuesta: `siguiente_optotipo` con BAJAR a 0.2 | Rechazar con violación que cita `BUG-004` y `intentoRecienRegistrado.contadoresPostRegistro.correcto: 2` |
| **BUG-004 positivo** | Estado: `L.contadoresLogmarActual.correcto: 2`. Propuesta: `examen_finalizado` con `agudeza.L.logmarFinal: 0.3` y `fase: "finalizado"` | Aprobar |
| **BUG-005 negativo** | Estado: `L.letrasUsadas: ["H","O"]`. Propuesta: `letraActual: "H"`, `letrasUsadasResultantes.L: ["H"]` | Rechazar con violación que cita `BUG-005` |
| **BUG-005 positivo** | Estado: `L.letrasUsadas: ["H","O"]`. Propuesta: `letraActual: "T"`, `letrasUsadasResultantes.L: ["H","O","T"]` | Aprobar |

---

## 9. Fases de implementación

Cada fase es testeable en aislamiento y deja el pipeline 100% funcional. Sin big-bang.

### Fase A — Cimientos (sin tocar pipeline)

1. Crear `knowledge/core/contratos-agentes.md` con los 4 shapes oficiales (copia de §4 de este documento).
2. Agregar a `agents/schemas.js`: `VISTA_INTERPRETE_SCHEMA`, `VISTA_PROTOCOLO_SCHEMA`, `VISTA_AUDITOR_SCHEMA`, `VISTA_COMUNICACION_SCHEMA` (JSON Schema). Tests unitarios de los schemas contra ejemplos válidos e inválidos.
3. Crear `lib/vistasAgentes.js` con las 4 funciones puras y su JSDoc. Cada `armarVistaX` valida su output contra el schema correspondiente antes de retornar (lanza error o devuelve con warning, a decidir en implementación). **No se invocan todavía desde el pipeline**.
4. Crear `test/vistasAgentes.test.js`. Casos mínimos por función:
   - `armarVistaInterprete`: estado típico, sin respuesta, bootstrap (asserción: no se invoca).
   - `armarVistaProtocolo`: respuesta correcta en R, respuesta incorrecta en L, bootstrap R, bootstrap L tras cierre R, reintento con `feedbackAuditor`.
   - `armarVistaAuditor`: idem + caso de simulación post-merge con patch que encoge `letrasUsadas`.
   - `armarVistaComunicacion`: cada uno de los 4 flags en True y en False de forma aislada.
   - Validación de schema: cada función rechaza un estado malformado (campos extra, tipos incorrectos).
5. Tests verdes en local. Hasta acá nada se invoca desde el pipeline.

### Fase B — Migración agente por agente

Cada agente en su PR aparte. Orden recomendado (menos crítico → más crítico, para sacarse los bugs de andamiaje antes de tocar lo sensible):

6. **Intérprete** (más simple, sin bug actual). `agents/interprete.js` consume `armarVistaInterprete`. `pipelineTurno.js` lo invoca correspondientemente. Tests E2E del intérprete pasan sin cambios.
7. **Comunicación.** Misma operación. Ajustar `comunicacion-comun.md` y `fases/agudeza/comunicacion.md` para citar los 4 flags. Repasar `prompts/comunicacion.md`.
8. **Auditor.** Idem. Actualizar `prompts/auditor.md` con los renombres y referencias a `intentoRecienRegistrado.contadoresPostRegistro`. Decidir qué hacer con los fixtures (ver §12.2).
9. **Protocolo.** Último. Actualizar `prompts/protocolo-agudeza.md` (renombres + Regla dura simétrica + sección "Cómo leés vs. cómo escribís"). Ejecutar el log de `2026-05-20T15:21-15:26` como replay y verificar que el turno 7 emite `examen_finalizado`.

### Fase C — Hardening

10. Renombrar `obtenerEstadoParaOrquestador` → `snapshotEstadoExamen` en `estadoExamen.js`. JSDoc explícito: "uso solo introspección / debug; no consumir desde `agents/`". Grep que nadie en `agents/` ni `pipelineTurno.js` la siga llamando.
11. Grep que `JSON.stringify(estado` no aparece en ningún archivo de `agents/`.
12. Agregar al `knowledge/fases/agudeza/protocolo-estado.md` BUG-004 y BUG-005 completos.
13. Smoke test E2E: replay del log analizado. Expectativa concreta:
    - Turno 7: protocolo emite `examen_finalizado` con `logmarFinal: 0.3`.
    - Examen termina con `fase: finalizado` y `L.logmarFinal: 0.3`.
    - No hay turnos 8–11.

---

## 10. Criterios de aceptación y pruebas

### 10.1 Unit tests (`test/vistasAgentes.test.js`)

- `armarVistaInterprete(estado, respuesta, confianza, "respuesta")` devuelve shape exacto de §4.1.
- `armarVistaProtocolo(estado, interpretacion, "respuesta", null)` no incluye claves: `historial`, `intentosRegistrados`, `iniciado`, `finalizado`, `resultadosPorLogmar`, `aciertosPorLogmar`, `letraFinal`, `confirmaciones`, `ultimoLogmarCorrecto`.
- `armarVistaProtocolo` con `agudeza.L.logmarActual: 0.3` y `agudeza.L.resultadosPorLogmar["0.3"]: {correcto:2, incorrecto:0}` produce `agudeza.L.contadoresLogmarActual: {correcto:2, incorrecto:0}`.
- `armarVistaAuditor` simula `deepMerge` y emite `letrasUsadasResultantes` correcto, incluyendo el caso patológico de patch con `letrasUsadas: ["H"]` sobre estado `["H","O"]` → `letrasUsadasResultantes.L: ["H"]` (refleja el encogimiento para que el auditor lo vea).
- `armarVistaComunicacion` con `evento: "cierre_ojo_R_e_inicio_L"` y patch que cambia `ojoActual` de "R" a "L" emite `esCambioDeOjo: true`.
- `armarVistaComunicacion` con primer turno (`historial.length: 0`) emite `esPrimerTurnoExamen: true`.

### 10.2 Casos de regresión BUG-004 y BUG-005

Los 4 casos descritos en §8.3 producen el resultado esperado del auditor (rechazo con cita del BUG correspondiente / aprobación según corresponda). El **formato** de validación depende de la opción elegida en §12.2:

- **Opción A (fixtures QA manual):** validación manual contra el LLM, registrada en notas. Sin gate de CI.
- **Opción B (tests automatizados):** los 4 casos forman parte de `test/auditor.test.js` y deben pasar en CI con al menos 5 corridas consecutivas sin flakeo.
- **Opción C (sin fixtures):** los casos quedan cubiertos indirectamente por el smoke test E2E del replay (§10.3); si éste falla por BUG-004 o BUG-005, se debe reproducir el caso aislado a mano.

### 10.3 Smoke test E2E (replay)

Script que reproduce el log `2026-05-20T15:21-15:26`:

- Inicia examen (POST `/api/examen/nuevo`).
- Reenvía cada `respuestaPaciente` del log en orden.
- Tras la 5ª respuesta correcta (turno 7 del log original), espera `fase: "finalizado"` y `L.logmarFinal: 0.3`.
- No debe haber turnos 8–11.

### 10.4 Regresiones

- Bootstrap inicial (PLAN_BOOTSTRAP_EXAMEN.md): la primera respuesta "iniciar" sigue disparando `inicio_ojo` con H@0.3 en R.
- Cierre R→L (BUG-001): patch atómico con `ojoActual: "L"` + `agudeza.R.logmarFinal` + `agudeza.L` H@0.3.
- Cierre prematuro (BUG-003): protocolo con `c == 1` no propone CIERRE; si lo hace, auditor rechaza.

---

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Drift entre prompt (que cita `agudeza[ojoActual].contadoresLogmarActual.correcto`) y vista real | `vistasAgentes.test.js` verifica los nombres de campos exactos. `contratos-agentes.md` es fuente de verdad |
| Algún agente migrado conserva `historial` por error | Tests aseguran que `armarVistaX` no devuelve `historial` ni `razonamiento*` previos. Grep en CI bloquea `historial` dentro de strings construidos por `agents/` |
| Fase B incompleta (un agente migrado, otro no) deja inconsistente la corrida | Cada PR (paso 5–8) deja el pipeline 100% funcional. Hasta que el agente X esté migrado, sigue recibiendo lo viejo |
| Pérdida de trazabilidad para QA | `historial` sigue server-side, `generarRegistroCsv` no cambia, endpoints `/api/examen/detalle` siguen devolviendo el estado completo |
| El protocolo / auditor LLM no aprenden a leer los nuevos nombres | Knowledge actualizado + ejemplos en plantillas con los nombres nuevos. Fixtures `AUD-01..12` migrados |
| El bug reaparece pese a la vista mínima (LLM aún alucina) | Si tras Fase C el replay del log no termina en `fase: finalizado`, escalar a camino 3: pre-computar la rama de decisión clínica en el servidor (no contemplado en este plan) |
| `obtenerEstadoParaOrquestador` se sigue usando en agentes | Paso 10 de Fase C: rename a `snapshotEstadoExamen` fuerza compile-error en consumidores; grep adicional en CI sobre el nombre nuevo |

---

## 12. Decisiones cerradas y preguntas abiertas

### 12.1 Decisiones cerradas

| Decisión | Estado | Fundamento |
|----------|--------|------------|
| Camino 1: recortar historial, dar vista mínima | Cerrada | Causa raíz identificada. Camino 3 queda como fallback si reaparece el bug |
| Opción B: simetría completa, los 4 agentes con `armarVistaX` | Cerrada | Mantenibilidad y consistencia para fase lentes futura |
| Sin `letrasSloanDisponibles` precomputado | Cerrada | El LLM debe derivar `Sloan \ letrasUsadas` por sí mismo |
| Sin alias `ojoActivo` / `ojoContrario` | Cerrada | Solo `R` y `L` literal; `ojoActual` para indicar cuál es el operativo |
| `esCambioDeOjo` por delta de `ojoActual` | Cerrada | Robusto a fases futuras (lentes) |
| BUG-004 y BUG-005 como IDs nuevos del catálogo | Cerrada | Sigue la numeración existente (BUG-001/002/003) |
| Renombrar `obtenerEstadoParaOrquestador` → `snapshotEstadoExamen` | Cerrada (v0.2) | Aclara que es solo introspección/debug. Forzar la migración hacia `armarVistaX` en `agents/` por nombre |
| Validar `VistaX` con JSON Schema en `agents/schemas.js` | Cerrada (v0.2) | Detección temprana de drift entre `vistasAgentes.js` y los prompts. Falla rápida si una vista pierde un campo crítico |

### 12.2 Preguntas abiertas

**Pregunta única vigente** — ¿qué hacemos con los fixtures de QA?

Contexto investigado (v0.2): los fixtures de `fixtures/auditor/` **no tienen runner automático**. El propio `README.md` lo dice. En la práctica son documentación viviente para QA manual; nadie en código los consume.

Las tres opciones (detalladas en §8.2):

| Opción | En una línea |
|--------|--------------|
| A | Crear `AUD-11` / `AUD-12` en el nuevo shape y migrar `AUD-01..07`. Sin runner |
| B | Reemplazar fixtures por `test/auditor.test.js` automatizado (con mocks de LLM) |
| C | Eliminar `fixtures/auditor/` y confiar solo en el smoke test E2E (paso 13) |

**Hasta resolver esto:** los casos de regresión BUG-004 y BUG-005 quedan **documentados textualmente** en §8.3 pero **no se crean archivos físicos**. La decisión condiciona el paso 8 de la Fase B (auditor).

---

## 13. Glosario

| Término | Definición |
|---------|------------|
| **Vista** | Subconjunto del estado server proyectado para un agente específico; lo único que ese agente ve del estado clínico |
| **`armarVistaX`** | Función pura server-side que toma `estadoExamen` (más inputs auxiliares según agente) y devuelve la `VistaX` correspondiente |
| **Regla del menor contexto** | Principio rector: cada agente recibe lo mínimo necesario, con derivados pre-computados |
| **Pre-computación** | Campo que el servidor extrae/deriva antes de pasarlo al LLM, en vez de pedirle al LLM que lo derive |
| **BUG-004** | No-cierre con `c >= 2`: protocolo emite BAJAR cuando debería cerrar (espejo de BUG-003) |
| **BUG-005** | Reutilización de letra Sloan / encogimiento de `letrasUsadas` en el patch |
| **`contadoresLogmarActual`** | `{ correcto, incorrecto }` extraído de `resultadosPorLogmar[String(logmarActual)]` del ojo. Reemplaza el indexado completo en la vista |
| **`letrasUsadasResultantes`** | Array post-`deepMerge` del patch del protocolo. Lo computa el servidor para que el auditor valide encogimiento/reutilización |
| **`intentoRecienRegistrado`** | Eco del último intento procesado por `registrarIntentoAgudeza`. Solo en `VistaAuditor` y solo en modo `respuesta` |

---

## 14. Referencias

- [PLAN_BOOTSTRAP_EXAMEN.md](./PLAN_BOOTSTRAP_EXAMEN.md) — Bootstrap del examen como turno explícito.
- `reference/foroptero-orchestrator/pipelineTurno.js` — pipeline actual.
- `reference/foroptero-orchestrator/estadoExamen.js` — estado server con `historial`.
- `reference/foroptero-orchestrator/agents/{interprete,protocolo,auditor,comunicacion}.js` — agentes actuales con `construirUser` a refactorizar.
- `reference/foroptero-orchestrator/knowledge/fases/agudeza/protocolo-estado.md` — *Decisión clínica*, *Catálogo de regresiones* (BUG-001/002/003).
- `reference/foroptero-orchestrator/knowledge/fases/agudeza/auditoria.md` — checklist clínico y anti-patrones del auditor.
- `reference/foroptero-orchestrator/knowledge/core/auditoria-estructural.md` — reglas estructurales transversales.
- `reference/foroptero-orchestrator/knowledge/core/comunicacion-comun.md` — tabla `contextoVoz`.
- Log analizado: `2026-05-20T15:21:04.065Z … 15:26:51.846Z` (12 turnos, examen no finalizado por BUG-004).
