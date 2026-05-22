# Plan de implementación — BUG-006 (re-cierre R→L con R ya cerrado)

**Estado:** implementado (2026-05-22) — prompts/knowledge/fixtures; sin validación en código  
**Fecha de referencia:** log post-deploy 2026-05-22 (turno 6)  
**Relacionado con:** [PLAN_BUG005_MITIGACION.md](./PLAN_BUG005_MITIGACION.md) (rotación Sloan; ya desplegado)

---

## 1. Resumen ejecutivo

### Problema observado

Tras un **cierre R→L exitoso** (turno 5: `R.logmarFinal = 0.2`, `ojoActual = L`, L en H@0.3), el **turno 6** registra correcta en L@0.3 con `c = 1` pero el protocolo emite otra vez `cierre_ojo_R_e_inicio_L` en lugar de **Plantilla B (BAJAR)**.

| Aspecto | Valor en turno 6 |
|---------|------------------|
| `ojoActual` | `"L"` |
| `agudeza.R.logmarFinal` | `0.2` (R ya cerrado) |
| Estímulo | H @ 0.3 |
| Contador | `c = 1` |
| Propuesta protocolo | `cierre_ojo_R_e_inicio_L` (incorrecta) |
| Violación auditor | `Falta agudeza.L (logmarActual, letraActual, letrasUsadas) en cierre R→L` (forma / BUG-001) |
| Efecto | `fallback_auditoria` → L sigue en H@0.3 |

### Causas raíz (solo mitigación LLM)

| ID | Causa | Componente |
|----|--------|------------|
| **BUG-006** (primaria) | Confundir “primer acierto en L” con “transición R→L”; reemitir plantilla **D** con `R.logmarFinal` ya seteado | Protocolo |
| **BUG-001** (secundaria) | Al intentar D fuera de contexto, patch **incompleto** (sin `agudeza.L` atómico) | Protocolo |
| **Corrección auditor débil** | Ante rechazo por forma, sugerir de nuevo AUD-04 / cierre R→L aunque R ya esté cerrado | Auditor |

### Principio de diseño (igual que BUG-005)

- **Sin validación clínica determinista en JavaScript.**
- Gates y tablas en **prompts + knowledge**.
- El auditor LLM rechaza y corrige con la **rama correcta** (B en L, no D).
- El servidor **ya expone** `logmarFinal` en VistaProtocolo (`proyectarOjoAgudeza`); no requiere cambio de código en `vistasAgentes.js`.

### Resultado esperado tras implementar

En “veo una h” con L@0.3, `R.logmarFinal != null`, `c = 1`:

```json
{
  "evento": "siguiente_optotipo",
  "estadoPatch": {
    "agudeza": {
      "L": {
        "logmarActual": 0.2,
        "letraActual": "O",
        "letrasUsadas": ["H", "O"]
      }
    }
  },
  "acciones": [{ "dispositivo": "tv", "letra": "O", "logmar": 0.2 }]
}
```

---

## 2. Caso canónico y criterios de aceptación

### 2.1 Entrada (VistaProtocolo — turno 6 del log)

```json
{
  "ojoActual": "L",
  "agudeza": {
    "R": {
      "logmarActual": 0.2,
      "letraActual": "E",
      "letrasUsadas": ["H", "O", "T", "E"],
      "logmarFinal": 0.2,
      "contadoresLogmarActual": { "correcto": 2, "incorrecto": 0 }
    },
    "L": {
      "logmarActual": 0.3,
      "letraActual": "H",
      "letrasUsadas": ["H"],
      "logmarFinal": null,
      "contadoresLogmarActual": { "correcto": 1, "incorrecto": 0 }
    }
  },
  "interpretacion": { "clasificacion": "correcta", "letraElegida": "H" }
}
```

### 2.2 Salidas

| Tipo | `evento` | Notas |
|------|----------|--------|
| **Válida** | `siguiente_optotipo` | BAJAR L a 0.2, letra O, extender `letrasUsadas` |
| **Inválida** | `cierre_ojo_R_e_inicio_L` | BUG-006 (aunque el patch sea atómico) |
| **Inválida** | `cierre_ojo_R_e_inicio_L` + patch sin `agudeza.L` | BUG-006 + BUG-001 |

### 2.3 Criterios de cierre del plan

- [x] Textos en prompts/knowledge y fixtures AUD-13/14, POST-DEPLOY.
- [ ] Replay manual turno 6 en playground protocolo → propuesta válida (B).
- [ ] Fixture AUD-13 → auditor rechaza con BUG-006.
- [ ] Fixture AUD-14 → auditor aprueba.
- [ ] Prueba E2E post-deploy: tras cierre R→L, primer acierto en L avanza a O@0.2 sin fallback.
- [x] Sin cambios en `pipelineTurno.js` ni validadores JS de reglas clínicas.

---

## 3. Fases de trabajo

| Fase | Contenido | Repos |
|------|-----------|-------|
| **0** | Este plan + fixture documental turno 6 | `reference/` + orchestrator fixtures |
| **1** | Protocolo: gates, tabla, plantilla D, auto-verificación | Knowledge |
| **2** | Auditor: anti-patrón BUG-006, orden de chequeo, corrección | Knowledge |
| **3** | Knowledge transversal + contratos | Knowledge + orchestrator docs |
| **4** | Fixtures AUD-13/14 + README | Orchestrator |
| **5** | Runbook + comunicación | Knowledge |

**Orden:** 0 → 1 → 2 (paralelo 1/2) → 3 → 4 → 5 → commit knowledge + deploy Railway.

---

## 4. Cambios por archivo (detalle)

### 4.1 `Oftalm_agent_v2_prompts_knowledge/prompts/protocolo-agudeza.md`

**Ubicación repo:** `reference/Oftalm_agent_v2_prompts_knowledge/` (gitignored en monorepo; commit en repo `Oftalm_agent_v2_prompts_knowledge`).

#### A) § «Lectura del estado» — después del bullet de `letrasUsadas`

**Agregar:**

```markdown
- Leé `agudeza.R.logmarFinal` y `agudeza.L.logmarFinal` del JSON.
- **R cerrado** ⇔ `agudeza.R.logmarFinal != null`. Si R está cerrado, el examen operativo continúa en **L** (no vuelvas a cerrar R ni a “iniciar L” con plantilla D).
- **L cerrado** ⇔ `agudeza.L.logmarFinal != null` (solo al final del examen).
```

#### B) Nueva sección — insertar **después** de «Reglas duras» y **antes** de «Elección de letra Sloan»

**Título:** `## Gate de cierre (leer antes de la tabla)`

**Contenido:**

```markdown
Usá estos gates **antes** de elegir fila de la tabla:

| Gate | Condición en JSON | Consecuencia |
|------|-------------------|--------------|
| R ya cerrado | `agudeza.R.logmarFinal != null` | **Prohibido** `evento: "cierre_ojo_R_e_inicio_L"`. No modificar `agudeza.R.logmarFinal` salvo error previo (no aplica en operación normal). |
| Ojo activo | `ojoActual` literal | Con R cerrado, `ojoActual` debe ser `"L"` para estímulos de agudeza. |
| Cierre R→L | Solo si R **no** cerrado | Plantilla **D** única vez por examen, cuando fila 4 aplica. |

**Regla una línea (BUG-006):** `cierre_ojo_R_e_inicio_L` **solo si** `ojoActual == "R"` **y** `c >= 2` **y** `agudeza.R.logmarFinal == null`.
```

#### C) Tabla de decisión — **modificar fila 4**

| Campo | Antes | Después |
|-------|--------|---------|
| Condición fila 4 | `c >= 2` y `ojoActual == "R"` | `c >= 2` y `ojoActual == "R"` **y** `agudeza.R.logmarFinal == null` |
| Nota bajo tabla | (solo BUG-003/004) | Añadir bullet: «Si `agudeza.R.logmarFinal != null`, la fila 4 **no aplica** aunque `ojoActual` fuera R por error de patch previo; usá filas 2/3/5/6 según `ojoActual` y `c`.» |

#### D) § «Plantilla B» — después de trampa BUG-005

**Agregar:**

```markdown
**Trampa (BUG-006):** con `agudeza.R.logmarFinal != null` y `ojoActual == "L"`, la respuesta correcta con `c == 1` es **siempre** esta plantilla (BAJAR/ROTAR_0), **nunca** plantilla D. El razonamiento no debe mencionar “cierre R + inicio L”.
```

**Agregar ejemplo canónico (bloque corto):**

```markdown
**Ejemplo (post-deploy):** `R.logmarFinal: 0.2`, `ojoActual: L`, `logmarActual: 0.3`, `c: 1`, correcta H → `siguiente_optotipo`, L `O@0.2`, `letrasUsadas: ["H","O"]`.
```

#### E) § «Plantilla D» — reemplazar línea «Cuándo»

**Antes:**

```markdown
**Cuándo:** `correcta` con `c >= 2` y `ojoActual == "R"`.
```

**Después:**

```markdown
**Cuándo (las cuatro condiciones simultáneas):**
1. `clasificacion == "correcta"`
2. `ojoActual == "R"` (literal en el JSON de la vista)
3. `c >= 2` en `agudeza.R.contadoresLogmarActual.correcto`
4. `agudeza.R.logmarFinal == null` (R aún no cerrado en este examen)

**Prohibido (BUG-006):** usar esta plantilla si `agudeza.R.logmarFinal != null` (R ya cerrado), aunque el paciente responda en L o el razonamiento del turno anterior haya sido un cierre.
```

**Después de trampa BUG-003 (2026-05-20), agregar:**

```markdown
**Trampa (BUG-006):** `c == 1` en L con R cerrado y emitir `cierre_ojo_R_e_inicio_L`. Releé `agudeza.R.logmarFinal` y `ojoActual` del JSON, no el nombre del evento del turno previo.
```

**Agregar párrafo atomicidad condicional:**

```markdown
Si no cumplís las cuatro condiciones de «Cuándo», **no** uses `evento: cierre_ojo_R_e_inicio_L` ni un patch parcial de cierre (eso dispara BUG-001 en el auditor). Elegí la fila que corresponda a `ojoActual` (casi siempre **B** en L con `c == 1`).
```

#### F) § «Auto-verificación» — agregar ítems 9 y 10

```markdown
9. **Re-cierre (BUG-006):** si `agudeza.R.logmarFinal != null`, ¿`evento` **no** es `cierre_ojo_R_e_inicio_L`?
10. **Ojo activo vs plantilla:** si `ojoActual == "L"` y `c == 1` con `correcta`, ¿elegí **B** (no D ni E)?
```

Renumerar cierre en nota: ítems 2–3 siguen referenciendo BUG-003 / BUG-001.

---

### 4.2 `Oftalm_agent_v2_prompts_knowledge/knowledge/fases/agudeza/protocolo-estado.md`

#### A) § «Modelo de estado» — tabla o derivados

En la lista de derivados, **enfatizar** (si no está ya explícito para protocolo):

```markdown
- El protocolo debe leer `agudeza.R.logmarFinal` / `agudeza.L.logmarFinal` en VistaProtocolo para gates de cierre (BUG-006).
```

#### B) § «Decisión clínica» — tabla de ramas, fila CIERRE_R_L

Añadir condición en la columna «Condición»:

```text
c >= 2, ojoActual == "R", agudeza.R.logmarFinal == null
```

#### C) § «Eventos del protocolo» — fila `cierre_ojo_R_e_inicio_L`

En **Restricciones**, agregar:

```text
Una sola vez por examen. No emitir si agudeza.R.logmarFinal ya está definido.
```

#### D) § «Catálogo de regresiones» — entrada nueva

**Título:** `### BUG-006 — Re-cierre R→L con R ya cerrado (2026-05-22, log turno 6)`

**Campos:**

| Campo | Texto |
|-------|--------|
| Componente | Protocolo (auditor rechaza forma o BUG-006) |
| Estado de entrada | `ojoActual: L`, `R.logmarFinal: 0.2`, L H@0.3, `0.3.correcto: 1` tras correcta |
| Propuesta inválida | `cierre_ojo_R_e_inicio_L` (a menudo patch sin `agudeza.L` → BUG-001) |
| Efecto | fallback; L no baja a 0.2 |
| Causa raíz | Reutilizar plantilla del turno de transición; ignorar `R.logmarFinal` en vista |
| Mitigación | Gate en prompt + BUG-006 en auditor + fixtures AUD-13/14 |
| Propuesta correcta | Plantilla B: L O@0.2, `letrasUsadas: ["H","O"]`, `siguiente_optotipo` |

#### E) Referencias cruzadas

En BUG-001 y BUG-003, añadir línea: «En log 2026-05-22 turno 6, el fallo de forma en cierre suele ser **síntoma** de BUG-006.»

---

### 4.3 `Oftalm_agent_v2_prompts_knowledge/prompts/auditor.md`

#### A) § «Reglas críticas (estructural)» — nuevo bullet

```markdown
- En agudeza: **rechazá** `evento: "cierre_ojo_R_e_inicio_L"` si `estadoAntes.agudeza.R.logmarFinal != null` (R ya cerrado). Citar **BUG-006**. La corrección debe ser Plantilla **B** en `ojoActual`, no AUD-04.
```

#### B) § «Formato de correccionSugerida» — nuevo inciso 4

```markdown
4. Si rechazás por **BUG-006** (`R.logmarFinal` ya definido): pegá JSON de **Plantilla B** para `estadoAntes.ojoActual` (ej. L baja a 0.2 con letra no usada). **Prohibido** sugerir otro `cierre_ojo_R_e_inicio_L`.
```

#### C) § «Fase agudeza — recordatorio por clasificación» — nueva fila en tabla

| Clasificación | Recordatorio |
|---------------|--------------|
| **correcta**, `c == 1`, `ojo L`, `R.logmarFinal` set | **BAJAR** + `tv`. Rechazar `cierre_ojo_R_e_inicio_L` (**BUG-006**). |

#### D) Ejemplo JSON — después del ejemplo BUG-005

**Título:** Ejemplo **BUG-006** (corrección en L, no re-cierre)

Mismo bloque JSON que en plan §1 (O@0.2 en L).

---

### 4.4 `Oftalm_agent_v2_prompts_knowledge/knowledge/fases/agudeza/auditoria.md`

#### A) Nueva sección — después de «Anti-patrón: no-cierre con c >= 2 (BUG-004)»

**Título:** `### Anti-patrón: re-cierre R→L con R ya cerrado (BUG-006, 2026-05-22)`

**Rechazar si:**

- `estadoAntes.agudeza.R.logmarFinal != null`
- `propuestaProtocolo.evento === "cierre_ojo_R_e_inicio_L"`

**Orden de evaluación (obligatorio):** comprobar BUG-006 **antes** de validar atomicidad de cierre (BUG-001). Si aplica BUG-006, no sugerir completar `agudeza.L` para un cierre que no debió emitirse.

**Citar** `BUG-006` en `violaciones`. Si además falta `agudeza.L`, se pueden citar ambos IDs en violaciones separadas, pero `correccionSugerida` debe seguir la rama **B**, no AUD-04.

**`correccionSugerida`:**

- `ojoActual == "L"`, `c == 1`, `logmarActual > 0` → JSON Plantilla B (O@0.2 en el ejemplo del log).
- Solo si `ojoActual == "R"`, `c >= 2`, `R.logmarFinal == null` → AUD-04 / Plantilla D.

#### B) § «Anti-patrón: patch parcial en cierre R → L» (BUG-001)

Al inicio, agregar:

```markdown
Si aplica **BUG-006**, no uses AUD-04 como corrección: corregí la rama a **siguiente_optotipo** (Plantilla B).
```

#### C) § «Checklist tras correcta» — nota bajo fila c ≥ 2 ojo R

```markdown
La fila «c ≥ 2, ojo R» exige además `estadoAntes.agudeza.R.logmarFinal == null` implícito (si ya hay `logmarFinal`, la propuesta de cierre R→L es BUG-006, no cierre válido pendiente).
```

---

### 4.5 `Oftalm_agent_v2_prompts_knowledge/knowledge/core/auditoria-estructural.md`

#### Tabla «Validación de rutas JSON» — nueva fila

| Regla | Rechazar (`aprobado: false`) si |
|-------|----------------------------------|
| Re-cierre R→L (BUG-006) | `evento === "cierre_ojo_R_e_inicio_L"` y el estado de la vista tiene `agudeza.R.logmarFinal != null` |

**Mensaje sugerido en violaciones:**

```text
BUG-006: cierre_ojo_R_e_inicio_L con agudeza.R.logmarFinal ya definido (<valor>)
```

**Nota al pie de la tabla:**

```markdown
Evaluar BUG-006 en paso 0/1 antes de atomicidad BUG-001.
```

---

### 4.6 `Oftalm_agent_v2_prompts_knowledge/knowledge/fases/agudeza/comunicacion.md`

#### Al final de § «Fallback tras rechazo de auditoría»

**Agregar:**

```markdown
Si el turno anterior ya anunció cambio a ojo izquierdo (`cierre_ojo_R_e_inicio_L` aprobado) y el fallback ocurre en el primer acierto de L, **no** repetir frases de cambio de ojo; el mensaje genérico de ajuste es suficiente (el paciente sigue en el mismo estímulo H@0.3 hasta que el protocolo apruebe BAJAR).
```

---

### 4.7 `Oftalm_agent_v2_prompts_knowledge/knowledge/fases/agudeza/runbook-operador.md`

#### Nueva sección — `## BUG-006 — Re-cierre R→L`

**Contenido:**

| Síntoma en detalle | Interpretación |
|--------------------|----------------|
| `R.logmarFinal` con valor; último turno en L; violación «Falta agudeza.L en cierre» o BUG-006 | Protocolo intentó **otra vez** cerrar R; no es que falte iniciar L |
| `registroIntento` correcto en L@0.3 pero TV sigue en H | Fallback; esperar reintento o nuevo deploy de knowledge |
| Acción operador | Exportar detalle; no reiniciar examen; verificar commit knowledge post BUG-006 |

**Enlace:** `reference/PLAN_BUG006_RECIERRE_R_L.md`

---

### 4.8 `reference/foroptero-orchestrator/agents/protocolo.js`

**Opcional (1 línea en `construirUser`):**

Después del bullet de BUG-005, agregar:

```javascript
'Si `agudeza.R.logmarFinal != null`, está prohibido `cierre_ojo_R_e_inicio_L` (BUG-006); en L con `c==1` usá Plantilla B.',
```

**Nota:** el system prompt en knowledge lleva el grueso; esta línea refuerza en user prompt sin duplicar reglas largas.

---

### 4.9 `reference/foroptero-orchestrator/docs/contratos-agentes.md`

#### § VistaProtocolo — después del párrafo BUG-005

**Agregar:**

```markdown
**BUG-006:** el protocolo debe usar `agudeza.R.logmarFinal` / `agudeza.L.logmarFinal` de la vista para no reemitir `cierre_ojo_R_e_inicio_L`. Validación solo por auditor LLM.
```

#### § VistaAuditor — una línea

```markdown
Ante `cierre_ojo_R_e_inicio_L`, el auditor comprueba primero si `estadoAntes.agudeza.R.logmarFinal` ya está definido (BUG-006).
```

---

### 4.10 Fixtures — repo `AI Agent v2_1` / `foroptero-orchestrator`

#### `fixtures/protocolo/POST-DEPLOY-L-H-correcta.json` (nuevo)

Estructura (misma que BUG005-L-bajar-0.0.json):

| Clave | Contenido |
|-------|-----------|
| `descripcion` | Regresión BUG-006 turno 6 post-deploy |
| `vistaProtocolo` | Estado turno 6 del log |
| `propuestaInvalida` | `cierre_ojo_R_e_inicio_L` con patch incompleto o atómico (ambos inválidos clínicamente) |
| `propuestaValida` | `siguiente_optotipo` L O@0.2 |
| `auditorEsperado` | inválida → BUG-006; válida → aprobado |

#### `fixtures/auditor/AUD-13-bug006-re-cierre-R-cerrado.json` (nuevo)

| Campo | Valor |
|-------|--------|
| `estadoAntes.ojoActual` | `"L"` |
| `estadoAntes.agudeza.R.logmarFinal` | `0.2` |
| `estadoAntes.agudeza.L` | H@0.3, `contadoresLogmarActual.correcto: 1` |
| `propuestaProtocolo.evento` | `cierre_ojo_R_e_inicio_L` |
| `propuestaProtocolo.estadoPatch` | Parcial (solo `R.logmarFinal` o sin `agudeza.L`) — reproducir log |
| `esperado.aprobado` | `false` |
| `esperado.violacionContiene` | `BUG-006` |

#### `fixtures/auditor/AUD-14-bug006-L-bajar-tras-R-cerrado.json` (nuevo)

Mismo `estadoAntes` que AUD-13.

| Campo | Valor |
|-------|--------|
| `propuestaProtocolo.evento` | `siguiente_optotipo` |
| `propuestaProtocolo.estadoPatch.agudeza.L` | O@0.2, `["H","O"]` |
| `letrasUsadasResultantes.L` | `["H","O"]` |
| `esperado.aprobado` | `true` |

#### `fixtures/auditor/README.md`

Agregar filas AUD-13, AUD-14 y línea de regresión 2026-05-22 turno 6 → POST-DEPLOY fixture.

---

### 4.11 `reference/PLAN_BUG005_MITIGACION.md`

**Agregar al final** (sin mezclar planes):

```markdown
## Plan relacionado

- Re-cierre R→L (post-deploy turno 6): [PLAN_BUG006_RECIERRE_R_L.md](./PLAN_BUG006_RECIERRE_R_L.md)
```

---

## 5. Archivos que **no** se modifican

| Archivo / área | Motivo |
|----------------|--------|
| `pipelineTurno.js` | Sin validación determinista (criterio producto) |
| `lib/vistasAgentes.js` | Ya proyecta `logmarFinal`; suficiente para LLM |
| `estadoExamen.js` | Sin cambio de modelo |
| `detectarModoTurno` | Bootstrap intacto |
| Comunicación agent (salvo nota en knowledge comunicacion.md) | Flags `esCambioDeOjo` ya correctos en turno 6 |

---

## 6. Commits y deploy sugeridos

| Repo | Mensaje sugerido |
|------|------------------|
| `Oftalm_agent_v2_prompts_knowledge` | `feat(agudeza): BUG-006 gate re-cierre R→L y corrección auditor` |
| `oftalm_agent_v2` (monorepo) | `docs: plan BUG-006, fixtures AUD-13/14, contratos y protocolo user hint` |

**Railway:** redeploy orquestador tras push knowledge (variable `KNOWLEDGE_*` apuntando al repo actualizado).

---

## 7. Matriz de regresión (no romper BUG-003/004/005)

| Escenario | Evento esperado |
|-----------|-----------------|
| R @0.3, `c=1`, correcta | BAJAR (BUG-003: no D) |
| R @0.2, `c=2`, correcta, `R.logmarFinal` null | D una vez |
| L @0.1→0.0, `c=1`, `["H","O","T"]` | B con E (BUG-005) |
| L @0.3, `c=2`, correcta | E (BUG-004) |
| L @0.3, `c=1`, `R.logmarFinal` set | B (BUG-006) — **caso nuevo** |

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación en el plan |
|--------|------------------------|
| Prompt demasiado largo | Gate en tabla corta + un ejemplo; detalle en `protocolo-estado.md` |
| Auditor sigue sugiriendo AUD-04 | Inciso explícito en `auditor.md` y `auditoria.md` |
| Confundir BUG-006 con BUG-001 | Orden de evaluación documentado; IDs distintos en violaciones |
| `ojoActual` desincronizado tras patch viejo | Gate usa `logmarFinal` de R como ancla más estable que historial |

---

## 9. Checklist de implementación

- [x] Editar los 7 archivos en knowledge repo (§4.1–4.7)
- [x] Editar `protocolo.js` y `contratos-agentes.md` (§4.8–4.9)
- [x] Crear 3 fixtures (§4.10)
- [x] Actualizar README fixtures y enlace en PLAN_BUG005
- [ ] QA manual AUD-13/14 + replay POST-DEPLOY en playground
- [ ] Prueba E2E post-deploy
- [ ] Commit + push ambos repos

---

## 10. Referencia al log original

**Turno fallido:** historial índice 5 (sexto turno), ts `2026-05-22T18:46:49.983Z`.

**Razonamiento protocolo erróneo:**

```text
c=1 en 0.3; cierre R con logmarFinal 0.2 y inicio L con H@0.3.
```

Debe pasar a:

```text
c=1 en L@0.3; bajo a 0.2, nueva letra O.
```
