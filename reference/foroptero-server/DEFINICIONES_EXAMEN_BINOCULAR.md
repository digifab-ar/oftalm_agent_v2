# Definiciones — Examen binocular (ETAPA_6)

Documento de especificación acordada para el flujo binocular **simplificado** (dos comparaciones: esférico y cilíndrico). Sirve como referencia para implementación y pruebas.

---

## 1. Objetivo

Realizar un ajuste final **con ambos ojos abiertos**, en **dos pasos** secuenciales:

1. Comparación **esférica** (variante: mover esfera 0,50 D **hacia el cero** en cada ojo que no esté ya en 0).
2. Comparación **cilíndrica** (variante: mover cilindro 0,50 D **hacia el cero** en cada ojo cuyo cilindro no sea 0), usando como base el resultado **ya resuelto** del paso esférico.

En cada paso el paciente indica si ve **mejor con la configuración anterior o con la actual** (o **igual**; ver §8).

---

## 2. Línea base binocular (valores iniciales del test)

### 2.1 Examen normal

- **Esfera:** siempre los valores confirmados de **esférico fino** por ojo. En este flujo **no se contempla** examen normal sin esférico fino.
- **Cilindro y eje:** si en la secuencia se ejecutaron los exámenes cilíndricos y hay resultado, usar **cilindro y ángulo** confirmados por ojo; si **no** hubo exámenes cilíndricos, tomar **cilindro y eje** de **valores recalculados** (autorefractómetro / recálculo previo).

### 2.2 Modo prueba (`testbin`)

- Usar **únicamente** `valoresRecalculados` por ojo (esfera, cilindro, ángulo).
- **Prerrequisito:** esos campos deben estar **completos**; no es un caso válido que falten.

### 2.3 Transición desde `agudeza_alcanzada` del ojo izquierdo

Al terminar `agudeza_alcanzada (L)` y antes de iniciar la primera comparación binocular, se agrega un subpaso de adaptación:

1. Aplicar foróptero con la **línea base binocular** (según §2.1 o §2.2), con **ambos ojos abiertos**.
2. Mostrar en TV: **H @ logMAR 0,3**.
3. Mensaje obligatorio al paciente:

> «Ahora vamos a ver con ambos ojos, tomate tu tiempo y avisame cuando estés listo.»

4. El flujo no debe avanzar a variante hasta recibir confirmación de continuidad del paciente (por ejemplo: “listo”, “continuar”, “ok”, “dale”, “ya”).

Este subpaso define el **punto de comparación inicial percibido por el paciente** y evita una transición abrupta monocular -> binocular.

---

## 3. Convención “0,50 hacia el cero”

En cada paso, la **variante** se obtiene desplazando la esfera o el cilindro **0,50 D en dirección al 0**, aplicando **clamp** a 0 y a los límites del dispositivo (§4).

Ejemplos:

- Cilindro en convención **0 a −6 D**: de **−0,75** hacia el cero → **−0,25**.
- Esfera **+1,25** hacia el cero → **+0,75**.
- Esfera **+0,25** con paso 0,50 hacia el cero → no puede “pasarse” de 0 → queda **0** (clamp §5).

La lógica debe ser **una sola función** documentada en código (por ejemplo `aplicarPasoHaciaCero(valor, paso)` con reglas de signo acordadas con el almacenamiento interno).

---

## 4. Límites de lentes (clamp tras movimiento)

| Grandeza | Rango   |
|---------|---------|
| Esfera  | −19,00 a +16,50 D |
| Cilindro | 0 a −6 D (solo no positivo en este modelo) |

Tras cualquier paso, los valores deben quedar **acotados** a estos intervalos.

---

## 5. Reglas por ojo (no mover lo que ya está en 0)

- **Esfera:** si en un ojo la esfera es **0**, **no** se aplica el movimiento esférico en ese ojo (sí en el otro, si corresponde).
- **Cilindro:** si en un ojo el cilindro es **0**, **no** se aplica el movimiento cilíndrico en ese ojo (sí en el otro, si corresponde).

---

## 6. Cilindro final 0 y eje

Si el **cilindro** resultante es **0**, el **ángulo** se **fija en 0** (grado).

---

## 7. Omisión del paso cilíndrico

Si **ambos** ojos tienen **cilindro 0** en la configuración activa al terminar el paso esférico:

- **No** se ejecuta la segunda comparación.
- El resultado binocular final es la configuración ya definida tras el paso esférico.

---

## 8. Interpretación de respuestas (`interpretacionComparacion`)

- **`anterior`:** el paciente prefiere la configuración mostrada **antes** de aplicar la variante **de ese paso**.
- **`actual`:** prefiere la configuración **después** de la variante **de ese paso**.
- **`igual`:** se adopta la configuración **anterior a la variante del paso actual** (equivalente a **`anterior`** en esa ronda).
  - Paso **esférico:** coincide con la **entrada** a ETAPA_6 (base binocular inicial).
  - Paso **cilíndrico:** coincide con la base **tras cerrar el esférico**, no con la base del inicio absoluto del binocular.

Nota de transición (§2.3): durante el mensaje de “avisame cuando estés listo”, la respuesta esperada es de **continuidad de flujo** (no de preferencia óptica). Esa respuesta no se interpreta con `anterior`/`actual`/`igual`; solo habilita el inicio de la primera comparación.

---

## 9. Presentación visual (TV)

- **Letra:** siempre **H**.
- **logMAR:** siempre **0,3**.

---

## 10. Resultado persistido

Por cada ojo (R / L), al **finalizar** el binocular, guardar **esfera, cilindro y ángulo** (estructura completa), reemplazando o extendiendo el esquema previo según decisión de migración en código (los consumidores que hoy esperan solo un número en `binocular` deberán actualizarse).

---

## 11. Mensajes de voz (guion)

En la implementación actual, **tras la transición “listo”**, el backend aplica primero la **variante** del paso (foróptero) y luego emite **un solo** `pasos[].mensaje` que combina el aviso y la pregunta comparativa, de modo que **el paciente ya tiene puestos los lentes de la variante** cuando oye el texto (coherente con “otro par” y con “anterior vs actual”).

**Entre la respuesta de la comparación esférica y la fase cilíndrica** (si aplica), el ritual de reanclaje foróptero, pausa **3 s** y `Sigamos con este.` sigue el plan `PLAN_REANCLAJE_POST_COMPARATIVA_LENTES.md` **§4.3–§4.4**: con preferencia **anterior** (incluye `igual` mapeado a anterior) se reancla al resultado esférico elegido **sin TV** en ese tramo, luego pausa + mensaje, luego variante cilíndrica; con **actual**, **sin** reanclaje intermedio ni pausa/Sigamos antes del cilindro.

Texto recomendado (literal en motor):

> «Ahora vamos a usar otro par de lentes, y me vas a decir si ves mejor o peor. ¿Ves mejor con la configuración anterior o con la actual?»

El agente debe leer **al pie de la letra** los `pasos[].mensaje` que devuelva el backend, sin parafrasear.

Mensaje de transición obligatorio (una sola vez al entrar a ETAPA_6 desde `agudeza_alcanzada (L)`):

> «Ahora vamos a ver con ambos ojos, tomate tu tiempo y avisame cuando estés listo.»

---

## 12. Orden operativo sugerido (por paso)

### 12.1 Entrada a ETAPA_6 (transición y adaptación)

1. Aplicar foróptero con **base binocular inicial** (ambos ojos `open`).
2. Esperar ready del foróptero.
3. **TV:** H @ logMAR 0,3.
4. **Hablar:** mensaje de transición (“...avisame cuando estés listo”).
5. Esperar confirmación de continuidad del paciente.

### 12.2 Comparación esférica y cilíndrica

Para cada comparación (esférico; luego cilíndrico si aplica), el flujo observable es:

1. Aplicar **foróptero** con la **variante** del paso (0,50 hacia el cero, reglas §3–§5; ambos ojos abiertos).
2. Esperar ready del foróptero.
3. **TV:** H @ logMAR 0,3.
4. **Hablar:** mensaje combinado §11 (aviso + pregunta comparativa en un solo turno).
5. Esperar respuesta e interpretación; actualizar configuración activa y continuar.

La **configuración anterior** a la que se refiere la pregunta es la base del paso (o el resultado del paso previo), no la variante que acaba de aplicarse.

---

## 13. Referencias en el repositorio

- Plan de implementación (fases y checklist): `PLAN_IMPLEMENTACION_EXAMEN_BINOCULAR.md`
- Lógica previa / transición: `motorExamen.js` (ETAPA_6, `binocularEstado`, secuencia `binocular`).
- Agente: `src/app/agentConfigs/chatSupervisor/index.ts` (`interpretacionComparacion`).
- API: `reference/foroptero-server/server.js` (cuerpo de instrucciones).
- Modo prueba: `examenprueba.md` (`testbin`).

---

*Implementación en `motorExamen.js` (ETAPA_6). Última actualización: 2026-05-12 — logMAR TV binocular 0,3; sin test `agudeza_inicial` en secuencia normal (baseline `agudezaInicial` 0,3 al primer `esferico_grueso` por ojo).*
