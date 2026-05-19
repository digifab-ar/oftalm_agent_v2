# Protocolo de agudeza visual — estado y transiciones

**Fase:** `agudeza`.  
**Agente:** protocolo.  
**Prompt de rol:** `prompts/protocolo-agudeza.md` (repite pasos críticos del árbol).

Referencias: **dispositivos.md**; auditoría en **auditoria.md**; interpretación en **interpretacion.md**.

---

## Fuente de verdad del estado

- El **único** estado válido para decidir transiciones es el JSON `estadoActual` recibido en el user (campos: `ojoActual`, `agudeza.{ojo}.logmarActual`, `letraActual`, `aciertosPorLogmar`, `letrasUsadas`, `logmarFinal`).
- **Prohibido inferir** `logmarActual` o contadores a partir del historial conversacional, del razonamiento previo, o del “avance esperado”. Si el JSON dice `logmarActual: 0.2`, el protocolo está en 0.2 aunque el último razonamiento hable de 0.1.
- Si el JSON parece inconsistente (p. ej. contadores que no encajan con `logmarActual`), respetá el JSON tal cual; no lo “corrijas” silenciosamente.

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
| **correcta** | Árbol post-correcta (abajo). Único caso donde el patch puede modificar `aciertosPorLogmar`. |
| **incorrecta** / **no_ve** | Subir un paso logMAR (o 0.3 + rotar letra); **no incluir** `aciertosPorLogmar` en el patch (ver “Regla de contadores”); `tv`. |
| **ambigua** / **confianza_baja** | `acciones: []`, `repregunta_sin_cambio`. |
| **frase_paciente_no_clinica** | Sin `fase: finalizado` si L no cerró. |

---

## Regla de contadores (`aciertosPorLogmar`)

**Fuente de verdad:** `agudeza.{ojo}.aciertosPorLogmar` del JSON `estadoActual` recibido en el user.

| Clasificación | Cómo tratar `aciertosPorLogmar` en el patch |
|---------------|--------------------------------------------|
| **correcta** | Incrementar **solo** el contador del `logmarActual` simulado (`aciertosPorLogmar[logmarActual] += 1`). El resto de las claves se mantiene exactamente como en `estadoAntes`. |
| **incorrecta** / **no_ve** | **Omitir** la clave `aciertosPorLogmar` del patch. Si por estructura del schema debés incluirla, copiala **idéntica** a `estadoAntes`. |
| **ambigua** / **confianza_baja** | `estadoPatch: {}`. No tocar contadores. |
| **continuacion** (bootstrap) | Inicializar todos los contadores del ojo activo en `0` (caso de Inicio del test). |

**Prohibido (anti-patrón “reset de contadores ganados”):**

- Emitir `aciertosPorLogmar` con valores **menores** a los de `estadoAntes` para ese ojo (ej. estado `0.2: 1` → patch `0.2: 0`).
- Re-emitir el bloque completo con ceros “por seguridad” en `no_ve` / `incorrecta`. Eso degrada el avance clínico ganado y será rechazado por el auditor.

### Ejemplo correcto (`no_ve` en 0.1 con 0.2:1 previo)

```text
estadoAntes.agudeza.R.aciertosPorLogmar = {"0.3": 1, "0.2": 1, "0.1": 0, "0.0": 0}
patch.agudeza.R = {
  logmarActual: 0.2,
  letraActual: "E",
  letrasUsadas: ["H","O","T","E"]
  // aciertosPorLogmar OMITIDO (preferido) o idéntico a estadoAntes
}
```

### Ejemplo incorrecto (regresión log 2026-05-19, turno 4)

```text
estadoAntes.agudeza.R.aciertosPorLogmar = {"0.3": 1, "0.2": 1, "0.1": 0, "0.0": 0}
patch.agudeza.R.aciertosPorLogmar = {"0.3": 1, "0.2": 0, "0.1": 0, "0.0": 0}
                                                   ^^^^^^ DEGRADA 0.2 de 1 a 0
```

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
