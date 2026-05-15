# Plan de implementación — Reanclaje del foróptero al resultado de cada comparativa de lentes

**Estado:** implementación parcial en código (`motorExamen.js`, `chatSupervisor/index.ts`); **hallazgos de QA** en §10 y **plan de corrección** en §11.  
**Relacionado:** `DOCUMENTACION.md`, `motorExamen.js`, `src/app/agentConfigs/chatSupervisor/index.ts`, `DEFINICIONES_EXAMEN_BINOCULAR.md`.

---

## 1. Objetivo y regla normativa unificada

### 1.1 Regla que debe cumplirse en todos los contextos comparativos

Después de cada respuesta del paciente a una pregunta de preferencia entre **configuración anterior** y **actual** (y el tratamiento acordado de **igual**; ver §4.3):

1. El **resultado de la comparación** queda definido como la corrección (o par R/L en binocular) que el paciente **eligió** según la semántica `anterior` / `actual` / `igual` (con la resolución de `igual` indicada en §4.3).
2. El **hardware del foróptero** debe reflejar **ese resultado** como estado de referencia **antes** de presentar la **siguiente** prueba comparativa, **cuando haga falta un movimiento** (p. ej. eligió **anterior** y el dispositivo aún muestra la **actual** / variante). Si ya estaba en el resultado, **no** se envía comando foróptero redundante por reanclaje.
3. La **pausa de 3 s** y el **`hablar`** `Sigamos con este.` **solo** cuando aplique la regla de **§4.4** (p. ej. hubo reanclaje foróptero de “vuelta atrás”, o ritual entre tests del mismo ojo, o rama binocular **anterior**). Si el paciente eligió **actual** y **no** hubo ese reanclaje y el **siguiente** lente **sí** cambia el hardware, **no** se aplican pausa ni Sigamos antes de ese movimiento (**§4.4 P1 B**). Si el siguiente valor es **idéntico** al actual (**no-op**), **no** Sigamos ni segunda llamada vacía (**§4.4 P2 A**).
4. Durante el tramo de **reanclaje** foróptero, la **TV no se modifica** (§4.3); la TV solo entra en los pasos habituales de presentación de la **siguiente** prueba.

Esta regla aplica por igual a:

- **ETAPA_5:** `esferico_grueso`, `esferico_fino`, `cilindrico`, `cilindrico_angulo` (monocular, un ojo abierto).
- **ETAPA_6:** comparación binocular esférica y, si aplica, cilíndrica (`DEFINICIONES_EXAMEN_BINOCULAR.md` §8).

---

## 2. Verificación contra la documentación y el código

### 2.1 `DOCUMENTACION.md`

| Qué documenta hoy | Relación con la regla §1 |
|-------------------|---------------------------|
| ETAPA_5: algoritmo de 3 valores, confirmaciones, mensaje estándar “¿Ves mejor con este o con el anterior?” | Describe **lógica de búsqueda** y contrato conversacional (≥1 `hablar`), **no** exige explícitamente un paso de **reanclaje físico** al valor elegido antes del siguiente salto. |
| ETAPA_6: variante aplicada antes del `hablar` combinado; respuestas con `interpretacionComparacion` | Alinea **percepción** con la pregunta mientras hay variante puesta; **no** documenta un paso intermedio “volver a la Rx elegida y esperar” antes de la **siguiente** ronda (p. ej. esfera → cilindro). |
| Garantía ETAPA_5: siempre al menos un paso `hablar` | Compatible con la regla nueva; habrá que **ordenar** nuevos `hablar` / esperas sin romper esta garantía. |

**Conclusión:** La regla §1 debe **incorporarse** a `DOCUMENTACION.md` (y a `DEFINICIONES_EXAMEN_BINOCULAR.md` §11 o nuevo apartado) como **contrato de hardware** explícito, no solo como algoritmo de valores.

### 2.2 `reference/foroptero-server/motorExamen.js`

#### ETAPA_5 — Flujo relevante

- Tras `procesarRespuestaComparacionLentes`, si `necesitaMostrarLente`, el flujo en código encadena: reanclaje foróptero **solo si** el valor elegido difiere del mostrado, luego (hoy) **siempre** pausa 3 s y `hablar` **Sigamos con este.**, y una **segunda** llamada sin `respuestaPaciente` ejecuta en deferred `pasosMostrar` + `generarPasosEtapa5` (pregunta). **Pendiente:** condicionar pausa/Sigamos y deferred según **§4.4** (P1 B, P2 A).
- `valorAMostrar` representa el **siguiente valor del algoritmo** (p. ej. tras “anterior” con `valorActual === valorMas` se pide mostrar `valorMenos`), **no** necesariamente el **valor recién elegido** por el paciente como parada intermedia en el hardware.
- `generarPasosMostrarLente` / cilíndrico / ángulo ya incluyen `foroptero` → `esperar_foroptero` → `tv`, pero **una sola** transición por llamada.

**Brecha:** No existe hoy una secuencia genérica **dos fases**: (A) aplicar Rx/lente = **resultado de la comparación**; (B) aplicar siguiente **prueba**. Cuando el resultado elegido ≠ `valorAMostrar` del primer comando, el paciente puede no tener referencia clara de “contra qué” viene el siguiente lente.

#### ETAPA_6 — Flujo relevante

- `generarPasosEtapa6`: en `FB_ESF_MOSTRAR` / `FB_CIL_MOSTRAR` aplica `foropteroDesdeRx(estadoActual.rxVariante)`, luego `esperar_foroptero`, TV, y el mensaje combinado (`MSG_BINOC_PREGUNTA_COMBINADA`).
- `procesarRespuestaBinocular`: interpreta preferencia (con `igual` → `anterior`); actualiza `rxActiva`; en paso esférico, si no termina, asigna `rxBasePaso` desde `rxActiva`, calcula `rxVariante` para el **siguiente** paso (cilindro) y pone `faseBinocular = FB_CIL_MOSTRAR`, devolviendo `necesitaMostrarLente: true`.
- La siguiente generación de pasos muestra **directamente** la nueva `rxVariante` (p. ej. variante cilíndrica), **sin** un paso explícito previo de “solo `rxActiva` / `rxBasePaso` elegido” + espera, antes de introducir la variante del siguiente eje.

**Brecha:** Tras una respuesta, si el paciente estaba viendo la **variante** y eligió **anterior**, el código fija la base en estado pero el **primer** comando foróptero de la siguiente tanda puede ser ya la **nueva** variante (otro eje). **Decisión acordada (§4.3):** entre comparación esférica binocular y la cilíndrica, el **reanclaje foróptero explícito** al resultado elegido ocurre **solo** si la preferencia fue **anterior**; si fue **actual**, no hay ese paso intermedio de solo-Rx-elegida, pero sí la pausa + mensaje global.

### 2.3 `src/app/agentConfigs/chatSupervisor/index.ts`

- El agente **solo** verbaliza `pasos[].mensaje` del backend, sin improvisar.
- Ya existe mención a mensajes de **espera técnica** (“esperá que se muevan los lentes”) con instrucción de llamar de nuevo a `obtenerEtapa()` **sin** esperar respuesta del paciente.
- Payload: `interpretacionComparacion` en ETAPA_5 (comparativa) y ETAPA_6 cuando el mensaje incluye la pregunta comparativa; no en transición “listo”.

**Implicación:** Pausa y mensaje de §4.3 deben materializarse en **pasos** que el agente pueda verbalizar (`hablar`) y/o ejecutar en orden; la pausa fija puede ser paso dedicado (`esperar_ms` o equivalente) **entre** movimiento foróptero (si hubo) y el `hablar`, según implementación — siempre sin texto generado por el modelo.

---

## 3. Matriz de cobertura (regla §1 vs. implementación actual)

| Contexto | Comparativa | Resultado elegido mapeado en código | ¿Foróptero queda en resultado antes de siguiente prueba? |
|----------|-------------|-------------------------------------|----------------------------------------------------------|
| ETAPA_5 | Esférico grueso/fino | `procesarRespuestaComparacionLentes` + `valorAMostrar` | **Parcial / no garantizado** — siguiente comando suele ser el siguiente salto del algoritmo. |
| ETAPA_5 | Cilíndrico / ángulo | Idem | Idem. |
| ETAPA_6 | Esférico binocular | `rxActiva` → `rxBasePaso` | **No explícito** — siguiente bloque aplica `rxVariante` del paso cilíndrico. |
| ETAPA_6 | Cilíndrico binocular | `rxActiva` → confirmación o fin | Última ronda: confirma; no hay “siguiente comparativa” salvo redefinición futura. |

---

## 4. Especificación funcional (para implementación futura)

### 4.1 Definiciones

- **Resultado de comparación (Rx de referencia):** el valor o par R/L que corresponde a la opción elegida (`anterior` / `actual`) **en la ronda que acaba de cerrarse**, o el desempate por **igual** según §4.3.
- **Siguiente prueba:** el siguiente valor o `rxVariante` que el algoritmo quiere mostrar para **nueva** pregunta comparativa (o fin de test).

### 4.2 Secuencia lógica tras cada respuesta comparativa (plantilla)

1. Calcular **resultado** de la ronda (monocular o binocular).
2. **Movimiento foróptero al resultado** si y solo si el dispositivo no está ya en ese resultado (caso típico: **anterior** con variante aún en cara). **Sin pasos de TV** en este tramo.
3. Si hubo comando foróptero: `esperar_foroptero` como hoy.
4. **Pausa 3 s + `hablar` `Sigamos con este.`** solo si corresponde según **§4.4** (no es obligatorio en **todos** los turnos; ver P1 B y P2 A).
5. **Siguiente prueba:** pasos habituales (foróptero variante / siguiente salto, TV si corresponde, pregunta comparativa).

### 4.3 Decisiones de producto acordadas (definiciones cerradas)

Las filas siguientes se **matizan** por **§4.4 (P1–P5)** donde haya tensión; en caso de duda prevalece **§4.4**.

| Tema | Decisión |
|------|----------|
| **Mensaje y pausa `Sigamos con este.` + 3 s** | Texto único **`Sigamos con este.`** (100 % backend). La **pausa de 3 s** y ese `hablar` se emiten **solo** cuando indica **§4.4** (p. ej. tras reanclaje “vuelta atrás”, ritual entre tests P3–P4, o binocular esfera→cilindro con **anterior**). **No** aplican tras **actual** sin reanclaje cuando el siguiente lente **sí** cambia (P1 **B**), **no** en **no-op** (P2 **A**), **no** como ritual duplicado en cambio de ojo R→L (P5 **B**). |
| **Pausa** | **3 s** fija **solo** en los mismos casos en que corresponde `Sigamos con este.` (alineado a la fila anterior). |
| **TV en reanclaje** | **No** modificar la TV durante el tramo de reanclaje foróptero; la TV solo entra en la presentación normal de la **siguiente** prueba. |
| **Binocular: esfera → cilindro** | Si la preferencia fue **`anterior`** (incluye `igual` → anterior): foróptero al resultado elegido **sin TV**, `esperar_foroptero`, luego **3 s + `Sigamos con este.`**, luego variante cilíndrica + flujo habitual. Si fue **`actual`**: **sin** reanclaje intermedio y **sin** pausa ni Sigamos antes de la variante (**P1 B**, coherente con intra-test). |
| **Respuesta `igual` (ETAPA_5)** | Resolver el desempate **cayendo en el valor más pequeño** (alineado con la lógica ya existente en `motorExamen.js` cuando el paciente insiste en “igual”). Documentar el mismo criterio en specs si hiciera falta distinguir primera vs segunda vez. |
| **Respuesta `igual` (ETAPA_6)** | Mantener la semántica ya definida en `DEFINICIONES_EXAMEN_BINOCULAR.md` (equivalente a **anterior** en esa ronda) para el **resultado**; el reanclaje foróptero explícito esfera→cilindro sigue la rama **anterior** de la fila binocular anterior. |
| **Agente** | Solo dicta `pasos[].mensaje` del backend. Cualquier ajuste en `chatSupervisor/index.ts` es opcional; **no** variantes de texto en el prompt. |

**Orden cuando **sí** aplican pausa + Sigamos:** tras `esperar_foroptero` del tramo de **reanclaje** (si hubo comandos de reanclaje), **espera 3 s**, luego `hablar` `Sigamos con este.`; si **no** aplican (**§4.4 P1 B**, **P2 A**), omitir ese bloque y seguir el flujo.

### 4.4 Cierre de negocio — respuestas **P1–P5** (mayo 2026)

| ID | Respuesta | Regla |
|----|------------|--------|
| **P1** | **B** | Tras **actual**, si **no** hubo reanclaje foróptero de “vuelta atrás” y el **siguiente** paso **sí** cambia el lente: **sin** pausa de 3 s ni `Sigamos con este.` antes de ese movimiento; **directo** al siguiente lente + pregunta. |
| **P2** | **A** | Si el siguiente valor es **idéntico** al actual (**no-op**): **sin** `Sigamos con este.`, **sin** segunda llamada / turno vacío; siguiente **pregunta** o **estado** del examen. |
| **P3** | **A** | **Grueso → fino** (mismo ojo): igual que entre comparativas intra–test — reanclaje al esférico **confirmado** del grueso (**sin TV** en ese tramo), **3 s**, **`Sigamos con este.`**, luego primer salto del fino + pregunta. |
| **P4** | **A** | **Fino → cilindro** y **cilindro → ángulo** (mismo ojo): **misma** regla que **P3**. |
| **P5** | **B** | **R → L** (primer grueso de L): **solo** adaptación + pre-grueso ya definidos; **no** añadir 3 s + `Sigamos con este.` encima. |

**Tabla de alcance (cierra tarea B1):** ritual estilo §4.3 entre tests **mismo ojo** para **grueso→fino**, **fino→cilindro**, **cilindro→ángulo** = **Sí** (P3–P4). Para **cambio de ojo** al primer grueso del otro ojo = **No** ritual extra (P5).

---

## 5. Plan de implementación por fases (código — futuro)

### Fase 1 — Especificación y contrato

- Actualizar `DOCUMENTACION.md` (ETAPA_5, ETAPA_6) y `DEFINICIONES_EXAMEN_BINOCULAR.md` con la regla §1, la secuencia §4.2 y las tablas **§4.3–§4.4** (P1–P5).
- Añadir en código (cuando se implemente) constante única para `MSG_POST_COMPARACION = 'Sigamos con este.'` y documentarla en un solo lugar.

### Fase 2 — ETAPA_5 (`motorExamen.js`)

- Extender el retorno de `procesarRespuestaComparacionLentes` (o la capa en `obtenerInstrucciones`) para distinguir:
  - **Reanclaje foróptero** al resultado (solo si hace falta; **sin** TV en ese sub-bloque),
  - **Pausa 3 s + `hablar` `Sigamos con este.`** solo cuando corresponda (**§4.4**, p. ej. P1 **B**, P2 **A**),
  - **Siguiente prueba** con generación actual (foróptero + TV + pregunta).
- Posible refactor: helpers `generarPasosSoloForoptero*` / flag en generadores existentes para omitir TV en reanclaje.
- Revisar actualización de `valorActual`, `valorAnterior`, `faseComparacion` y `valoresProbados` **después** del reanclaje para que la siguiente pregunta siga siendo semánticamente correcta.
- Rama **`igual`:** confirmar que el desempate final sigue **valor más pequeño** y que el bloque pausa+mensaje encaja antes del siguiente estado o confirmación.

### Fase 3 — ETAPA_6 (`motorExamen.js`)

- Entre respuesta de la comparación **esférica** y `FB_CIL_MOSTRAR`: si preferencia fue **`anterior`** (incluye mapeo `igual` → anterior), insertar `foropteroDesdeRx(rxActiva normalizada / resultado esférico)` + `esperar_foroptero`, **sin TV**, luego **pausa 3 s** + `hablar` `Sigamos con este.` antes de la variante cilíndrica (**§4.3–§4.4**).
- Si preferencia fue **`actual`**: **no** insertar ese reanclaje foróptero intermedio y **no** pausa ni Sigamos antes del cilindro (**P1 B**, coherente con intra-test).
- Introducir paso de espera **3000 ms** en el ejecutor de pasos si aún no existe tipo reutilizable.

### Fase 4 — Agente (`chatSupervisor/index.ts`)

- Solo si el backend emite nuevos tipos de mensaje: ajustar tablas “Qué mandar al backend” si cambia el contexto (p. ej. flags `reanclajePendiente` en `contexto`).
- Mantener la regla: **no** texto generado por el modelo fuera de `pasos[].mensaje`.

### Fase 5 — Pruebas

- Casos ETAPA_5: cada tipo de test; ramas `anterior`, `actual`, `igual`; límites de rango; cambio de ojo R→L.
- Casos ETAPA_6: `anterior`/`actual` en esfera con y sin segundo paso cilíndrico; `igual`; `testbin`.
- Pruebas de regresión del contrato HTTP (solo `hablar` al agente tras auto-ejecución).

---

## 6. Archivos previstos a tocar (implementación futura)

| Archivo | Motivo |
|---------|--------|
| `reference/foroptero-server/motorExamen.js` | Orquestación ETAPA_5/6 y generación de pasos. |
| `DOCUMENTACION.md` | Contrato y flujo documentado para frontend/agente/operador. |
| `reference/foroptero-server/DEFINICIONES_EXAMEN_BINOCULAR.md` | Binocular: semántica + flujo post-respuesta. |
| `reference/foroptero-server/examenprueba.md` (si existe checklist) | Modos `testesf` / `testcil` / `testbin`. |
| `src/app/agentConfigs/chatSupervisor/index.ts` | Solo si cambia `contexto` o guiones de espera. |

---

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Alargar el examen | Coste aceptado: **3 s + Sigamos** solo donde indique **§4.4** (no en cada turno); movimientos necesarios; no añadir variantes de texto. |
| Incoherencia `valorActual` / pregunta “este/anterior” | Tests de estado y trazas; revisar orden de mutación de `comparacionActual`. |
| Binocular: doble movimiento si anterior + cilindro | Solo cuando eligió anterior; orden: resultado → esperar_foroptero → 3 s → mensaje → variante cil. |
| Regresión del contrato “solo mensajes backend al paciente” | Un único string backend `Sigamos con este.` |
| TV parpadea o cambia en reanclaje | Tests que aseguren cero pasos `tv` en el sub-bloque de reanclaje. |

---

## 8. Criterios de aceptación (borrador)

- Tras cada respuesta de comparación válida: **3 s** + `hablar` **`Sigamos con este.`** (única redacción) **solo** cuando aplique **§4.4** (p. ej. hubo reanclaje “vuelta atrás”, ritual entre tests P3–P4, binocular esfera→cil con **anterior**). Tras **actual** sin reanclaje, si el **siguiente** lente **sí** cambia el hardware: **sin** pausa ni Sigamos **antes** de ese movimiento (**P1 B**). Si el siguiente valor es **no-op** respecto al estado en cara: **sin** Sigamos ni segunda ronda vacía (**P2 A**).
- Reanclaje **foróptero** al resultado de la ronda cuando el hardware **no** coincida ya con ese resultado; en **binocular esfera → cilindro**, reanclaje intermedio + pausa + Sigamos **solo** rama **anterior**; rama **actual** sin ritual intermedio antes del cilindro (**§4.3–§4.4**).
- Entre tests **mismo ojo** (grueso→fino, fino→cilindro, cilindro→ángulo): ritual alineado a intra-test según **P3–P4**; cambio de ojo R→L al primer grueso de L: **sin** ritual duplicado 3 s + Sigamos sobre adaptación (**P5 B**).
- En el tramo solo de reanclaje: **ningún** paso que modifique la TV; la TV se actualiza solo al armar la **siguiente** prueba.
- Documentación y comportamiento alineados con **§4.3–§4.4**; modos de prueba verificados.
- **Epic A (A3 resuelto):** no-op y ramas **P1 B** no deben forzar turno extra ni “listo” salvo flujos explícitos (binocular transición, ETAPA_3).

---

## 10. Hallazgos de pruebas (QA) — enero 2026

### 10.1 Elegir **actual** y mensaje de espera + “listo”

| Aspecto | Detalle |
|--------|---------|
| **Síntoma** | Tras preferencia **actual**, aparece un mensaje del estilo *esperar a que se muevan los lentes* y el flujo parece exigir responder **listo** para seguir, aunque el usuario perciba que **no** hubo cambio de lentes. |
| **Búsqueda en repo** | En `reference/foroptero-server/motorExamen.js` y `server.js` **no** aparece el literal exacto *"Espera a que se muevan los lentes"*; sí hay textos afines en ETAPA_3 (“…esperemos a que se termine de mover los lentes”) y en binocular (“…avisame cuando estés listo” / reintento con “listo”). El origen del copy exacto puede ser **despliegue distinto al repo**, **UI** (p. ej. panel Framer) o **interpretación del agente/cliente**. |
| **Causa raíz probable — motor** | La implementación actual ejecuta **siempre** la pausa de 3 s y **Sigamos con este.** y luego un **deferred** que aplica `generarPasosMostrar*` (foróptero + `esperar_foroptero` + TV), **incluso** cuando el bloque de reanclaje previo estaba **vacío** (valor elegido ≈ valor en cara). El **siguiente** candidato del algoritmo puede seguir implicando comando foróptero; si no lo implica pero el pipeline o el dispositivo igual notifica “busy”, la UX puede mostrar espera. |
| **Causa raíz probable — agente/contrato** | En `chatSupervisor/index.ts`, `postComparacionContinuar: true` se alineó con el patrón “llamar `obtenerEtapa()` otra vez **sin** esperar al paciente” (como mensajes de espera técnica). Si el **runtime** del agente o el **front** exige siempre una **respuesta del usuario** antes de la siguiente llamada HTTP, aparecerá un cuello de botella percibido como “decime listo”. |
| **Causa raíz probable — semántica clínica** | “**Actual**” es el lente en cara; el **siguiente** paso del algoritmo a menudo **sí** cambia el lente (p. ej. pasar de +salto a base). El paciente puede interpretar “no hubo cambio” refiriéndose solo al reanclaje, mientras el sistema ya programó el **siguiente** salto comparativo. |

### 10.2 Transición **esférico grueso → esférico fino** sin reanclaje

| Aspecto | Detalle |
|--------|---------|
| **Síntoma** | Al pasar de grueso a fino no se observa la misma regla de reanclaje / pausa / mensaje que entre comparaciones intra-test. |
| **Causa raíz — alcance de código** | Al confirmar grueso, `confirmarResultado` resetea `comparacionActual`, llama `avanzarTest()` y el siguiente `generarPasos()` entra en `generarPasosEtapa5` con `faseComparacion === 'iniciando'` para **`esferico_fino`**. Ese camino **no** pasa por `procesarRespuestaComparacionLentes` ni por el bloque `necesitaMostrarLente` donde se implementó post-comparación + deferred. Es una **transición entre tests del mismo ojo**, no una **respuesta** a “¿este o anterior?”. |
| **Causa raíz — especificación** | El plan §4.3 hablaba de “tras cada **respuesta** comparativa”; no quedó explícito que la misma UX aplicara al **arranque** del fino (ni fino→cilindro, etc.). **Cierre:** **§4.4 P3–P4** (mayo 2026). |

---

## 11. Plan de acción — tareas comprobables

### Epic A — Ritual post-comparación cuando la preferencia es **actual** (y “listo” / espera sin sentido)

| ID | Tarea | Archivo(s) / ámbito | Criterio de hecho (DoD) |
|----|--------|---------------------|-------------------------|
| **A1** | Reproducir el caso “actual” y capturar **orden real** de pasos: `foroptero` reanclaje (si hay), `esperar`, `hablar` Sigamos, segunda llamada, `foroptero` en deferred. | `motorExamen.js` (`obtenerInstrucciones`, bloque ETAPA_5 `necesitaMostrarLente`); logs o campo `contexto` opcional `debugPostComparacion` | Documento de reproducción o PR con logs que muestren si `pasosReanchor` fue `[]` y si el deferred igual envió `foroptero`. |
| **A2** | Localizar el texto *“Espera…” / obligación de listo* en el entorno donde probás (string exacto en repo vs Railway vs Framer vs app). | Repo + despliegue + UI | Issue o nota en plan: **fuente** del mensaje (backend / agente generado / UI). |
| **A3** | **Definición de producto** (bloqueante para A4–A6): cuando no hubo comando `foroptero` en reanclaje **y** el siguiente `valorAMostrar` es **idéntico** al estado físico esperado, ¿qué ritual aplica? Opciones típicas: (i) omitir 3 s + Sigamos + deferred; (ii) mantener 3 s + Sigamos pero ejecutar siguiente lente **en la misma** respuesta HTTP (sin `postComparacionContinuar`); (iii) otra. | `PLAN_REANCLAJE…` **§4.4 P2 A** (+ **P1 B** para “actual” + siguiente lente distinto) | **Resuelto (mayo 2026):** ver **§4.4**. |
| **A4** | Implementar la rama según **A3** / **§4.4** en el motor (condicionar `esperar` 3 s, `MSG_POST_COMPARACION_LENTES`, `deferredPostComparacion`). | `motorExamen.js` | Casos manuales: **P1 B** (actual, sin reanclaje, siguiente lente distinto → sin pausa/Sigamos antes del movimiento); **P2 A** (no-op → sin Sigamos ni turno vacío). |
| **A5** | Verificar que ningún `hablar` del backend pida “listo” salvo flujos binocular / ETAPA_3 explícitos. | `motorExamen.js`, `generarPasosEtapa3`, constantes `MSG_BINOC_*` | Grep: no nuevos mensajes ambiguos; binocular intacto. |
| **A6** | **Cliente / agente:** asegurar segunda llamada HTTP **automática** tras `postComparacionContinuar: true` (sin input del paciente). | `src/app/agentConfigs/chatSupervisor/index.ts` + cualquier wrapper Realtime que consuma `obtenerEtapa` | E2E o checklist: tras Sigamos, siguiente `fetch` sin `respuestaPaciente` sin bloqueo de UI. |
| **A7** | Actualizar `DOCUMENTACION.md` y §4.2–**§4.4** del plan con el contrato final post-**A3**. | `DOCUMENTACION.md`, `PLAN_REANCLAJE…` | Docs alineadas al comportamiento real. |

### Epic B — Ritual entre tests (**esferico_grueso → esferico_fino** y análogos)

| ID | Tarea | Archivo(s) / ámbito | Criterio de hecho (DoD) |
|----|--------|---------------------|-------------------------|
| **B1** | **Definición de producto** (bloqueante): ¿El ritual §4.3 (reanclaje si aplica + 3 s + Sigamos + siguiente prueba) aplica a **toda** transición “test de lentes confirmado → primer comparativo del **siguiente** test de lentes” **mismo ojo** (grueso→fino, fino→cilindro, cilindro→ángulo)? ¿Y al **cambio de ojo** R→L? | Producto + `PLAN_REANCLAJE…` **§4.4 P3–P5** | **Resuelto (mayo 2026):** tabla bajo **§4.4** (Sí: grueso→fino, fino→cil, cil→ángulo; No extra en R→L). |
| **B2** | Diseñar el **punto de enganche** en código: (a) `confirmarResultado` antes de `generarPasos()`, (b) primer `generarPasosEtapa5` en rama `iniciando` tras `iniciarComparacionLentes`, o (c) helper único llamado desde ambos flujos. | `motorExamen.js` | ADR corto en comentario de PR o en plan §11 apéndice. |
| **B3** | Implementar ritual para transiciones marcadas **Sí** en **B1** (mismo criterio que intra-test: TV sin tocar solo en tramo reanclaje, etc.). | `motorExamen.js` | Prueba manual: grueso→fino con misma secuencia perceptual que entre dos comparativas intra-fino. |
| **B4** | Casos de regresión: última comparación en +salto / -salto / base; confirmación con 2 confirmaciones; límites de rango. | Tests manuales o script | Lista en `examenprueba.md` o checklist en PR. |
| **B5** | Documentar en `DOCUMENTACION.md` alcance intra-test vs entre-tests post-implementación. | `DOCUMENTACION.md` | Sustituir o ampliar el bullet añadido en ETAPA_5 con comportamiento final. |

### Epic C — QA y cierre

| ID | Tarea | Ámbito | DoD |
|----|--------|--------|-----|
| **C1** | Matriz de prueba: filas = (preferencia anterior/actual/igual) × (hay/no hay reanclaje) × (deferred mueve/no mueve foróptero). | QA | Tabla firmada sin casos FAIL abiertos. |
| **C2** | ETAPA_6: regresión esfera→cilindro con **actual** / **anterior** / `igual`; sin romper `FB_TRANS_LISTO`. | `motorExamen.js` | Misma matriz reducida para binocular. |

---

## 11 bis. Preguntas de definición (versión literal + ejemplos)

**Decisiones cerradas (mayo 2026):** **P1 = B**, **P2 = A**, **P3 = A**, **P4 = A**, **P5 = B** — incorporadas en **§4.4** (y matizan **§4.3**). Las tareas **A3** y **B1** del §11 quedan **resueltas** con esa sección.

Las preguntas siguientes conservan el enunciado original como trazabilidad.

---

### Pregunta 1 — Después de “**actual**”, el foróptero **no** tuvo que “volver atrás”, pero **sí** va a mostrar **otro** lente en el siguiente paso

**Situación:** El paciente estaba viendo, por ejemplo, **+1,25 D** (el “este”). Dice que prefiere el **actual** → eso es **+1,25**. El motor **no** manda un reanclaje (porque ya está +1,25 en el ojo). El **siguiente** paso del examen **sí** cambia el lente, por ejemplo pasa a **+0,75 D** (base) para seguir comparando.

**Ejemplo con números:**  
Base 0,75 | mostraban 1,25 | pregunta “¿este o anterior?” | paciente: **“este”** (actual = 1,25) | próximo paso del algoritmo: mostrar **0,75**.

**Qué tenemos que definir:** En ese caso, **antes** de mandar el foróptero a 0,75, ¿qué querés que pase con el paciente?

| Opción | Qué pasa (orden) |
|--------|------------------|
| **A** | Siempre: espera **3 segundos** + el médico/agente dice **“Sigamos con este.”** + recién después se mueve a **0,75** y se vuelve a preguntar. |
| **B** | **No** decir “Sigamos con este.” ni la pausa de 3 s si **no** hubo movimiento de “vuelta atrás”; directamente se mueve a **0,75** y la pregunta (como antes del plan de reanclaje). |
| **C** | Otra cosa (describila en una frase: ej. “solo pausa, sin Sigamos”, etc.). |

**Tu respuesta P1:** **B**

---

### Pregunta 2 — Después de “**actual**”, el **siguiente** valor que el algoritmo quiere mostrar es **el mismo** que ya está en el ojo (no hay nada nuevo que poner)

**Situación:** El foróptero ya muestra **X**. El paciente elige **actual** (= **X**). El siguiente paso también sería **X** (por redondeo, confirmación duplicada, o límite del algoritmo).

**Ejemplo:** Está en **0,75**, dice “este”, y el motor iba a mandar otra vez **0,75** (igual).

**Qué definir:** ¿Qué querés en ese caso?

| Opción | Qué pasa |
|--------|----------|
| **A** | No hay segundo turno raro: **sin** “Sigamos con este.”, **sin** segunda llamada vacía; se sigue con la siguiente **pregunta** o el siguiente **estado** del examen. |
| **B** | Igual decir “Sigamos con este.” y esperar 3 s (aunque no se mueva nada). |
| **C** | Otra cosa (una frase). |

**Tu respuesta P2:** **A**

---

### Pregunta 3 — Terminó el **esférico grueso** del ojo derecho y empieza el **esférico fino** del mismo ojo (mismos lentes “de base”, pero el fino empieza con saltos de ±0,25)

**Situación:** Ya quedó guardado el resultado del grueso, por ejemplo **0,75 D** en R. El examen pasa al test **esférico fino** R. Hoy el motor puede arrancar el fino mostrando, por ejemplo, **1,00** (base +0,25) **sin** una pausa ni “Sigamos con este.” entre “cerré el grueso” y “primer lente del fino”.

**Ejemplo:** Grueso cerró en **R +0,75**. Fino arranca y lo primero que hace el sistema es poner **R +1,00** (o el salto que toque).

**Qué definir:** ¿Qué ritual querés **entre** “cerramos el grueso” y “primera comparación del fino”?

| Opción | Qué pasa |
|--------|----------|
| **A** | **Igual** que entre dos comparaciones del mismo test: si hace falta, foróptero a **0,75** (resultado del grueso) **sin tocar la TV en ese tramo**, espera **3 s**, **“Sigamos con este.”**, y **después** el primer lente del fino (ej. 1,00) + pregunta. |
| **B** | Solo asegurar foróptero en **0,75** y listo (**sin** “Sigamos con este.” ni los 3 s). |
| **C** | **Nada** extra: dejar el comportamiento actual (entrar directo al primer paso del fino). |

**Tu respuesta P3:** **A**

---

### Pregunta 4 — Misma idea que la 3, pero para **fino → cilindro** y **cilindro → ángulo** (mismo ojo, un test de lentes tras otro)

**Ejemplo fino → cilindro:** El fino cerró con esfera **R +0,50**; el siguiente test ajusta **cilindro** (ej. base −1,25).  
**Ejemplo cilindro → ángulo:** El cilindro cerró en **−1,00**; el siguiente test ajusta **eje** (ej. 60°).

**Qué definir:** ¿Usamos la **misma** letra que en P3 (A / B / C) para **las dos** transiciones, o alguna distinta?

| Opción | Significado |
|--------|-------------|
| **A** | **Unificado:** lo que elegiste en **P3** (A, B o C) vale igual para fino→cilindro y para cilindro→ángulo. |
| **B** | **Distinto:** aclarar en una línea (ej. “fino→cilindro como P3-A, cilindro→ángulo como P3-C”). |

**Tu respuesta P4:** **A** (unificado con P3)

---

### Pregunta 5 — Terminó todo el bloque de lentes del **ojo derecho** y empieza el **ojo izquierdo** (primer **grueso** de L)

**Situación:** Hoy ya existe un bloque de **adaptación** (foróptero, TV, mensajes de “¿ves bien?” antes del grueso) cuando cambia el ojo.

**Ejemplo:** Terminó R (grueso + fino + …), viene **L esférico grueso**.

**Qué definir:** Además de ese bloque que ya existe, ¿querés **también** el ritual de **§4.3** (3 s + “Sigamos con este.” como entre comparaciones), o **no** hace falta porque la adaptación ya cumple ese rol?

| Opción | Qué pasa |
|--------|----------|
| **A** | **Sí:** después de la adaptación / pre-grueso, igual aplicar donde corresponda **3 s + “Sigamos con este.”** antes de la **primera** comparación “este / anterior” de L. |
| **B** | **No:** solo lo que ya está (adaptación + pre-grueso), **sin** duplicar “Sigamos con este.” |
| **C** | Otra cosa (una frase). |

**Tu respuesta P5:** **B**

---

**Nota:** Las decisiones viven en **§4.4**; **§4.3** las referencia donde había tensión. Tareas **A3** y **B1** en §11: **resueltas**.

---

## 12. Resumen ejecutivo

El contrato de producto para **reanclaje**, **pausa 3 s** y **`Sigamos con este.`** queda en **§4.3–§4.4**: el ritual **no** es universal en cada turno (**P1 B**, **P2 A**); entre tests del **mismo ojo** aplica el mismo criterio que intra-test para **grueso→fino**, **fino→cilindro** y **cilindro→ángulo** (**P3–P4**); en **R→L** no se duplica sobre adaptación (**P5 B**). Binocular **esfera→cilindro** con **actual** no incluye pausa/Sigamos antes del cilindro. La implementación en `motorExamen.js` debe **condicionar** pasos según **§4.4** (el código puede aún no reflejarlo por completo). Los hallazgos §10 sobre **actual** + espera + **listo** siguen siendo la guía para alinear motor, `postComparacionContinuar` y agente/UI.
