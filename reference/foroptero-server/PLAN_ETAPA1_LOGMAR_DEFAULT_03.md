# Plan de implementación — Etapa 1: logMAR 0,3 por defecto, sin agudeza inicial

**Estado en repo:** implementado en código (2026-05-12).

Documento cerrado con las decisiones del producto (respuestas 1–11). **Etapa 2** (subir logMAR si el paciente no ve al iniciar esférico grueso) queda **fuera de alcance**.

---

## 1. Objetivo

- Eliminar el test **`agudeza_inicial`** para **R** y **L** de la secuencia normal.
- Antes del primer **`esferico_grueso`** de cada ojo, fijar:
  - `resultados[ojo].agudezaInicial = 0.3` (nombre de campo **sin cambiar**),
  - `agudezaVisual[ojo] = { logmar: 0.3, letra: 'H', confirmado: true }`.
- Mantener **`agudeza_alcanzada`** con la lógica actual: arranca desde `resultados[ojo].agudezaInicial` (será **0,3**) y sigue la escalera hasta el mejor logMAR con las reglas ya implementadas.
- **Binocular (ETAPA_6):** cambiar la constante de presentación de **0,4** a **0,3** (letra **H**). **No** cambiar textos de guion/mensajes en esta etapa.
- **ETAPA_5:** fallback de logMAR al iniciar comparación pasa de **0,4** a **0,3** cuando falte `agudezaVisual[ojo].logmar`.
- **Eliminar** el modo de prueba **`testag`** por completo.
- **No** modificar prompts del agente (`chatSupervisor` / `supervisorAgent`) en esta etapa.
- **No** contemplar reanudación/reset parcial del examen.
- **No** añadir flags API; no hay consumidores que asuman medición clínica de `agudezaInicial`.

**Mismo PR:** `motorExamen.js`, `server.js`, docs de foróptero, `DOCUMENTACION.md`, `DEFINICIONES_EXAMEN_BINOCULAR.md`, `PLAN_IMPLEMENTACION_EXAMEN_BINOCULAR.md` donde cite 0,4 binocular, `examenprueba.md`, `reference_framer/ForopteroControl.tsx`, `reference/ARQUITECTURA_ENDPOINTS.md` si aplica, `SOLUCION_OCLUSION_SIMPLE.md` si aún referencia `agudeza_inicial` en flujo actual.

---

## 2. Decisiones de diseño (trazabilidad)

| # | Decisión |
|---|----------|
| 1 | Campo **`agudezaInicial`** se mantiene; valor **siempre 0,3** desde el inicio del ojo (convención operativa, no medición). |
| 2 | **`agudezaVisual[ojo].confirmado`** = **`true`** al sembrar baseline. |
| 3 | Modo **`testag`** eliminado (lista de modos permitidos, secuencia de prueba, UI, docs, ejemplos `curl`). |
| 4 | Subida de logMAR al inicio de grueso → **etapa 2**, no incluida aquí. |
| 5 | Binocular: **solo** constante (y documentación alineada a 0,3); sin cambio de copy de mensajes. |
| 6 | Fallback **`iniciarComparacion`**: **0,3** en lugar de **0,4**. |
| 7 | **No** tocar prompts del agente (quedará texto legacy con 0,4 hasta una etapa futura; riesgo aceptado). |
| 8 | **Framer** entra en el mismo PR (quitar o sustituir control que llama `reiniciarExamen("testag")`). |
| 9 | Sembrar baseline **justo antes** de ejecutar **`esferico_grueso`** de ese ojo (único punto contractual). |
| 10 | Reanudación / reset parcial: **N/A**. |
| 11 | Sin cambios de contrato API adicionales. |

---

## 3. Cambios técnicos por área

### 3.1 `motorExamen.js` (núcleo)

1. **`generarSecuenciaExamen`:** quitar las líneas que hacen `push` de `{ tipo: 'agudeza_inicial', ojo: 'R' }` y `{ tipo: 'agudeza_inicial', ojo: 'L' }`. El primer test por ojo pasa a ser **`esferico_grueso`**.

2. **`generarSecuenciaPrueba`:** eliminar rama `modo === 'testag'` y cualquier referencia a ese modo.

3. **`inicializarExamen`:** en `modosPermitidos`, quitar `'testag'`. Comentarios que listen modos de prueba actualizarlos.

4. **Sembrado por ojo (antes de `esferico_grueso`):** implementar una rutina única (p. ej. `asegurarBaselineAgudezaLentes(ojo)` o equivalente) que:
   - asigne `estadoExamen.secuenciaExamen.resultados[ojo].agudezaInicial = 0.3` si aún no está definido para ese arranque de ojo, o siempre según regla acordada: como el valor es fijo **0,3 desde el inicio del ojo**, puede llamarse al **primer** paso de generación/avance hacia `esferico_grueso` de ese `ojo` (coincide con “antes de realizar esferico grueso de cada ojo”).
   - asigne `estadoExamen.agudezaVisual[ojo] = { logmar: 0.3, letra: 'H', confirmado: true }`.

   **Punto de invocación sugerido:** donde ya se prepara el test de lentes para el ojo (p. ej. al generar pasos para `esferico_grueso` o al avanzar al test cuyo `tipo === 'esferico_grueso'` y `ojo` coincide), de forma idempotente para no pisar un `agudezaVisual` actualizado legítimamente más adelante si en el futuro hubiera otra regla; en etapa 1, el primer grueso es el primer contacto: sembrar una vez por ojo es suficiente.

5. **Eliminar rastros de `agudeza_inicial` en código activo:**
   - `mapearTipoTestAEtapa`: entrada `'agudeza_inicial'`.
   - `mapearTipoTestAResultado`: entrada `'agudeza_inicial'` (el campo `agudezaInicial` seguirá existiendo pero solo se rellena por el sembrado, no por un tipo de test).
   - `procesarRespuestaAgudeza`: la rama que procesa test distinto de `agudeza_alcanzada` (o simplificar validación a solo `agudeza_alcanzada` si ya no hay otro tipo en ETAPA_4).
   - `generarPasosEtapa4`: toda la rama específica de inicialización con `estado.logmarActual = 0.4`, mensajes de error “no se puede iniciar agudeza_inicial”, detección de cambio de ojo ligada solo a `agudeza_inicial`, y comentarios obsoletos. Conservar lógica necesaria para **`agudeza_alcanzada`** (incluida la lectura de `resultados[ojo].agudezaInicial`, que ahora será **0,3** por sembrado).
   - Cualquier `avanzarTest` / logs que mencionen explícitamente el tipo `agudeza_inicial`.

6. **Constantes numéricas:**
   - `BINOC_LOGMAR`: **0.3** (y usos derivados en pasos TV binocular).
   - `iniciarComparacion`: fallback `agudeza?.logmar || 0.3`.

7. **Escalera logMAR:** las funciones `bajarLogMAR` / `subirLogMAR` **no** cambian (la secuencia ya incluye 0,3).

### 3.2 `server.js`

- Alinear `modosPermitidos` con `motorExamen.js` (sin `testag`).
- Validación de body en reinicio de examen: rechazar o ignorar documentado `testag` → **rechazar con 400** si se envía `testag` para API clara, o documentar “modo inválido”; el plan recomienda **400** con mensaje claro para clientes viejos.

### 3.3 Documentación

- **`DEFINICIONES_EXAMEN_BINOCULAR.md`:** reemplazar referencias **H @ logMAR 0,4** por **0,3** (§2.3, §9, §12).
- **`PLAN_IMPLEMENTACION_EXAMEN_BINOCULAR.md`:** fila de checklist que fija TV 0,4 → 0,3.
- **`DOCUMENTACION.md`:** flujo sin agudeza inicial; modos sin `testag`; ejemplos JSON/curl sin `testag` ni logmar 0,4 donde describan el nuevo default.
- **`examenprueba.md`:** modos, sección 5.1 `testag`, tablas de secuencia.
- **`reference/foroptero-server/README.md`:** lista de modos.
- **`reference/ARQUITECTURA_ENDPOINTS.md`:** ejemplo de pantalla si usa 0,4 como ejemplo genérico del examen → **0,3** si el ejemplo es del flujo actual.
- **`SOLUCION_OCLUSION_SIMPLE.md`:** actualizar transiciones que citen `agudeza_inicial` hacia el flujo real (p. ej. primer test `esferico_grueso` del ojo).

### 3.4 `reference_framer/ForopteroControl.tsx`

- Quitar botón o flujo `reiniciarExamen("testag")` y etiquetas asociadas a `agudeza_inicial` si solo servían a ese modo (ajustar UI para modos restantes).

### 3.5 Agente (sin cambios en esta etapa)

- **`supervisorAgent.ts`** sigue mencionando inicio en **0,4** y orden “agudeza derecha/izquierda”. **Riesgo conocido:** desalineación texto vs motor hasta una etapa futura de prompts (aceptado explícitamente).

---

## 4. Criterios de aceptación (QA)

1. Secuencia **normal**: para cada ojo, el primer test es **`esferico_grueso`**; no aparece **`agudeza_inicial`** en `testsActivos`.
2. Antes del primer **`esferico_grueso`** de **R**, `resultados.R.agudezaInicial === 0.3` y `agudezaVisual.R` coincide con **H / 0,3 / confirmado true**.
3. Igual para **L** antes del primer **`esferico_grueso`** de **L**.
4. **`agudeza_alcanzada`** por ojo inicia en **logMAR 0,3** en TV y no falla por `agudezaInicial` nulo.
5. **Binocular:** TV y estado usan **logMAR 0,3** (constante); mensajes de voz **sin** cambio obligatorio en esta etapa.
6. **`POST .../reiniciar`** con `{ "modo": "testag" }` → **400** (o comportamiento documentado equivalente).
7. Modos **`testesf`**, **`testcil`**, **`testbin`** siguen funcionando.
8. Examen completo R → L → binocular finaliza sin errores de estado.

---

## 5. Riesgos y notas

- **Prompts vs motor:** el agente puede seguir instruyendo 0,4 verbalmente; mitigación diferida (fuera etapa 1).
- **`agudezaInicial` semántico:** logs del tipo “mejoró desde agudeza inicial” comparan con **0,3** fijo; seguirá siendo coherente numéricamente pero ya no refleja una medición previa (aceptado).
- **Búsqueda residual:** tras el PR, ejecutar búsqueda global de `agudeza_inicial`, `testag`, y `0.4` / `0,4` en contexto examen/foróptero para no dejar strings rotos (excluir `package-lock`, SVG, semver).

---

## 6. Fuera de alcance (recordatorio)

- Subida de logMAR si el paciente no ve al iniciar **esférico grueso** (etapa 2) — plan de implementación: [`PLAN_IMPLEMENTACION_ETAPA2_LOGMAR_GRUESO.md`](./PLAN_IMPLEMENTACION_ETAPA2_LOGMAR_GRUESO.md) (contradicciones §4; **soluciones documentadas §10**).
- Reanudación / checkpoint de examen.
- Renombrar campo `agudezaInicial`.
- Cambios de copy en mensajes binocular salvo lo estrictamente ligado a constantes si el código interpolara logMAR (si hoy es solo constante en TV, no aplica).

---

*Versión: 2026-05-12 — Etapa 1 acordada por cuestionario producto.*
