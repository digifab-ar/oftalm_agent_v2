# Protocolo de agudeza visual — estado y transiciones (POC fase 1)

**Agente:** protocolo (estado).  
**Alcance:** dado el estado del examen y la **clasificación** del intérprete, producir `estadoPatch`, `acciones` y `evento`. No redactás mensajes al paciente (ver **comunicacion-paciente.md**).

Referencias: dispositivos en **dispositivos.md**; validación en **auditoria-protocolo.md**; clasificación lingüística en **interpretacion-paciente.md**.

---

## Alcance del examen

- Solo test de **agudeza** monocular.
- Orden: **ojo derecho (R)** → **ojo izquierdo (L)**.
- Sin autorefractómetro, sin lentes, sin binocular en esta fase.

---

## RX fija de demostración (POC)

| Ojo | Esfera | Cilindro | Ángulo |
|-----|--------|----------|--------|
| R   | +0.75  | -1.75    | 60     |
| L   | +2.75  | 0.00     | 0      |

Comandos de foróptero: **dispositivos.md**.

---

## Campos de estado (servidor)

Por ojo en `agudeza.R` / `agudeza.L`:

- `logmarActual`, `letraActual`
- **`aciertosPorLogmar`**: claves `"0.3"`, `"0.2"`, `"0.1"`, `"0.0"` (strings), enteros ≥ 0
- `logmarFinal`, `letraFinal` al cerrar
- `letrasUsadas`, `ultimoLogmarCorrecto`, `confirmaciones` (opcional)

Globales: `fase`, `ojoActual`, `finalizado`.

- **R cerrado** = `agudeza.R.logmarFinal != null`
- **L cerrado** = `agudeza.L.logmarFinal != null`
- **`fase: finalizado`** solo si **L** cerrado

---

## Inicio del test por ojo

1. Foróptero: RX del ojo en test + oclusión del contralateral (**dispositivos.md**).
2. `logmarActual`: **0.3**
3. `letraActual`: **H**
4. `aciertosPorLogmar` del ojo: todas las claves en **0**
5. `letrasUsadas`: `["H"]`
6. Acción TV: **H** @ **0.3**
7. `evento`: `inicio_ojo` o `esperar_primera_respuesta` según contexto del turno

---

## Efecto de cada clasificación (entrada del intérprete)

Aplicá solo si la clasificación **no** es `confianza_baja`, `ambigua` ni `continuacion` (salvo reglas de continuación abajo).

| Clasificación | Efecto en estado / dispositivos |
|---------------|----------------------------------|
| **correcta** | Incrementar `aciertosPorLogmar`; evaluar **cierre** (`>= 2`) **antes** de bajar; si no cierra, bajar un paso o rotar en 0.0 (árbol abajo). |
| **incorrecta** | Subir **un** paso en la escala (o permanecer en 0.3 y rotar letra). No incrementar contadores. |
| **no_ve** | Igual que subir por incorrecta. No incrementar contadores. |
| **frase_paciente_no_clinica** | Sin cambio de logMAR/contadores salvo que el protocolo ya exija avanzar; **no** `fase: finalizado` si L no cerró. |
| **confianza_baja** / **ambigua** | Sin `estadoPatch` de logMAR/contadores; `acciones: []`; `evento: repregunta_sin_cambio`. |

---

## Escala logMAR permitida

Valores válidos (de letras más grandes a más chicas): **0.3, 0.2, 0.1, 0.0**

Transiciones de **subida** (incorrecta, no_ve): **solo un paso** — `0.0→0.1`, `0.1→0.2`, `0.2→0.3`. Desde **0.3** no hay subida: permanecer en **0.3** y rotar letra.

El inicio en **0.3** es solo al **abrir** cada ojo; no saltar desde 0.0/0.1/0.2 directo a 0.3 como “subida”.

Transición de **bajada** (tras correcta sin cierre): un paso hacia más chico: `0.3→0.2`, `0.2→0.1`, `0.1→0.0`.

---

## Doble confirmación (`aciertosPorLogmar`)

- Al **iniciar** cada ojo, todas las claves en **0**.
- Cada **correcta**: `aciertosPorLogmar[String(logmarActual)] += 1`.
- **Dos aciertos en el mismo logMAR** = dos incrementos **acumulados** en ese tamaño a lo largo del ojo, aunque entre medios hubo otras líneas. No exijas turnos consecutivos en el historial.
- Si tras sumar **`>= 2`**: `logmarFinal`, `letraFinal` (= `letraActual` del turno), cierre de ojo; **no** bajar ni nueva `tv` en ese ojo en ese turno.
- Si queda en **1** y `logmarActual > 0.0`: bajar un paso, letra Sloan no usada, acción `tv`.
- Si queda en **1** y `logmarActual == 0.0`: permanecer en 0.0, rotar letra, `tv`.
- Tras subir por error/no_ve: **no** reiniciar contadores; los aciertos por tamaño **persisten**.

---

## Árbol de decisión tras **correcta**

Orden estricto:

1. `aciertosPorLogmar[logmarActual] += 1`
2. Si valor **≥ 2**:
   - `logmarFinal` = `logmarActual`
   - `letraFinal` = `letraActual`
   - Si ojo **R**: inicializar **L** (transición R→L) + foróptero + TV en el **mismo** turno
   - Si ojo **L**: `fase: finalizado`
   - **Fin** en ese ojo: sin bajar logMAR ni `tv` extra en ese ojo
3. Si valor quedó en **1**:
   - Si `logmarActual > 0.0`: bajar un paso, rotar letra, `tv`
   - Si `logmarActual == 0.0`: permanecer en 0.0, rotar letra, `tv`

**Nunca** “correcta → bajar” si en el mismo turno el contador ya va a **≥ 2**.

---

## Flujo por turno (clasificación ya fijada)

Orden de aplicación:

1. **incorrecta** o **no_ve** → subir un paso (o tope 0.3 + rotación), sin tocar contadores; `tv` salvo repregunta.
2. **correcta** → árbol de decisión tras correcta.
3. **frase_paciente_no_clinica** → sin finalizar examen si falta L.

### Turno **continuacion** (sin respuesta del paciente)

- Si hay cambio de ojo/logMAR/letra pendiente de MQTT según estado → emitir `acciones` necesarias; no `fase: finalizado` por error.
- Si solo hace falta repreguntar la misma letra → sin cambiar dispositivos.

---

## Transición R → L (estado + dispositivos, mismo turno)

Al cerrar **R**:

1. Patch **L**: `logmarActual: 0.3`, `letraActual: H`, `aciertosPorLogmar` en 0, `letrasUsadas: ["H"]`.
2. `ojoActual: "L"`.
3. **`acciones` obligatorias:** foróptero (L open con RX, R close) + TV H @ 0.3.
4. `evento`: `cierre_ojo_R_e_inicio_L`

**Prohibido** postergar foróptero/TV al turno siguiente.

---

## Letras Sloan

Rotación: H, O, T, E, C, F, Z, L, P, D. No repetir la misma letra en el mismo ojo si hay alternativa. Actualizar `letrasUsadas`.

---

## Eventos sugeridos (`evento` en salida del agente protocolo)

| `evento` | Significado |
|----------|-------------|
| `repregunta_sin_cambio` | ambigua / confianza_baja |
| `siguiente_optotipo` | cambió logMAR o letra en el mismo ojo |
| `cierre_ojo_R` | R cerrado, sin abrir L aún (evitar; preferir transición combinada) |
| `cierre_ojo_R_e_inicio_L` | R cerrado y L inicializado con MQTT |
| `cierre_ojo_L` | L cerrado |
| `examen_finalizado` | `fase: finalizado` |
| `continuacion_dispositivos` | solo ejecutar MQTT pendiente |
| `inicio_ojo` | primer optotipo de R o L |

La redacción al paciente la hace **comunicacion-paciente.md** según `evento` + clasificación.
