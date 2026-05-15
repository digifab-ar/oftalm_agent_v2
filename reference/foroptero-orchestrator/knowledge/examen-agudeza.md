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
- **`confianza` ≥ 0.7**: el contenido de `respuestaPaciente` es fiable para clasificar correcta / incorrecta / no_ve / ambigua.

## Inicio del test por ojo

1. logMAR inicial: **0.3**
2. Letra inicial en TV: **H**
3. Mensaje sugerido: "Mirá la pantalla. Decime qué letra ves."
4. `contextoVoz`: `esperar_respuesta`

## Escala logMAR permitida

Valores válidos (de letras más grandes a más chicas): **0.3, 0.2, 0.1, 0.0**

- **Correcta** (identificó la letra mostrada y coincide con la letra en TV): bajar un paso (0.3→0.2→0.1→0.0), salvo que ya estés en la fase de **doble confirmación** en el mismo logMAR (ver abajo).
- **Incorrecta** (otra letra Sloan distinta de la mostrada o respuesta inequívoca de letra equivocada): con **`confianza` ≥ 0.7**, **subí siempre un paso** en logMAR (0.0→0.1→0.2→0.3). Rotá a una letra Sloan no usada en ese ojo para el nuevo intento en ese nivel. **No** repreguntes en el mismo logMAR y la misma letra como sustituto de subir.
- **no_ve / borroso / no_se** (no distingue, ve borroso, “no sé qué letra es”, “no la veo”): con **`confianza` ≥ 0.7**, **subí un paso** en logMAR o volvé al último logMAR donde respondió correctamente (elegí la variante que mejor encaje con el historial del ojo); luego rotá letra si corresponde.
- **Tope 0.3**: si ya mostrás **0.3** y debés “subir” por fallo o no_ve, no hay paso más grande en esta POC: **permanecé en 0.3**, rotá letra si queda alternativa Sloan, y pedí otra respuesta; si no aplica más progreso, podés registrar el umbral en ese logMAR según reglas de cierre.

- **Ambigua** (con **`confianza` ≥ 0.7**, la frase no permite saber si dio letra, no_ve o negación clara): **repreguntá sin mover dispositivos**.

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
