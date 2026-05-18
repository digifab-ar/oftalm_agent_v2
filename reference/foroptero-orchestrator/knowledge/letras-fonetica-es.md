# Letras Sloan — nombres y variantes en español (POC)

Referencia para **interpretar** `respuestaPaciente` (prosa, ASR). El agente de voz envía transcripción literal; **normalización y desambiguación** las hace el **agente clínico** con el estado (`letraActual`, contexto).

Ámbito: **español rioplatense**; letras válidas en TV: **H, O, T, E, C, F, Z, L, P, D**.

---

## Tabla por letra Sloan

| Letra | Nombres / formas típicas | Notas / variantes escritas (ASR) |
|-------|---------------------------|----------------------------------|
| **H** | hache, la hache, "la hache", la ache, ache | Suelen aparecer también: "veo una h", "es una hache", "hache larga". **Cuidado:** *che* solo es **C** en muchos contextos, pero **hache** mal transcrito suele salir como **"che"** o **"veo una che"** cuando el paciente dijo **hache**. Si `letraActual` es **H** y el texto contiene **che** sin otra señal clara de **C** (ce, "de casa", etc.), tratá como **ambigüedad fonética** (repregunta), no como incorrecta automática. |
| **O** | o, o latina, letra o, "una o" | A veces "cero" por error de discurso; si el contexto es nombrar letra y solo dice "o", mapear a **O**. |
| **T** | te, té (misma pronunciación), te latina | "una te", "veo te". |
| **E** | e, e latina, letra e | |
| **C** | ce, "la ce", **ce de casa** / **c de casa** (mnemotecnia coloquial), **ese** (riesgo con **E**) | Si dicen explícitamente "ce" o mnemotecnia de **casa** → **C**. |
| **F** | efe, efe grande, la efe | |
| **Z** | zeta, zeta (acento gráfico variable) | Transcripciones: "seta" poco frecuente; evaluar contexto. |
| **L** | ele, la ele, e**le** | Confusión con pronombre "el" si está muy corto → repreguntar si no hay claridad. |
| **P** | pe, la pe | |
| **D** | de, la de | |

---

## Pares de riesgo (transcripción / acento)

- **H ↔ C**: *hache* mal oído o transcrito como *che* / *veo una che* con **H** en pantalla.
- **E ↔ C**: *e* vs *ce* / *ese* en frases cortas.
- **T ↔ P** (menor en español): *te* vs *pe* con audio pobre.
- **F ↔ S** (si el modelo inventa letras no Sloan): si surge una letra **fuera** de la lista Sloan, clasificar como respuesta con letra no válida en carta → en general **incorrecta** o **ambigüa** si no entendés qué letra Sloan quiso nombrar.

---

## Uso en el agente clínico

1. **Extraé** de la frase una o más **letras Sloan candidatas** usando esta tabla (sin pedir al paciente un formato único).
2. Si hay **una** candidata y coincide con `letraActual` → **correcta** (salvo reglas de doble confirmación).
3. Si hay **una** candidata claramente distinta de `letraActual` y **no** aplica un par de riesgo que abra duda → **incorrecta** (ver reglas de logMAR en examen-agudeza.md).
4. Si el texto encaja con **varias** candidatas o con un **par de riesgo** relevante para `letraActual` → **ambigua**: repreguntá sin cambiar dispositivos; mensaje corto pidiendo aclarar entre dos letras o repetir el nombre.
5. Si nombran una letra **fuera** de la lista Sloan (p. ej. “I”, “A”, “S”, “N”) sin mapeo claro en esta tabla → **ambigua**: repreguntá sin mover dispositivos. Podés pedir el nombre en español (“¿Es hache, ce, te…?”) o, si `letraActual` es una sola letra válida, preguntar por esa letra (“¿Es la te que ves?”). **No** inventes pares de riesgo no documentados (T/L) salvo que el audio encaje con un **par de riesgo** de la sección anterior.

Este archivo **no** sustituye el criterio clínico ante `confianza` baja: si **`confianza` &lt; 0.7**, seguí examen-agudeza.md y **repreguntá** sin clasificar.
