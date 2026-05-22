# Fixtures — agente auditor (agudeza)

JSON para validación **manual** del auditor: armar el user prompt como `agents/auditor.js` (`estadoAntes`, `interpretacion`, `propuestaProtocolo`, `modo`).

**Importante (diseño 2026-05-19):** en `modo: respuesta`, el campo `estadoAntes` de cada fixture representa el estado **tras registro del intento** en servidor (`resultadosPorLogmar` ya actualizado). El protocolo **no** debe incluir contadores en el patch; en cierre R solo `logmarFinal` (sin `letraFinal`).

Cada fixture incluye `esperado.aprobado` y notas. No hay runner automatizado en esta iteración.

| ID | Archivo | Clasificación | Resultado esperado |
|----|---------|---------------|-------------------|
| AUD-01 | `AUD-01-no_ve-sin-incrementar-contador.json` | `no_ve` @0.1, `0.2:1` previo, patch mantiene contadores | `aprobado: true` |
| AUD-02 | `AUD-02-no_ve-incrementa-contador.json` | `no_ve` incrementa contador | `aprobado: false` |
| AUD-03 | `AUD-03-correcta-solo-contador.json` | `correcta` sin `tv` | `aprobado: false` |
| AUD-04 | `AUD-04-correcta-cierre-R.json` | `correcta` 2.º en 0.2 | `aprobado: true` |
| AUD-05 | `AUD-05-no_ve-sube-dos-pasos.json` | `no_ve` 0.1→0.3 | `aprobado: false` |
| AUD-06 | `AUD-06-ambigua-sin-acciones.json` | `ambigua` | `aprobado: true` |
| AUD-07 | `AUD-07-no_ve-resetea-contador.json` | `no_ve` @0.1, `0.2:1` previo, patch resetea `0.2` a 0 | `aprobado: false` |
| AUD-11 | `AUD-11-bug005-letra-nueva.json` | `correcta` BAJAR, letra T ∉ previas `["H","O"]` | `aprobado: true` |
| AUD-12 | `AUD-12-bug005-letra-reutilizada.json` | `correcta` BAJAR 0.1→0.0, reutiliza H | `aprobado: false` (BUG-005) |

Regresión log 2026-05-19: **AUD-01** reproduce el caso correcto del turno 4 (“veo borroso”); **AUD-07** reproduce el bug real del turno 4 (reset de contadores ganados que el auditor aprobó por error).

Regresión log 2026-05-22: **AUD-12** + fixture protocolo `fixtures/protocolo/BUG005-L-bajar-0.0.json` (QA manual auditor/protocolo LLM).
