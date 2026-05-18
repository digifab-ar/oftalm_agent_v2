# Examen de agudeza visual — POC fase 1

Documento **único** de definición del protocolo de agudeza. El agente clínico lo aplica tal cual; la interpretación fonética de respuestas está en **letras-fonetica-es.md**; foróptero y TV en sus respectivos archivos.

## Alcance

- Solo test de **agudeza** monocular.
- Orden: **ojo derecho (R)** → **ojo izquierdo (L)**.
- Sin autorefractómetro, sin lentes, sin binocular en esta fase.

## RX fija de demostración (POC)

Usar siempre estos valores al configurar el foróptero (detalle de comando en **foroptero.md**):

| Ojo | Esfera | Cilindro | Ángulo |
|-----|--------|----------|--------|
| R   | +0.75  | -1.75    | 60     |
| L   | +2.75  | 0.00     | 0      |

## Confianza (`confianza` en el turno)

- Es la **confianza del agente de voz en la transcripción/captura** de lo que dijo el paciente (calidad del audio y del reconocimiento), **no** la confianza del paciente en su respuesta clínica.
- **`confianza` &lt; 0.7**: no tomes decisiones clínicas definitivas con ese texto; **repreguntá sin mover dispositivos** (`esperar_respuesta`). **No** modifiques `aciertosPorLogmar`.
- **`confianza` ≥ 0.7**: el texto es **suficientemente fiable** para intentar extraer letra o intención; aun así, si según **letras-fonetica-es.md** hay **ambigüedad fonética** respecto de `letraActual`, preferí **ambigua + repregunta** antes de marcar **incorrecta**.

## Interpretación de `respuestaPaciente` (prosa y nombres de letra)

El paciente puede contestar en **frase** (“veo una hache”, “estoy seguro que es te”), **nombre de letra** o **una sola letra**. No exijás formato único en el protocolo.

1. Usá **letras-fonetica-es.md** para pasar de palabras a **letra(s) Sloan candidata(s)** (H, O, T, E, C, F, Z, L, P, D).
2. **Sin candidata** clara (solo muletillas, ruido): **ambigua** → repreguntá sin mover TV ni foróptero.
3. **Una candidata**, coincide con `letraActual` → **correcta** (aplicar reglas de logMAR y **`aciertosPorLogmar`** / doble confirmación).
4. **Una candidata**, distinta de `letraActual`, **sin** situación de **par de riesgo** que abra duda razonable → **incorrecta** (ver más abajo).
5. **Varias candidatas** o **par de riesgo** (ej. “che” con `letraActual` **H** sin señal de **C**, o “ese” entre **E** y **C**) → **ambigua**: repreguntá con mensaje breve (“¿Decís hache o ce?”, “¿es la e o la ce?”). **No** cambies logMAR ni letra hasta aclarar.
6. Contenido **no_ve / borroso / no sé la letra** (sin afirmar otra letra concreta) → tratá según sección **no_ve / borroso / no_se**, no como incorrecta por letra.
7. Frases de **intención** (“terminé”, “ya está”, “chau”, “acá terminé el examen”) **sin** nombrar letra → **frase_paciente_no_clinica** (ver **Cierre**); no cerrar el examen por eso solo.

### Resumen de clasificación (con `confianza` ≥ 0.7)

| Clasificación | Efecto en logMAR / dispositivos |
|---------------|----------------------------------|
| **correcta** | **Primero** incrementar `aciertosPorLogmar` y evaluar **cierre** (`>= 2`); **solo si no cierra**, bajar un paso o rotar en 0.0 (ver **Árbol de decisión tras correcta**). |
| **incorrecta** | Subir **un** paso en la tabla (o permanecer en 0.3 y rotar letra). No incrementar `aciertosPorLogmar`. |
| **no_ve / borroso / no_se** | Igual que subir por incorrecta (un paso o tope 0.3 + rotación). No incrementar `aciertosPorLogmar`. |
| **ambigua** | Repreguntar; **no** mover TV ni foróptero; **no** modificar `aciertosPorLogmar`. |
| **frase_paciente_no_clinica** | Mensaje empático; **no** `fase: finalizado` si L no cerró; seguir protocolo (ver **Cierre**). |
| **`confianza` &lt; 0.7** | Repreguntar; **no** mover dispositivos; **no** modificar `aciertosPorLogmar`. |

## Inicio del test por ojo

1. Foróptero: RX del ojo en test + oclusión del contralateral (**foroptero.md**).
2. logMAR inicial: **0.3**
3. Letra inicial en TV: **H**
4. Inicializá **`aciertosPorLogmar`** del ojo: `"0.3"`, `"0.2"`, `"0.1"`, `"0.0"` en **0**.
5. Mensaje sugerido: "Mirá la pantalla. Decime qué letra ves."
6. `contextoVoz`: `esperar_respuesta`

## Escala logMAR permitida

Valores válidos (de letras más grandes a más chicas): **0.3, 0.2, 0.1, 0.0**

- **Correcta** (letra identificada sin ambigüedad pendiente y coincide con la mostrada en TV / `letraActual`): aplicá **Árbol de decisión tras correcta** (incrementar contador, evaluar cierre **antes** de bajar).
- **Subir logMAR (“un paso” hacia letras más grandes)** en **incorrecta**, **no_ve**, **borroso** y **no_se** (cuando aplique por `confianza` como arriba): usá **solo** la **transición inmediata en la tabla** (**0.0→0.1**, **0.1→0.2**, **0.2→0.3**). El **logMAR inicial 0.3** sirve solo para **empezar** cada ojo: **no** volver a saltar desde **0.0**, **0.1** ni **0.2** directo al **inicio estándar 0.3** cuando el paciente necesita una **subida**; esa subida debe ser **exactamente un paso** hasta eventualmente llegar **solo** mediante **0.2→0.3**.
- **Incorrecta** (una letra Sloan identificada, **distinta** de la mostrada, **sin** ambigüedad fonética pendiente según **letras-fonetica-es.md**): con **`confianza` ≥ 0.7**:
  - Si el logMAR actual **no es 0.3** (aún hay un paso hacia arriba en la tabla): **subí un paso** (letras más grandes). Rotá a una Sloan no usada en ese ojo para el intento en ese nivel.
  - Si ya estás en **0.3** (tope): **no podés** subir más; **permanecé en 0.3**, rotá a otra letra Sloan no usada si hay alternativa, y pedí otra respuesta.
  - **No** repreguntes en el mismo nivel solo para “ganar” un intento extra cuando correspondía **subir** logMAR y todavía **no** estabas en **0.3**.
- **no_ve / borroso / no_se** (no distingue, ve borroso, “no sé qué letra es”, “no la veo”): con **`confianza` ≥ 0.7**, si el logMAR actual **no es 0.3**, **subí exactamente un paso** como arriba; si ya estás en **0.3**, **permanecé en 0.3** y rotá letra. Si el historial de ese ojo permite concluir con claridad que conviene volver al **último logMAR correcto** en lugar del paso siguiente, podés hacerlo (coherente con otros caminos equivalentes por error/letra equivocada). Rotá letra cuando corresponda.
- **Ambigua** (incluye ambigüedad fonética tras aplicar **letras-fonetica-es.md**): **repreguntá sin mover dispositivos**, aunque `confianza` ≥ 0.7.
- **Tope 0.3**: cualquier regla que pida “subir” logMAR desde **0.3** implica **quedarse en 0.3** y, si aplica, **rotar letra**.

## Doble confirmación

- Mantené por ojo **`aciertosPorLogmar`**: claves **`"0.3"`**, **`"0.2"`**, **`"0.1"`**, **`"0.0"`** (strings) y valores enteros ≥ 0. Al **iniciar** el test de cada ojo (R o L), poné todas en **0**.
- Cada **correcta** (coincidencia clara con `letraActual`): sumá **1** a **`aciertosPorLogmar`** del `logmarActual` actual (usá la misma convención de clave que el JSON del estado, p. ej. `"0.1"` para logMAR 0.1).
- **Dos aciertos en el mismo logMAR** significa **dos incrementos** sobre el **mismo** valor de logMAR **acumulados a lo largo del examen de ese ojo**, aunque entre medios el paciente haya **bajado** a una línea más chica y **vuelto a subir** por **incorrecta** o por **no_ve / borroso / no_se**. No exijas que los dos aciertos sean “turnos consecutivos” en el historial sin visitar otro tamaño; el contador por tamaño es la fuente de verdad.
- Si tras sumar queda **`aciertosPorLogmar[logmarActual] >= 2`**: registrá `logmarFinal` y `letraFinal` (la `letraActual` de **este** turno) para ese ojo y pasá al siguiente ojo (o finalizá si era L). **En ese turno no bajes** a logMAR más chico ni sigas probando líneas más chicas en ese ojo.
- Si queda en **1** y `logmarActual > 0.0`: aplicá la regla de la escala y **bajá un paso** con letra Sloan no usada.
- Si queda en **1** y `logmarActual == 0.0`: **no** podés bajar; rotá letra en **0.0** hasta el siguiente acierto en **0.0** (el contador llegará a 2 y cerrará el ojo).
- Tras **subir** logMAR por error, **no_ve**, **borroso** o **no_se**, **no reinicies** `aciertosPorLogmar` a cero: los aciertos ya anotados en cada tamaño **siguen contando** (evita volver a **0.0** cuando ya hubo un acierto en **0.1** y un borroso en **0.0**).
- **`confirmaciones`**: opcional para logs; si la usás, mantenela coherente con el flujo, pero el **cierre del ojo** se define por **`aciertosPorLogmar`** como arriba.

## Anti-patrones (prohibido reinterpretar)

No inventes reglas distintas de este documento. En particular **está prohibido**:

| Anti-patrón (incorrecto) | Regla correcta |
|--------------------------|----------------|
| “Dos aciertos **consecutivos** en el historial” | Dos incrementos en **`aciertosPorLogmar[logmar]`** ≥ 2, aunque entre medios hubo otras líneas |
| “Cerrar solo en el **nivel más chico** alcanzado en el examen” | Cerrar en el logMAR donde el contador llega a **2** tras una **correcta** |
| “El segundo acierto en 0.2 **no cierra** si antes hubo visita a 0.1” | **Sí cierra** si `aciertosPorLogmar["0.2"]` ≥ 2 tras sumar en este turno |
| “Reiniciar contadores al subir o bajar logMAR” | Los aciertos por tamaño **persisten** |
| “Bajar a una línea más chica después de una correcta que deja el contador en 2” | En ese turno el **cierre manda**; no bajar ni rotar para seguir explorando |
| “`fase: finalizado` porque el paciente dijo que terminó” | Solo si **`agudeza.L.logmarFinal`** está registrado (L cerrado) |

## Árbol de decisión tras correcta

Aplicá **en este orden** (con `confianza` ≥ 0.7 y clasificación **correcta**):

1. `aciertosPorLogmar[String(logmarActual)] += 1`
2. **Si** el valor queda **≥ 2**:
   - `logmarFinal` = `logmarActual`
   - `letraFinal` = `letraActual` (letra de **este** turno)
   - Si el ojo era **R**: inicializar test de **L** (ver **Transición R → L** y **sistema.md** para acciones foróptero + TV en el **mismo** turno)
   - Si el ojo era **L**: `fase: finalizado`
   - **Fin** para ese ojo: **no** bajar logMAR, **no** nueva acción `tv` para seguir probando en ese ojo
3. **Si no** (valor quedó en **1**):
   - Si `logmarActual > 0.0`: **bajá un paso**, rotá letra Sloan no usada, acción `tv`
   - Si `logmarActual == 0.0`: **permanecé en 0.0**, rotá letra, acción `tv`, `esperar_respuesta`

## Ejemplo trabajado (POC)

Secuencia típica en ojo **R** (simplificada del QA):

| Paso | logMAR | letra | Respuesta | Efecto en contadores |
|------|--------|-------|-----------|----------------------|
| 1 | 0.3 | H | correcta H | `0.3` → 1; bajar a 0.2 |
| 2 | 0.2 | O | correcta O | `0.2` → 1; bajar a 0.1 |
| 3 | 0.1 | T | no_ve | subir a 0.2 (sin sumar) |
| 4 | 0.2 | E | correcta E | `0.2` → **2** → **CIERRE R** |

En el paso 4, con `aciertosPorLogmar["0.2"] == 2`:

- **Correcto:** `logmarFinal: 0.2`, `letraFinal: "E"`, abrir **L**, foróptero + TV **H @ 0.3**, `ojoActual: "L"`.
- **Incorrecto:** bajar a 0.1 con otra letra “porque el paciente había estado en 0.1 antes”.
- **Incorrecto:** postergar acciones de dispositivos “para el turno siguiente”.

## Transición R → L (clínica)

Al **cerrar R** (`agudeza.R.logmarFinal` registrado):

1. Inicializá bloque **L** en estado: `logmarActual: 0.3`, `letraActual: H`, `aciertosPorLogmar` todo en 0, `letrasUsadas: ["H"]`.
2. `ojoActual: "L"`.
3. El paciente **no** está en test de L hasta que foróptero (L abierto, R cerrado) y TV (H @ 0.3) se ejecuten — ver **sistema.md** (mismo turno que el cierre de R, con `acciones` completas).

## Flujo por turno (`confianza` ≥ 0.7, respuesta no ambigua)

Objetivo: aplicar el protocolo sin contradecir la doble confirmación. Tras **no_ve** en una línea más chica, si una **correcta** en una línea más grande lleva `aciertosPorLogmar` de esa línea a **≥ 2**, aplicá **cierre** en ese turno; **no** bajes otra vez a la línea chica.

Orden estricto de **clasificación**:

1. **incorrecta** o **no_ve / borroso / no_se** (sin letra sustituta clara) → subí **un** paso en la tabla (o permanecé en **0.3** y rotá), rotá Sloan no usada, **no** incrementes `aciertosPorLogmar`. Incluí acción **tv** acorde salvo repregunta sin mover dispositivos.
2. **correcta** (una candidata = `letraActual`) → seguí **Árbol de decisión tras correcta**.
3. **frase_paciente_no_clinica** → ver **Cierre**; no finalizar si falta L.

### Reglas de coherencia (obligatorias)

- **Nunca** apliques “correcta → bajar” si en el **mismo** turno **`aciertosPorLogmar`** para el `logmarActual` actual ya va a **2**: el **cierre** manda.
- Tras **subir** por incorrecta, **no_ve**, **borroso** o **no_se**, **no** reinicies `aciertosPorLogmar`: los aciertos ya registrados en cada tamaño **siguen valiendo** (ej.: acierto en **0.1**, bajada a **0.0**, borroso, vuelta a **0.1** → el siguiente acierto en **0.1** debe cerrar en **0.1**, sin bajar otra vez a **0.0**).
- Cerrá un ojo cuando, tras una **correcta**, **`aciertosPorLogmar`** para ese logMAR llega a **2**; no alcanza con “dos turnos seguidos” sin el contador por tamaño.

## Letras Sloan

Rotar letras: H, O, T, E, C, F, Z, L, P, D. No repetir la misma letra seguida en el mismo ojo si hay alternativa. Registrar en `letrasUsadas` cuando corresponda.

## Cierre

- **R cerrado** = `agudeza.R.logmarFinal != null`.
- **L cerrado** = `agudeza.L.logmarFinal != null`.
- **`fase: finalizado`** solo si **L** está cerrado (`agudeza.L.logmarFinal != null`). **Nunca** finalizar solo porque el paciente dijo “terminé”, “ya está”, “chau” o similar (**frase_paciente_no_clinica**).
- Si R ya cerró y L no: mensaje empático (ej. “Entiendo. Seguimos un momento con el otro ojo.”) y **continuar** el protocolo de L con foróptero + TV si aún no se enviaron.
- Tras cerrar L: mensaje breve de cierre clínico opcional y `fase: finalizado`.

## Mensajes al paciente

- Breves, claros, español argentino.
- No mencionar logMAR, MQTT ni herramientas al paciente.
