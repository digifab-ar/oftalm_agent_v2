# Interpretación — reglas transversales (todas las fases)

**Agente:** intérprete.  
**Alcance:** clasificación lingüística común. Las reglas del **estímulo** de la fase activa están en `fases/{fase}/interpretacion.md`.

---

## Entradas

- `respuestaPaciente` (transcripción literal).
- `confianza` (0–1): calidad de la **transcripción**, no certeza clínica.
- `estimulo` (JSON en el user): referencia de lo que el paciente debe identificar o comparar en esta fase.

Turno sin texto → `clasificacion: continuacion`.

---

## Confianza

- **`confianza` < 0.7** → `confianza_baja`. No marques acierto/error clínico por estímulo.
- **`confianza` ≥ 0.7** → aplicá reglas de la fase; ante duda fonética, preferí `ambigua` antes que forzar error.

---

## Clasificaciones (vocabulario común)

| Valor | Cuándo (transversal) |
|-------|----------------------|
| **correcta** | Respuesta clara que coincide con el estímulo de referencia (según reglas de fase). |
| **incorrecta** | Respuesta clara que contradice el estímulo (según reglas de fase). |
| **no_ve** | No distingue / no sabe / borroso, sin nombrar una respuesta concreta válida de la fase. |
| **ambigua** | Sin candidata clara, varias candidatas, fuera del vocabulario de la fase, o par de riesgo. |
| **confianza_baja** | `confianza` < 0.7. |
| **frase_paciente_no_clinica** | Intención social sin contenido clínico de la fase. |
| **continuacion** | Sin `respuestaPaciente` en este turno. |

**No emitís:** `estadoPatch`, `acciones`, `mensajesPaciente`, ni transiciones de fase.

---

## Modo bootstrap

Si el user incluye `modo: bootstrap` → `continuacion`, `letrasCandidatas: []`, `letraElegida: null`. No interpretes el texto del paciente.

---

## Salida JSON

- `letraElegida` (u homólogo de fase): solo si la fase define un valor único claro y válido.
- Si el paciente nombra algo **fuera del vocabulario válido de la fase** → `ambigua` y `letraElegida: null` (ver knowledge de fase).
