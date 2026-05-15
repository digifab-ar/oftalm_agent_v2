# Examen de agudeza visual — POC fase 1

## Alcance

- Solo test de **agudeza** monocular.
- Orden: **ojo derecho (R)** → **ojo izquierdo (L)**.
- Sin autorefractómetro, sin lentes, sin binocular en esta fase.

## RX fija de demostración (POC)

Usar siempre estos valores al configurar el foróptero:

| Ojo | Esfera | Cilindro | Ángulo |
|-----|--------|----------|--------|
| R   | +0.75  | -1.75    | 60     |
| L   | +2.75  | 0.00     | 0      |

## Confianza (`confianza` en el turno)

- Es la **confianza del agente de voz en la transcripción/captura** de lo que dijo el paciente (calidad del audio y del reconocimiento), **no** la confianza del paciente en su respuesta clínica.
- **`confianza` &lt; 0.7**: no tomes decisiones clínicas definitivas con ese texto; **repreguntá sin mover dispositivos**.
- **`confianza` ≥ 0.7**: el texto es **suficientemente fiable** como para intentar extraer letra o intención; aun así, si según **letras-fonetica-es.md** hay **ambigüedad fonética** respecto de `letraActual`, preferí **ambigua + repregunta** antes de marcar **incorrecta**.

## Interpretación de `respuestaPaciente` (prosa y nombres de letra)

El paciente puede contestar en **frase** (“veo una hache”, “estoy seguro que es te”), **nombre de letra** o **una sola letra**. No exijás formato único en el protocolo.

1. Usá **letras-fonetica-es.md** para pasar de palabras a **letra(s) Sloan candidata(s)** (H, O, T, E, C, F, Z, L, P, D).
2. **Sin candidata** clara (solo muletillas, ruido): **ambigua** → repreguntá sin mover TV ni foróptero.
3. **Una candidata**, coincide con `letraActual` → **correcta** (aplicar reglas de logMAR y doble confirmación).
4. **Una candidata**, distinta de `letraActual`, **sin** situación de **par de riesgo** que abra duda razonable → **incorrecta** (ver más abajo).
5. **Varias candidatas** o **par de riesgo** (ej. “che” con `letraActual` **H** sin señal de **C**, o “ese” entre **E** y **C**) → **ambigua**: repreguntá con mensaje breve (“¿Decís hache o ce?”, “¿es la e o la ce?”). **No** cambies logMAR ni letra hasta aclarar.
6. Contenido **no_ve / borroso / no sé la letra** (sin afirmar otra letra concreta) → tratá según sección **no_ve / borroso / no_se**, no como incorrecta por letra.

## Inicio del test por ojo

1. logMAR inicial: **0.3**
2. Letra inicial en TV: **H**
3. Mensaje sugerido: "Mirá la pantalla. Decime qué letra ves."
4. `contextoVoz`: `esperar_respuesta`

## Escala logMAR permitida

Valores válidos (de letras más grandes a más chicas): **0.3, 0.2, 0.1, 0.0**

- **Correcta** (letra identificada sin ambigüedad pendiente y coincide con la mostrada en TV / `letraActual`): bajá un paso (0.3→0.2→0.1→0.0), salvo que ya estés en la fase de **doble confirmación** en el mismo logMAR (ver abajo).
- **Subir logMAR (“un paso” hacia letras más grandes)** en **incorrecta**, **no_ve**, **borroso** y **no_se** (cuando aplique por `confianza` como arriba): usá **solo** la **transición inmediata en la tabla** (**0.0→0.1**, **0.1→0.2**, **0.2→0.3**). El **logMAR inicial 0.3** sirve solo para **empezar** cada ojo: **no** volver a saltar desde **0.0**, **0.1** ni **0.2** directo al **inicio estándar 0.3** cuando el paciente necesita una **subida**; esa subida debe ser **exactamente un paso** hasta eventualmente llegar **solo** mediante **0.2→0.3**.
- **Incorrecta** (una letra Sloan identificada, **distinta** de la mostrada, **sin** ambigüedad fonética pendiente según **letras-fonetica-es.md**): con **`confianza` ≥ 0.7**:
  - Si el logMAR actual **no es 0.3** (aún hay un paso hacia arriba en la tabla): **subí un paso** (letras más grandes). Rotá a una Sloan no usada en ese ojo para el intento en ese nivel.
  - Si ya estás en **0.3** (tope): **no podés** subir más; **permanecé en 0.3**, rotá a otra letra Sloan no usada si hay alternativa, y pedí otra respuesta.
  - **No** repreguntes en el mismo nivel solo para “ganar” un intento extra cuando correspondía **subir** logMAR y todavía **no** estabas en **0.3**.
- **no_ve / borroso / no_se** (no distingue, ve borroso, “no sé qué letra es”, “no la veo”): con **`confianza` ≥ 0.7**, si el logMAR actual **no es 0.3**, **subí exactamente un paso** como arriba; si ya estás en **0.3**, **permanecé en 0.3** y rotá letra. Si el historial de ese ojo permite concluir con claridad que conviene volver al **último logMAR correcto** en lugar del paso siguiente, podés hacerlo (coherente con otros caminos equivalentes por error/letra equivocada). Rotá letra cuando corresponda.
- **Ambigua** (incluye ambigüedad fonética tras aplicar **letras-fonetica-es.md**): **repreguntá sin mover dispositivos**, aunque `confianza` ≥ 0.7.
- **Tope 0.3**: cualquier regla que pida “subir” logMAR desde **0.3** implica **quedarse en 0.3** y, si aplica, **rotar letra**.

## Doble confirmación

- Cuando el paciente **acierta** en un logMAR, incrementá `confirmaciones`.
- Si acierta **dos veces seguidas** en el **mismo** logMAR (puede ser otra letra Sloan en la segunda vez), registrá `logmarFinal` y `letraFinal` para ese ojo y pasá al siguiente ojo (o finalizá si era L).
- Tras un acierto que **baja** logMAR, reseteá `confirmaciones` a **1** en el nuevo nivel.
- Tras **subir** logMAR por error, no_ve, borroso o **no_se**, reseteá `confirmaciones` a **0** (o **1** si contás el primer intento en el nuevo nivel como primer “intento serio”; lo importante es no arrastrar el contador del nivel anterior).

## Letras Sloan

Rotar letras: H, O, T, E, C, F, Z, L, P, D. No repetir la misma letra seguida en el mismo ojo si hay alternativa.

## Cierre

- Tras cerrar L con logMAR final, `fase` = `finalizado`.
- Mensaje breve de cierre clínico opcional.

## Mensajes

- Breves, claros, español argentino.
- No mencionar logMAR, MQTT ni herramientas al paciente.
