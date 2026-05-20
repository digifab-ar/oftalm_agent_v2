# Interpretación — fase agudeza visual

**Fase:** `agudeza`.  
**Estímulo en VistaInterprete:** `estimulo.tipo === "letra_logmar"` → `letraActual`, `logmarActual`, `ojo`.

Referencias: protocolo en **protocolo-estado.md**; plantillas en **comunicacion.md**.

---

## Estímulo de referencia

- Compará la respuesta con `estimulo.letraActual` (letra Sloan en TV).
- `estimulo.logmarActual` es solo contexto; no decidís transiciones.

---

## Letras Sloan válidas

**H, O, T, E, C, F, Z, L, P, D** (único vocabulario para `letraElegida` y candidatas).

### Letras fuera de Sloan (obligatorio)

Si nombran **explícitamente** una letra que **no está en el set Sloan** (X, A, I, S, N, M, etc.) y **no** hay mapeo fonético claro a una Sloan de la tabla:

- → **`incorrecta`**
- `letrasCandidatas: []`
- `letraElegida: null` (**nunca** rellenar `letraElegida` con letras fuera de Sloan)

**Ejemplos:**

| Pantalla | Paciente | Clasificación |
|----------|----------|---------------|
| H | "veo una equis" / "veo una X" | `incorrecta`, `letraElegida: null` |
| H | "veo una o" | `incorrecta`, `letraElegida: "O"` |
| H | "veo una hache" / "H" | `correcta`, `letraElegida: "H"` |

---

## Procedimiento (`confianza` ≥ 0.7)

1. Tabla fonética (abajo) → candidatas Sloan.
2. Letra nombrada **fuera de Sloan** sin mapeo a Sloan → `incorrecta`, `letraElegida: null`.
3. Solo muletillas → `ambigua`.
4. Una candidata Sloan = `letraActual` → `correcta`.
5. Una candidata Sloan ≠ `letraActual`, sin par de riesgo → `incorrecta`.
6. Varias candidatas Sloan o par de riesgo (ej. "che" con H en pantalla) → `ambigua`.
7. no_ve / borroso sin otra letra concreta → `no_ve`.
8. Frase social sin letra → `frase_paciente_no_clinica`.

---

## Tabla fonética Sloan (español rioplatense)

| Letra | Nombres / formas | Notas |
|-------|------------------|-------|
| **H** | hache, ache | *che* con H en pantalla → **ambigua** si no es clara la **C** |
| **O** | o, o latina | |
| **T** | te, té | |
| **E** | e, e latina | |
| **C** | ce, c de casa | Riesgo con **E** (*ese*) |
| **F** | efe | |
| **Z** | zeta | |
| **L** | ele | "el" muy corto → **ambigua** |
| **P** | pe | |
| **D** | de | |

### Pares de riesgo

- **H ↔ C**, **E ↔ C**, **T ↔ P** (menor).
- **F ↔ S** (fonético): si el sonido es *ese* y en pantalla hay **F**, puede ser **ambigua** (duda entre F y confusión fonética). Si nombran **S** o otra letra **fuera de Sloan** de forma explícita → **`incorrecta`**, `letraElegida: null`.
