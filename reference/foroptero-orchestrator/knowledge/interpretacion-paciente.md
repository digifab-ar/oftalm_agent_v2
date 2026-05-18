# Interpretación de respuestas del paciente — POC agudeza

**Agente:** intérprete.  
**Alcance:** pasar de `respuestaPaciente` + `confianza` a una **clasificación lingüística**. No actualizás estado, logMAR, contadores ni dispositivos.

Referencias cruzadas: reglas de estado en **protocolo-agudeza-estado.md**; mensajes al paciente en **comunicacion-paciente.md**.

---

## Entradas que usás

- `respuestaPaciente` (texto libre del agente de voz, transcripción literal).
- `confianza` (0–1): calidad de la **transcripción**, no certeza clínica del paciente.
- Del estado, solo: `ojoActual`, `agudeza[ojo].letraActual` (y opcionalmente `logmarActual` para contexto, **sin** decidir transiciones).

Turno sin texto (`continuacion`): emití `clasificacion: continuacion` sin reinterpretar fonética.

---

## Confianza (`confianza`)

- **`confianza` &lt; 0.7**: clasificación **`confianza_baja`**. No extraigas letras definitivas ni marques correcta/incorrecta por letra.
- **`confianza` ≥ 0.7**: podés aplicar la tabla fonética y las reglas de abajo; si hay **ambigüedad fonética** respecto de `letraActual`, preferí **`ambigua`** antes que **`incorrecta`**.

---

## Clasificaciones (salida del intérprete)

| Valor | Cuándo |
|-------|--------|
| **correcta** | Una letra Sloan candidata clara y coincide con `letraActual`. |
| **incorrecta** | Una candidata clara, distinta de `letraActual`, sin par de riesgo que abra duda razonable. |
| **no_ve** | No distingue / borroso / “no sé qué letra es” / “no la veo”, **sin** nombrar otra letra Sloan concreta como respuesta. |
| **ambigua** | Sin candidata clara, varias candidatas, letra fuera de Sloan sin mapeo, o par de riesgo relevante (ver fonética). |
| **confianza_baja** | `confianza` &lt; 0.7. |
| **frase_paciente_no_clinica** | Intención social (“terminé”, “ya está”, “chau”) **sin** nombrar letra. |
| **continuacion** | Sin `respuestaPaciente` en este turno (arranque o continuación de voz). |

**No emitís:** `estadoPatch`, `acciones`, `mensajesPaciente`, ni el logMAR siguiente.

---

## Procedimiento (con `confianza` ≥ 0.7)

El paciente puede contestar en frase (“veo una hache”), nombre de letra o una sola letra.

1. Aplicá la **tabla fonética** (abajo) → letra(s) Sloan candidata(s): H, O, T, E, C, F, Z, L, P, D.
2. Solo muletillas o ruido → **ambigua**.
3. Una candidata = `letraActual` → **correcta** (incluí `letraElegida`).
4. Una candidata ≠ `letraActual`, sin par de riesgo pendiente → **incorrecta** (`letraElegida`).
5. Varias candidatas o par de riesgo (ej. “che” con `letraActual` **H**) → **ambigua**; sugerí en `notasInterprete` repregunta entre dos letras (el texto lo redacta comunicación).
6. **no_ve** / borroso / no sé la letra (sin otra letra concreta) → **no_ve**.
7. Frases de intención sin letra → **frase_paciente_no_clinica**.

---

## Tabla fonética Sloan (español rioplatense)

Letras válidas en TV: **H, O, T, E, C, F, Z, L, P, D**.

| Letra | Nombres / formas típicas | Notas / variantes ASR |
|-------|---------------------------|------------------------|
| **H** | hache, la hache, la ache, ache | "veo una h", "hache larga". **Cuidado:** *che* a veces es **hache** mal transcrito. Si `letraActual` es **H** y el texto tiene **che** sin señal clara de **C** (ce, "de casa"), → **ambigua**, no incorrecta. |
| **O** | o, o latina, letra o, "una o" | "cero" por error de discurso; si el contexto es nombrar letra y solo dice "o" → **O**. |
| **T** | te, té, te latina | "una te", "veo te". |
| **E** | e, e latina, letra e | |
| **C** | ce, la ce, ce/c de casa, **ese** (riesgo con **E**) | "ce" o mnemotecnia casa → **C**. |
| **F** | efe, efe grande, la efe | |
| **Z** | zeta | "seta" poco frecuente; evaluar contexto. |
| **L** | ele, la ele | Confusión con "el" muy corto → **ambigua** si no hay claridad. |
| **P** | pe, la pe | |
| **D** | de, la de | |

### Pares de riesgo

- **H ↔ C**: *hache* como *che* con **H** en pantalla.
- **E ↔ C**: *e* vs *ce* / *ese*.
- **T ↔ P** (menor): audio pobre.
- **F ↔ S** u otras **fuera de Sloan**: si no mapeás a la lista, → **ambigua** (no inventes pares no listados salvo los de arriba).

### Letras fuera de Sloan

Si nombran **I, A, S, N**, etc. sin mapeo claro → **ambigua** (repregunta; ver plantillas en **comunicacion-paciente.md**).

---

## Salida JSON esperada (intérprete)

```json
{
  "clasificacion": "correcta",
  "letrasCandidatas": ["H"],
  "letraElegida": "H",
  "notasInterprete": "opcional, breve"
}
```

- `letraElegida`: solo si hay una candidata clara.
- `letrasCandidatas`: todas las Sloan que el texto sustenta.
