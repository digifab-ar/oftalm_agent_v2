# Protocolo de agudeza visual — estado y transiciones

**Fase:** `agudeza`.  
**Agente:** protocolo.  
**Prompt de rol:** `prompts/protocolo-agudeza.md` (repite pasos críticos del árbol).

Referencias: **dispositivos.md**; auditoría en **auditoria.md**; interpretación en **interpretacion.md**.

---

## Fuente de verdad del estado

- El JSON del user es el estado **tras registro del intento** en servidor (`registrarIntentoAgudeza` en el pipeline).
- Campos clave: `ojoActual`, `agudeza.{ojo}.logmarActual`, `letraActual`, `resultadosPorLogmar`, `letrasUsadas`, `logmarFinal`.
- **Contadores:** leé `resultadosPorLogmar[logmar].correcto` / `.incorrecto` — ya incluyen este turno. **No simules +1.**
- **Prohibido** incluir `resultadosPorLogmar` ni `aciertosPorLogmar` en `estadoPatch` (el merge del servidor los preserva si no vienen en el patch).
- **Prohibido inferir** valores desde el historial conversacional o el “avance esperado”.

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

- `logmarActual`, `letraActual`, `resultadosPorLogmar` (por nivel: `correcto`, `incorrecto`), `logmarFinal`, `letrasUsadas`
- `aciertosPorLogmar` (legacy, espejo de `correcto`) — **solo lectura**; no escribir en patch
- `letraFinal` (legacy, opcional) — **no usar** en cierres nuevos; solo `logmarFinal`

Globales: `fase`, `ojoActual`, `finalizado`.

- **R cerrado** = `agudeza.R.logmarFinal != null`
- **`fase: finalizado`** solo si **L** cerrado

---

## Gramática del patch (protocolo y auditor)

Tabla compartida: el protocolo **emite** esta forma; el auditor **rechaza** si no se cumple. Referencia única para rutas JSON.

| `evento` | Campos obligatorios en `estadoPatch` | `ojoActual` en patch |
|----------|--------------------------------------|----------------------|
| `inicio_ojo` (bootstrap) | `agudeza.{ojo}` con `logmarActual: 0.3`, `letraActual: "H"`, `letrasUsadas: ["H"]` | ojo que inicia (`"R"` o `"L"`) |
| `siguiente_optotipo` | `agudeza.{ojoActivo}`: `logmarActual`, `letraActual`, `letrasUsadas` (sin contadores) | solo si cambia el ojo activo |
| `cierre_ojo_R_e_inicio_L` | `agudeza.R.logmarFinal` + `agudeza.L` bootstrap H@0.3 | **`"L"` obligatorio** |
| `examen_finalizado` | `agudeza.L.logmarFinal` + `fase: "finalizado"` | sin cambio obligatorio |
| `repregunta_sin_cambio` | `{}` | sin cambio |

**Rutas prohibidas en `estadoPatch`:** `R` o `L` en la raíz del patch; `resultadosPorLogmar`; `aciertosPorLogmar`; `letraFinal` en cierres nuevos.

**Checklist de forma (sí/no antes de emitir):**

1. ¿Cada ojo mutado está en `estadoPatch.agudeza.{R|L}`?
2. Si `evento === "cierre_ojo_R_e_inicio_L"`: ¿existen `ojoActual: "L"`, `agudeza.R.logmarFinal`, `agudeza.L` con H@0.3?
3. ¿El patch no incluye contadores?
4. Si hay `tv`: ¿`letra`/`logmar` = `agudeza.{ojo}` del patch (ojo activo tras el merge)?
5. ¿Solo claves de la lista blanca (`fase`, `ojoActual`, `finalizado`, `agudeza`)?

---

## Inicio del test por ojo (`modo: bootstrap`)

1. Foróptero: RX + oclusión contralateral.
2. `logmarActual: 0.3`, `letraActual: H`, `resultadosPorLogmar` en 0, `letrasUsadas: ["H"]`.
3. TV: H @ 0.3.
4. `evento: inicio_ojo`.

---

## Clasificaciones del intérprete

| Clasificación | Efecto |
|---------------|--------|
| **correcta** | Árbol post-correcta (abajo). El servidor ya incrementó `correcto`; el patch solo cambia estímulo / cierre. |
| **incorrecta** / **no_ve** | Subir un paso logMAR (o 0.3 + rotar letra); servidor ya incrementó `incorrecto`; patch **sin** contadores; `tv`. |
| **ambigua** / **confianza_baja** | `acciones: []`, `repregunta_sin_cambio`. |
| **frase_paciente_no_clinica** | Sin `fase: finalizado` si L no cerró. |

---

## Regla de contadores (`resultadosPorLogmar`)

**Fuente de verdad:** `agudeza.{ojo}.resultadosPorLogmar` del JSON recibido en el user (**tras registro del intento** en el orquestador).

Por nivel logMAR: `{ "correcto": n, "incorrecto": m }`. Legacy: `aciertosPorLogmar[k]` = `resultadosPorLogmar[k].correcto` (sincronizado en código).

| Clasificación | Registro (servidor, antes del protocolo) | Patch del protocolo |
|---------------|----------------------------------------|---------------------|
| **correcta** | `correcto += 1` en logMAR del estímulo | **Prohibido** incluir `resultadosPorLogmar` / `aciertosPorLogmar` |
| **incorrecta** / **no_ve** | `incorrecto += 1` en logMAR del estímulo | **Prohibido** incluir contadores |
| **ambigua** / **confianza_baja** | Sin cambio | `estadoPatch: {}` |
| **continuacion** (bootstrap) | Sin registro | Inicializar estímulo; contadores ya en 0 en memoria |

**Acumulación a lo largo del examen.** Los `resultadosPorLogmar[k].correcto` son **acumulativos** en el ojo activo. Un `no_ve`/`incorrecta` en otro logMAR **no** resetea correctos previos (el servidor solo suma `incorrecto` en el logMAR del estímulo). Ej.: `0.2 correcta → 0.1 no_ve → 0.2 correcta` → `0.2.correcto` pasa de 1 a 2 ⇒ cierre, aunque no sean consecutivas en pantalla.

**Prohibido en el patch del protocolo:**

- Incluir `resultadosPorLogmar` o `aciertosPorLogmar` (el código los elimina del merge si el LLM los manda).
- En `no_ve`/`incorrecta`, el patch solo cambia `logmarActual`, `letraActual`, `letrasUsadas`.

### Ejemplo correcto (`no_ve` en 0.1 con `0.2.correcto: 1` previo)

Estado tras registro del `no_ve`: `0.1.incorrecto` ya incrementado.

```text
patch.agudeza.R = {
  logmarActual: 0.2,
  letraActual: "E",
  letrasUsadas: ["H","O","T","E"]
  // sin resultadosPorLogmar ni aciertosPorLogmar
}
```

### Ejemplo incorrecto (regresión — patch con contadores)

```text
patch.agudeza.R.aciertosPorLogmar = {"0.3": 1, "0.2": 0, ...}  // RECHAZAR
```

---

## Escala logMAR

**0.3, 0.2, 0.1, 0.0**

- Subida (incorrecta/no_ve): un paso; en **0.3** solo rotar letra.
- Bajada (correcta, contador = 1): un paso hacia más chico.

---

## Árbol tras **correcta** (orden estricto)

1. Leé `c = resultadosPorLogmar[logmarActual].correcto` (ya incluye este turno; **no** simules +1).
2. Si **≥ 2**: `logmarFinal` = ese logMAR (**sin** `letraFinal`); si **R** → transición R→L (mismo turno); si **L** → `fase: finalizado`; **sin** bajar ni `tv` en ese ojo.
3. Si **= 1** y `logmarActual > 0.0`: **bajar** logMAR, rotar letra Sloan, **`tv` obligatoria**, `evento: siguiente_optotipo`.
4. Si **= 1** y `logmarActual == 0.0`: rotar letra, `tv`, `siguiente_optotipo`.

**Prohibido (clasificación `correcta`):**

- Emitir `estadoPatch: {}` o `acciones: []`. La clasificación `correcta` **siempre** produce cambio de estado: rama 2 (≥ 2) → patch de cierre + (R) transición a L en el mismo turno o (L) `fase: finalizado`; rama 3 (= 1, `logmarActual > 0.0`) → bajada de logMAR + nueva letra + `tv`; rama 4 (= 1, `logmarActual == 0.0`) → rotación de letra + `tv`.
- Usar `evento: repregunta_sin_cambio` ante `correcta` (ese evento es exclusivo de `ambigua`/`confianza_baja`).
- `siguiente_optotipo` con `acciones: []` cuando el paso 3 o 4 exige cambio de letra/logMAR.
- `siguiente_optotipo` o `tv` sobre el ojo R cuando `resultadosPorLogmar[logmarActual].correcto >= 2` en R (la rama cierre manda y exige `cierre_ojo_R_e_inicio_L`).

---

## Transición R → L (mismo turno)

1. Patch **`agudeza.L`**: H@0.3, `letrasUsadas: ["H"]` (sin contadores en patch).
2. Patch **`agudeza.R`**: solo `logmarFinal` (sin `letraFinal`).
3. **`ojoActual: "L"`** en `estadoPatch` (mismo nivel que `agudeza`).
4. `acciones`: foróptero (L open, R close) + TV H@0.3.
5. `evento: cierre_ojo_R_e_inicio_L`.

### REGRESIÓN 2026-05-19 — `L` mal anidado (RECHAZAR)

Propuesta inválida del log (turno 5): MQTT correcto, **memoria incorrecta**. El auditor debe rechazar aunque foróptero + TV estén bien.

```json
{
  "estadoPatch": {
    "agudeza": { "R": { "logmarFinal": 0.2 } },
    "L": { "logmarActual": 0.3, "letraActual": "H", "letrasUsadas": ["H"] }
  },
  "evento": "cierre_ojo_R_e_inicio_L",
  "acciones": [ "... foroptero + tv H@0.3 ..." ]
}
```

Defectos: `L` en raíz del patch (debe ser `agudeza.L`); falta `ojoActual: "L"`. Tras merge, `ojoActual` sigue `"R"` → intérprete y registro operan sobre R.

**Corrección:** usar el *Ejemplo literal* de abajo (misma estructura que la plantilla en `protocolo-agudeza.md`).

**Atomicidad.** La transición R → L se emite como **una operación atómica** dentro del mismo turno: patch (R cierre con **`logmarFinal` solo** — sin `letraFinal` — + L inicializado a H@0.3 con `letrasUsadas:["H"]` **sin contadores en patch** + `ojoActual:"L"`) **+** `evento: "cierre_ojo_R_e_inicio_L"` **+** `acciones` (foróptero R close / L open + RX_L de `estadoAntes.rx.L`, luego TV H@0.3). Los contadores (`resultadosPorLogmar`) los escribe el servidor al registrar el intento; el protocolo **no** los incluye en el patch. Está **prohibido** emitir solo el patch sin evento/acciones, o cambiar `ojoActual` sin `logmarFinal` en R. Faltar cualquiera de los tres bloques invalida la propuesta.

### Ejemplo literal (rama 2 en ojo R, post `no_ve` intercalado — regresión log 2026-05-19)

Estado que recibe el **protocolo** (tras registro del intento en servidor; el servidor ya incrementó `0.2.correcto` a 2):

```json
{
  "ojoActual": "R",
  "rx": { "L": { "esfera": 2.75, "cilindro": 0, "angulo": 0 } },
  "agudeza": {
    "R": {
      "logmarActual": 0.2,
      "letraActual": "E",
      "resultadosPorLogmar": {
        "0.3": { "correcto": 1, "incorrecto": 0 },
        "0.2": { "correcto": 2, "incorrecto": 0 },
        "0.1": { "correcto": 0, "incorrecto": 0 },
        "0.0": { "correcto": 0, "incorrecto": 0 }
      },
      "letrasUsadas": ["H", "O", "T", "E"]
    },
    "L": {
      "logmarActual": null,
      "letraActual": null,
      "resultadosPorLogmar": {
        "0.3": { "correcto": 0, "incorrecto": 0 },
        "0.2": { "correcto": 0, "incorrecto": 0 },
        "0.1": { "correcto": 0, "incorrecto": 0 },
        "0.0": { "correcto": 0, "incorrecto": 0 }
      },
      "letrasUsadas": []
    }
  }
}
```

`interpretacion.clasificacion === "correcta"`, `letraElegida === "E"`.

Propuesta esperada del protocolo (**sin** `resultadosPorLogmar`, `aciertosPorLogmar` ni `letraFinal` en el patch):

```json
{
  "estadoPatch": {
    "ojoActual": "L",
    "agudeza": {
      "R": {
        "logmarFinal": 0.2
      },
      "L": {
        "logmarActual": 0.3,
        "letraActual": "H",
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
  "razonamientoProtocolo": "resultadosPorLogmar[0.2].correcto = 2 (ya registrado) ⇒ cierre R. Patch: logmarFinal 0.2 en R; L H@0.3; foróptero + TV."
}
```

En memoria, tras `aplicarEstadoPatch`, `resultadosPorLogmar` de R **permanece** con `0.2.correcto: 2` (el merge no los toca porque no vienen en el patch).

### Ejemplo de propuesta inválida (regresión log 2026-05-19 turno 5, segunda corrida)

Esta propuesta **debe ser rechazada** por el auditor con anti-patrón "patch parcial en rama 2":

```json
{
  "estadoPatch": {
    "ojoActual": "L",
    "agudeza": {
      "R": { "logmarFinal": 0.2 }
    }
  },
  "acciones": [],
  "evento": "siguiente_optotipo",
  "detalleEvento": {},
  "razonamientoProtocolo": "Correcta en 0.2; cambio ojo a L."
}
```

Motivos de rechazo (deben aparecer **todos** en `violaciones`, ninguno hipotético de otras ramas):

- Falta `agudeza.R.logmarFinal` en el patch.
- Falta el bloque `agudeza.L` inicializado a `logmarActual:0.3`, `letraActual:"H"`, `letrasUsadas:["H"]` (sin contadores en patch).
- `evento` debería ser `"cierre_ojo_R_e_inicio_L"`, no `"siguiente_optotipo"`.
- `acciones: []` viola la atomicidad: deben incluirse foróptero (R close, L open + RX_L) y TV H@0.3.

**Corrección**: reemplazar por el "Ejemplo literal" de arriba.

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
