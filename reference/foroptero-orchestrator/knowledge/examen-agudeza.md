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

## Inicio del test por ojo

1. logMAR inicial: **0.3**
2. Letra inicial en TV: **H**
3. Mensaje sugerido: "Mirá la pantalla. Decime qué letra ves."
4. `contextoVoz`: `esperar_respuesta`

## Escala logMAR permitida

Valores válidos (de más grande a más chico): **0.3, 0.2, 0.1, 0.0**

- **Correcta** (identificó la letra mostrada): bajar un paso (0.3→0.2→0.1→0.0) salvo que ya estés confirmando en el mismo logMAR.
- **Incorrecta** (otra letra): tratar como no acierto en este nivel.
- **no_ve / borroso**: subir un paso o volver al último logMAR donde respondió correctamente.
- **no_se / ambiguo / confianza &lt; 0.7**: repreguntar sin mover dispositivos.

## Doble confirmación

- Cuando el paciente acierta en un logMAR, incrementar `confirmaciones`.
- Si acierta **dos veces seguidas** en el **mismo** logMAR (puede ser otra letra Sloan), registrar `logmarFinal` y `letraFinal` para ese ojo y pasar al siguiente ojo (o finalizar si era L).
- Tras un acierto que baja logMAR, resetear `confirmaciones` a 1 en el nuevo nivel.

## Letras Sloan

Rotar letras: H, O, T, E, C, F, Z, L, P, D. No repetir la misma letra seguida en el mismo ojo si hay alternativa.

## Cierre

- Tras cerrar L con logMAR final, `fase` = `finalizado`.
- Mensaje breve de cierre clínico opcional.

## Mensajes

- Breves, claros, español argentino.
- No mencionar logMAR, MQTT ni herramientas al paciente.
