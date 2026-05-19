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

**Acumulación a lo largo del examen.** Los contadores `aciertosPorLogmar[k]` son **acumulativos** durante toda la corrida del ojo activo. Un `no_ve` o `incorrecta` que sube a un logMAR distinto **no** descuenta ni resetea aciertos previos. Por ejemplo, si la trayectoria es `0.2 correcta → 0.1 no_ve → vuelta a 0.2 correcta`, el contador `aciertosPorLogmar[0.2]` pasa de `1` a `2` y dispara el cierre por la regla "≥ 2" (ver Árbol tras correcta, paso 2), aunque las dos correctas no hayan sido consecutivas.

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

1. `aciertosPorLogmar[logmarActual] += 1` (simular primero, sobre el valor literal de `estadoAntes`).
2. Si **≥ 2**: `logmarFinal`, `letraFinal`; si **R** → transición R→L (mismo turno); si **L** → `fase: finalizado`; **sin** bajar ni `tv` en ese ojo.
3. Si **= 1** y `logmarActual > 0.0`: **bajar** logMAR, rotar letra Sloan, **`tv` obligatoria**, `evento: siguiente_optotipo`.
4. Si **= 1** y `logmarActual == 0.0`: rotar letra, `tv`, `siguiente_optotipo`.

**Prohibido (clasificación `correcta`):**

- Emitir `estadoPatch: {}` o `acciones: []`. La clasificación `correcta` **siempre** produce cambio de estado: rama 2 (≥ 2) → patch de cierre + (R) transición a L en el mismo turno o (L) `fase: finalizado`; rama 3 (= 1, `logmarActual > 0.0`) → bajada de logMAR + nueva letra + `tv`; rama 4 (= 1, `logmarActual == 0.0`) → rotación de letra + `tv`.
- Usar `evento: repregunta_sin_cambio` ante `correcta` (ese evento es exclusivo de `ambigua`/`confianza_baja`).
- `siguiente_optotipo` con `acciones: []` cuando el paso 3 o 4 exige cambio de letra/logMAR.
- `siguiente_optotipo` o `tv` sobre el ojo R cuando la simulación arroja ≥ 2 en R (la rama 2 manda y exige `cierre_ojo_R_e_inicio_L`).

---

## Transición R → L (mismo turno)

1. Patch L: H@0.3, contadores 0, `letrasUsadas: ["H"]`.
2. `ojoActual: "L"`.
3. `acciones`: foróptero (L open, R close) + TV H@0.3.
4. `evento: cierre_ojo_R_e_inicio_L`.

### Ejemplo literal (rama 2 en ojo R, post `no_ve` intercalado — regresión log 2026-05-19)

`estadoAntes` (extracto):

```json
{
  "ojoActual": "R",
  "rx": { "L": { "esfera": 2.75, "cilindro": 0, "angulo": 0 } },
  "agudeza": {
    "R": {
      "logmarActual": 0.2, "letraActual": "E",
      "aciertosPorLogmar": {"0.3": 1, "0.2": 1, "0.1": 0, "0.0": 0},
      "letrasUsadas": ["H", "O", "T", "E"]
    },
    "L": {
      "logmarActual": null, "letraActual": null,
      "aciertosPorLogmar": {"0.3": 0, "0.2": 0, "0.1": 0, "0.0": 0},
      "letrasUsadas": []
    }
  }
}
```

`interpretacion.clasificacion === "correcta"`, `letraElegida === "E"`.

Propuesta esperada del protocolo:

```json
{
  "estadoPatch": {
    "ojoActual": "L",
    "agudeza": {
      "R": {
        "logmarFinal": 0.2,
        "letraFinal": "E",
        "aciertosPorLogmar": {"0.3": 1, "0.2": 2, "0.1": 0, "0.0": 0}
      },
      "L": {
        "logmarActual": 0.3,
        "letraActual": "H",
        "aciertosPorLogmar": {"0.3": 0, "0.2": 0, "0.1": 0, "0.0": 0},
        "letrasUsadas": ["H"]
      }
    }
  },
  "acciones": [
    {
      "dispositivo": "foroptero",
      "config": {
        "R": { "occlusion": "close" },
        "L": { "occlusion": "open", "esfera": 2.75, "cilindro": 0, "angulo": 0 }
      }
    },
    { "dispositivo": "tv", "letra": "H", "logmar": 0.3 }
  ],
  "evento": "cierre_ojo_R_e_inicio_L",
  "detalleEvento": {},
  "razonamientoProtocolo": "Simulación 0.2:1+1=2 ⇒ rama 2 (cierre R). Patch R con logmarFinal/letraFinal y contadores ≥ 2; patch L inicializado a H@0.3; MQTT foróptero (R close, L open + RX_L) + TV H@0.3."
}
```

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
