## Modo de Examen de Prueba

Este documento describe la implementación del **modo de examen de prueba** en el motor de examen visual (`motorExamen.js`) y su integración con los endpoints HTTP existentes.

El objetivo es poder **ejecutar aisladamente subconjuntos de tests** (esféricos, cilíndricos, binocular) sin romper la lógica clínica ni el flujo de examen normal.

---

### 1. Estados y modos del examen

- **Estado base (`estadoExamen`)**  
  Se agrega una nueva propiedad:
  - `modo: 'normal' | 'testesf' | 'testcil' | 'testbin'`

- **Valores permitidos**
  - `'normal'`: modo por defecto, examen completo estándar (flujo actual).
  - `'testesf'`: modo prueba de **lentes esféricos** (grueso y fino en ambos ojos).
  - `'testcil'`: modo prueba de **lentes cilíndricos** (y ángulo cuando aplique).
  - `'testbin'`: modo prueba de **test binocular**.

- **Inicialización y reinicio**
  - En `inicializarExamen(modo?)`:
    - si se pasa un `modo` válido, inicializa con ese modo.
    - si no se pasa modo, inicializa en `'normal'`.
  - En el endpoint `POST /api/examen/reiniciar`:
    - sin body (o sin `modo`) reinicia en `'normal'`.
    - con body válido (`testesf`, `testcil`, `testbin`) reinicia en ese modo de prueba.

---

### 2. Activación de modo prueba por endpoint `reiniciar`

La activación del modo prueba se hace exclusivamente vía endpoint:

- **Endpoint:** `POST /api/examen/reiniciar`
- **Body opcional:** `{ "modo": "normal" | "testesf" | "testcil" | "testbin" }`

Reglas:

1. Si no se envía body, o no se envía `modo`, el examen reinicia en modo `'normal'`.
2. Si se envía un `modo` válido (`testesf`, `testcil`, `testbin`), reinicia directamente en ese modo de prueba.
3. Si se envía un modo inválido, el endpoint responde `400` con mensaje de error.

En este diseño, **ETAPA_1 solo procesa valores del autorefractómetro**. Ya no se activa el modo prueba por texto conversacional del paciente.

---

### 3. Reutilización de ETAPA_2 (recálculo)

La **ETAPA_2** mantiene su comportamiento actual:

- Aplica reglas de recálculo cilíndrico y esférico.
- Guarda los resultados en `estadoExamen.valoresRecalculados`.
- No depende de `estadoExamen.modo`.

El modo de examen (normal o prueba) solo afecta a partir de **ETAPA_3 (preparación y secuencia)**.

---

### 4. Generación de secuencia según modo (ETAPA_3)

En **ETAPA_3** (`generarPasosEtapa3` en `motorExamen.js`):

1. **Secuencia**
   - Si `estadoExamen.modo === 'normal'` → `generarSecuenciaExamen()`.
   - Si no → `generarSecuenciaPrueba(estadoExamen.modo)`.

2. **Estado**
   - Se guardan `testsActivos`, `indiceActual = 0`, `testActual = secuencia[0]`.
   - `subEtapa = 'FOROPTERO_CONFIGURADO'`.

3. **Transición de etapa (crítico para el agente y para `/instrucciones`)**
   - Tras definir `testActual`, se asigna:
     - `estadoExamen.etapa = mapearTipoTestAEtapa(testActual.tipo)`
   - Mapeo estándar:
     - `agudeza_alcanzada` → **ETAPA_4**
     - `esferico_grueso`, `esferico_fino`, `cilindrico`, `cilindrico_angulo` → **ETAPA_5**
     - `binocular` → **ETAPA_6**

4. **Respuesta al cliente**
   - El objeto `contexto.etapa` devuelto por `obtenerInstrucciones` debe coincidir con `estadoExamen.etapa` (no forzar siempre `ETAPA_4`).
   - Si `subEtapa === 'FOROPTERO_CONFIGURADO'` y se vuelve a pedir pasos, la etapa se recalcula igualmente desde `testActual`.

**Bug corregido (modos testesf / testcil / testbin):**  
Antes, ETAPA_3 dejaba fijo `ETAPA_4` aunque el primer test fuera esférico, cilíndrico o binocular. El agente enviaba entonces `interpretacionAgudeza` y el backend respondía error. Con la etapa alineada al tipo de test, el agente usa `interpretacionComparacion` en ETAPA_5 y ETAPA_6.

El resto de ETAPA_3 (comando foróptero inicial R abierto / L cerrado, espera, mensaje de “ojo derecho”) se mantiene; en modos que empiezan por test no-agudeza el mensaje puede ser genérico hasta que el motor refine textos por tipo de test.

---

### 5. Definición de `generarSecuenciaPrueba(modo)`

La función `generarSecuenciaPrueba(modo)` construye una secuencia reducida de tests activos, utilizando los **mismos tipos de test** que el examen normal:

- Tipos reutilizados:
  - `esferico_grueso`
  - `esferico_fino`
  - `cilindrico`
  - `cilindrico_angulo`
  - `binocular`

En todos los casos, los tests de prueba se realizan **en ambos ojos** cuando aplica, **primero ojo derecho (R) y luego ojo izquierdo (L)**, excepto el binocular que es siempre `ojo: 'B'`.

> **Nota (2026):** el modo `testag` y el tipo de test `agudeza_inicial` fueron eliminados del motor. La baseline `agudezaInicial` (0,3) se fija al iniciar `esferico_grueso` por ojo en el examen normal.

#### 5.1. Modo `testesf` – Prueba de lentes esféricos

- Secuencia:
  - Ojo derecho (R):
    - `{ tipo: 'esferico_grueso', ojo: 'R' }`
    - `{ tipo: 'esferico_fino', ojo: 'R' }`
  - Ojo izquierdo (L):
    - `{ tipo: 'esferico_grueso', ojo: 'L' }`
    - `{ tipo: 'esferico_fino', ojo: 'L' }`
- Consideraciones:
  - Se reutiliza **toda la lógica de ETAPA_5** para esférico grueso y fino:
    - valor base desde `valoresRecalculados`,
    - estrategia de 3 valores,
    - sistema de confirmaciones,
    - límites de seguridad.
  - No se ejecutan en este modo:
    - agudeza inicial/final (salvo que se hagan en otro examen),
    - tests cilíndricos,
    - binocular.

#### 5.2. Modo `testcil` – Prueba de lentes cilíndricos

- Secuencia:
  - Para cada ojo (R y L), se reutiliza la función `determinarTestsActivos(cilindroRecalc)` para decidir:
    - si se incluye `cilindrico`,
    - si se incluye `cilindrico_angulo`.
  - El orden es:
    - Todos los tests cilíndricos del ojo derecho (R) primero.
    - Luego todos los tests cilíndricos del ojo izquierdo (L).

- Consideraciones:
  - Se **respeta exactamente** la lógica actual de inclusión de tests:
    - Si el cilindro recalculado es 0 o -0.25, no hay tests de cilindro para ese ojo.
    - Si entra en los rangos definidos, se incluyen los tests correspondientes.
  - No se fuerza la ejecución de tests de cilindro cuando la lógica actual los desactiva.

#### 5.3. Modo `testbin` – Prueba binocular

- Secuencia:
  - `[{ tipo: 'binocular', ojo: 'B' }]`
- Consideraciones:
  - **ETAPA_6** sigue `DEFINICIONES_EXAMEN_BINOCULAR.md`: transición *listo*; dos comparaciones (esfera y, si aplica, cilindro) con **variante ya aplicada** antes del `hablar` (mensaje combinado aviso + pregunta *anterior/actual*), TV H @ logMAR 0,3, resultado `{ esfera, cilindro, angulo }` por ojo.
  - En `testbin`, la línea base es **solo** `valoresRecalculados` (completo por ojo); no hay fallback a `esfericoFino`.
  - El test binocular se ejecuta sin requerir tests monoculares previos.

---

### 6. Relleno de resultados para mantener coherencia clínica

Para que la estructura de resultados y las funciones auxiliares sigan funcionando tanto en exámenes normales como en exámenes de prueba, se aplican las siguientes reglas:

- **Agudeza visual (cuando no sea el test de agudeza alcanzada)**
  - En modos de prueba que no incluyen `agudeza_alcanzada`:
    - `estadoExamen.secuenciaExamen.resultados[ojo].agudezaInicial` puede quedar en `0.3` (sembrado al primer `esferico_grueso` del ojo en flujo normal) o en valores de relleno según implementación.
    - `estadoExamen.secuenciaExamen.resultados[ojo].agudezaAlcanzada` se puede setear a `0` si aplica.
  - Esto permite reutilizar funciones que esperan un valor numérico (p. ej. para `calcularValoresFinalesForoptero`) sin dejar `null`.

- **Lentes no probados en el examen de prueba**
  - En cada modo de prueba, para los componentes **no testados**, se reutilizan directamente los valores recalculados:
    - Ejemplo (modo `testesf` – solo esféricos):
      - `resultados[ojo].cilindrico = valoresRecalculados[ojo].cilindro`
      - `resultados[ojo].cilindricoAngulo = valoresRecalculados[ojo].angulo`
    - Ejemplo (modo `testcil` – solo cilíndricos):
      - `resultados[ojo].esfericoGrueso` y/o `esfericoFino` pueden tomar como base la esfera recalculada cuando no se hayan probado en este examen.
  - De esta forma:
    - `calcularValoresFinalesForoptero(ojo)` siempre obtiene una combinación coherente de esfera, cilindro y ángulo.
    - El endpoint de detalle muestra una "receta" completa aunque parte de ella provenga directamente del recálculo, no de tests de prueba.

---

### 7. Endpoint `/api/examen/detalle`

El endpoint `GET /api/examen/detalle` ya utiliza `obtenerDetalleExamen()` para devolver:

- `valoresIniciales`
- `valoresRecalculados`
- `tests` (secuencia de tests con estado y resultados)
- `resultados` (valores por ojo)
- `estadoActual`
- `timestamps`

Se realiza la siguiente extensión mínima:

- Dentro de `detalle`, se agrega el campo:
  - `modo: estadoExamen.modo`

Ejemplo de respuesta (esquemático):

```json
{
  "ok": true,
  "detalle": {
    "modo": "testesf",
    "valoresIniciales": { ... },
    "valoresRecalculados": { ... },
    "tests": [ ... ],
    "resultados": { ... },
    "estadoActual": { ... },
    "timestamps": { ... }
  }
}
```

Esto permite al usuario distinguir exámenes normales de exámenes de prueba, manteniendo el resto del contrato del endpoint intacto.

---

### 8. Integración con el agente `chatSupervisor`

- El modo de examen **no** se activa por voz del paciente; solo por `POST /api/examen/reiniciar` (o panel de control).
- El agente (`src/app/agentConfigs/chatSupervisor/index.ts`):
  - Llama `obtenerEtapa()` al inicio y tras cada respuesta del paciente.
  - Según `contexto.etapa` en la última respuesta del backend:
    - **ETAPA_4** → envía `interpretacionAgudeza` cuando corresponde a test de letras.
    - **ETAPA_5** o **ETAPA_6** → en general `interpretacionComparacion` para preferencia *anterior/actual/igual*; en ETAPA_6, **excepción:** solo `respuestaPaciente` en el mensaje de transición *“…avisame cuando estés listo”* (ver `chatSupervisor/index.ts` y `DEFINICIONES_EXAMEN_BINOCULAR.md`).
    - **ETAPA_1** (valores iniciales) → envía `respuestaPaciente` con el texto literal (formato autorefractómetro).
  - Repite los mensajes `hablar` que devuelve el backend.

- En modo prueba:
  - La activación se hace exclusivamente vía `POST /api/examen/reiniciar` enviando `{ "modo": "testesf" | "testcil" | "testbin" }`.
  - El backend enviará mensajes claros al paciente indicando que se trata de un **test de prueba** y especificando qué componente se está probando.
- Tras reiniciar en modo prueba, el primer mensaje al operador/paciente puede venir en la respuesta de `reiniciar` (texto de “modo de prueba” + pedido de valores).

---

### 9. Panel de control Framer (`reference_framer/ForopteroControl.tsx`)

Panel de referencia para operadores:

- **Nuevo examen** → `POST /api/examen/reiniciar` con body `{ "modo": "normal" }`.
- **Prueba ESF / CIL / BIN** → mismo endpoint con `{ "modo": "testesf" | "testcil" | "testbin" }`.
- Polling de `GET /api/examen/detalle` para mostrar `detalle.modo`, valores, tests y estado.

---

### 10. Referencia de archivos

| Archivo | Rol |
|---------|-----|
| `reference/foroptero-server/motorExamen.js` | `modo`, `inicializarExamen(modo)`, `generarSecuenciaPrueba`, ETAPA_3 con etapa según `testActual`, `obtenerDetalleExamen` con `modo` |
| `reference/foroptero-server/server.js` | `POST /api/examen/reiniciar` con validación de `modo` |
| `src/app/agentConfigs/chatSupervisor/index.ts` | Tool `obtenerEtapa` → `/api/examen/instrucciones` |
| `reference_framer/ForopteroControl.tsx` | Botones de reinicio y modos de prueba |

---

Con este diseño, el modo de examen de prueba:

- Reutiliza al máximo la lógica clínica ya existente.
- Mantiene el flujo normal sin cambios cuando `modo === 'normal'`.
- Proporciona secuencias de prueba claras, acotadas y trazables vía `/api/examen/detalle`.
- Alinea **etapa interna** y **contexto** con el tipo de test para que el agente envíe el payload correcto a `/instrucciones`.

