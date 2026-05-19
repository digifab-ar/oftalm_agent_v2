# Protocolo de agudeza visual — estado y transiciones

**Fase:** `agudeza`.  
**Agente:** protocolo.  
**Prompt de rol:** `prompts/protocolo-agudeza.md` (repite pasos críticos del árbol).

Referencias: **dispositivos.md**; auditoría en **auditoria.md**; interpretación en **interpretacion.md**.

---

## Alcance

- Test de **agudeza** monocular: **R** → **L**.
- Sin lentes ni binocular en esta fase.

---

## RX fija (POC)

| Ojo | Esfera | Cilindro | Ángulo |
|-----|--------|----------|--------|
| R   | +0.75  | -1.75    | 60     |
| L   | +2.75  | 0.00     | 0      |

---

## Campos de estado

Por ojo en `agudeza.R` / `agudeza.L`:

- `logmarActual`, `letraActual`, `aciertosPorLogmar` (`"0.3"`…`"0.0"`), `logmarFinal`, `letraFinal`, `letrasUsadas`

Globales: `fase`, `ojoActual`, `finalizado`.

- **R cerrado** = `agudeza.R.logmarFinal != null`
- **`fase: finalizado`** solo si **L** cerrado

---

## Inicio del test por ojo (`modo: bootstrap`)

1. Foróptero: RX + oclusión contralateral.
2. `logmarActual: 0.3`, `letraActual: H`, contadores en 0, `letrasUsadas: ["H"]`.
3. TV: H @ 0.3.
4. `evento: inicio_ojo`.

---

## Clasificaciones del intérprete

| Clasificación | Efecto |
|---------------|--------|
| **correcta** | Árbol post-correcta (abajo). |
| **incorrecta** / **no_ve** | Subir un paso logMAR (o 0.3 + rotar letra); sin contadores; `tv`. |
| **ambigua** / **confianza_baja** | `acciones: []`, `repregunta_sin_cambio`. |
| **frase_paciente_no_clinica** | Sin `fase: finalizado` si L no cerró. |

---

## Escala logMAR

**0.3, 0.2, 0.1, 0.0**

- Subida (incorrecta/no_ve): un paso; en **0.3** solo rotar letra.
- Bajada (correcta, contador = 1): un paso hacia más chico.

---

## Árbol tras **correcta** (orden estricto)

1. `aciertosPorLogmar[logmarActual] += 1` (simular primero).
2. Si **≥ 2**: `logmarFinal`, `letraFinal`; si **R** → transición R→L (mismo turno); si **L** → `fase: finalizado`; **sin** bajar ni `tv` en ese ojo.
3. Si **= 1** y `logmarActual > 0.0`: **bajar** logMAR, rotar letra Sloan, **`tv` obligatoria**, `evento: siguiente_optotipo`.
4. Si **= 1** y `logmarActual == 0.0`: rotar letra, `tv`, `siguiente_optotipo`.

**Prohibido:** `siguiente_optotipo` con `acciones: []` cuando el paso 3 o 4 exige cambio de letra/logMAR.

---

## Transición R → L (mismo turno)

1. Patch L: H@0.3, contadores 0, `letrasUsadas: ["H"]`.
2. `ojoActual: "L"`.
3. `acciones`: foróptero (L open, R close) + TV H@0.3.
4. `evento: cierre_ojo_R_e_inicio_L`.

---

## Letras Sloan

H, O, T, E, C, F, Z, L, P, D — rotación sin repetir en el mismo ojo.

---

## Eventos

| `evento` | Significado |
|----------|-------------|
| `inicio_ojo` | Primer optotipo del ojo |
| `siguiente_optotipo` | Cambió letra o logMAR en el mismo ojo |
| `repregunta_sin_cambio` | ambigua / confianza_baja |
| `cierre_ojo_R_e_inicio_L` | R cerrado + L iniciado con MQTT |
| `examen_finalizado` | L cerrado |
