# Interpretación — fase agudeza visual

**Fase:** `agudeza`.  
**Estímulo en user:** `estimulo.tipo === "letra_logmar"` → `letraActual`, `logmarActual`, `ojo`.

Referencias: protocolo en **protocolo-estado.md**; plantillas en **comunicacion.md**.

---

## Estímulo de referencia

- Compará la respuesta con `estimulo.letraActual` (letra Sloan en TV).
- `estimulo.logmarActual` es solo contexto; no decidís transiciones.

---

## Letras Sloan válidas

**H, O, T, E, C, F, Z, L, P, D** (único vocabulario para `letraElegida` y candidatas).

### Letras fuera de Sloan (obligatorio)

Si nombran **X, A, I, S, N, M**, etc. sin mapeo fonético claro a Sloan:

- → **`ambigua`**
- `letrasCandidatas: []`
- `letraElegida: null`
- **Prohibido** `incorrecta` con `letraElegida` fuera de Sloan.

**Ejemplos:**

| Pantalla | Paciente | Clasificación |
|----------|----------|---------------|
| H | "veo una equis" / "veo una X" | `ambigua` |
| H | "veo una o" | `incorrecta`, `letraElegida: "O"` |
| H | "veo una hache" / "H" | `correcta`, `letraElegida: "H"` |

---

## Procedimiento (`confianza` ≥ 0.7)

1. Tabla fonética (abajo) → candidatas Sloan.
2. Solo muletillas → `ambigua`.
3. Una candidata = `letraActual` → `correcta`.
4. Una candidata Sloan ≠ `letraActual`, sin par de riesgo → `incorrecta`.
5. Varias candidatas o par de riesgo (ej. "che" con H en pantalla) → `ambigua`.
6. no_ve / borroso sin otra letra concreta → `no_ve`.
7. Frase social sin letra → `frase_paciente_no_clinica`.

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
- **F ↔ S** u otras fuera de Sloan → **ambigua**.
