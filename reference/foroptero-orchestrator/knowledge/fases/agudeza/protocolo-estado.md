# Protocolo de agudeza visual — referencia del sistema

**Fase:** `agudeza`. **Tipo:** documento de referencia (no instrucciones operativas).

Las instrucciones operativas del agente protocolo viven en `prompts/protocolo-agudeza.md` (tabla de decisión + plantillas A–F). Este archivo describe **qué es el estado**, **qué reglas existen** y **qué regresiones están documentadas**.

**Audiencias:** agente protocolo (contexto), agente auditor (validación vía `auditoria.md`), humanos (mantenimiento, QA).

**Referencias cruzadas:** `dispositivos.md`, `interpretacion.md`, `auditoria.md`, `../core/auditoria-estructural.md`, `agents/schemas.js`, `fixtures/auditor/`.

---

## Alcance clínico

- Test de **agudeza** monocular: **R** → **L**, sin lentes, sin binocular.
- Escala logMAR: **0.3, 0.2, 0.1, 0.0** (un paso por vez).
- RX fija (POC):

| Ojo | Esfera | Cilindro | Ángulo |
|-----|--------|----------|--------|
| R   | +0.75  | -1.75    | 60     |
| L   | +2.75  | 0.00     | 0      |

---

## Modelo de estado

| Capa | Campos | Quién lee | Quién escribe |
|------|--------|-----------|---------------|
| Globales | `fase`, `ojoActual`, `finalizado`, `rx`, `iniciado`, `historial`, `intentosRegistrados` | todos | servidor |
| `agudeza.{ojo}` operativos | `logmarActual`, `letraActual`, `letrasUsadas`, `logmarFinal` | todos | protocolo (vía patch) |
| `agudeza.{ojo}` contadores | `resultadosPorLogmar`, `aciertosPorLogmar` | todos | **solo servidor** |
| Legacy / no usar | `letraFinal`, `confirmaciones`, `ultimoLogmarCorrecto` | nadie | nadie |

**Derivados:**

- **R cerrado**: `agudeza.R.logmarFinal != null`.
- **L cerrado**: `agudeza.L.logmarFinal != null`.
- **`fase: "finalizado"`**: solo si **L** cerrado.
- **`aciertosPorLogmar[k]`** = espejo legacy de `resultadosPorLogmar[k].correcto` (sincronizado por el servidor).

---

## Responsabilidades por componente

| Acción | Componente | Detalle |
|--------|------------|---------|
| Incrementar `resultadosPorLogmar` | Servidor (`registrarIntentoAgudeza`) | Antes de invocar al protocolo, según `clasificacion` del intérprete |
| Sanear patch | Servidor (`sanitizarPatchProtocolo`) | Elimina `resultadosPorLogmar` / `aciertosPorLogmar` antes del merge, aunque el LLM los emita |
| Emitir `estadoPatch` + `acciones` + `evento` | Protocolo (LLM) | Sin contadores; según *Decisión clínica* y *Gramática del patch* |
| Validar forma + clínica | Auditor (LLM) | Capa 0 (forma), capa 1 (estructural), capa 2 (clínica de fase) |
| Aplicar patch | Servidor (`aplicarEstadoPatch`) | `deepMerge` sobre el estado en memoria |
| Ejecutar MQTT | Servidor (`ejecutarAcciones`) | Foróptero / TV, en el orden de la lista de acciones |

**Implicación clave:** el protocolo nunca escribe contadores. Si los emite, el servidor los descarta y el auditor debe rechazar la propuesta.

---

## Gramática del patch (canónica)

Fuente única de rutas y forma del `estadoPatch`. El protocolo emite con esta forma; el auditor rechaza si no se cumple.

### Lista blanca de claves en `estadoPatch`

Solo: `fase`, `ojoActual`, `finalizado`, `agudeza`. Cualquier otra clave en la raíz del patch es inválida.

### Rutas prohibidas

- `estadoPatch.R` o `estadoPatch.L` en la raíz (los ojos van bajo `agudeza`).
- `resultadosPorLogmar` o `aciertosPorLogmar` en cualquier nivel.
- `letraFinal` en cierres nuevos (campo legacy).

### Forma por evento

| `evento` | Campos obligatorios en `estadoPatch` | `ojoActual` en patch |
|----------|--------------------------------------|----------------------|
| `inicio_ojo` (bootstrap) | `agudeza.{ojo}` con `logmarActual: 0.3`, `letraActual: "H"`, `letrasUsadas: ["H"]` | ojo que inicia (`"R"` o `"L"`) |
| `siguiente_optotipo` | `agudeza.{ojoActivo}`: `logmarActual`, `letraActual`, `letrasUsadas` (sin contadores) | solo si cambia el ojo activo |
| `cierre_ojo_R_e_inicio_L` | `agudeza.R.logmarFinal` + `agudeza.L` bootstrap H@0.3 | **`"L"` obligatorio** |
| `examen_finalizado` | `agudeza.L.logmarFinal` + `fase: "finalizado"` | sin cambio obligatorio |
| `repregunta_sin_cambio` | `{}` | sin cambio |

### Checklist de forma (sí/no antes de aplicar)

1. ¿Cada ojo mutado está bajo `estadoPatch.agudeza.{R|L}`?
2. Si `evento === "cierre_ojo_R_e_inicio_L"`: ¿existen `ojoActual: "L"`, `agudeza.R.logmarFinal`, `agudeza.L` H@0.3?
3. ¿El patch no incluye `resultadosPorLogmar` ni `aciertosPorLogmar`?
4. Si hay acción `tv`: ¿`letra`/`logmar` = `agudeza.{ojo}` del patch (ojo activo tras merge)?
5. ¿Solo claves de la lista blanca?

### Coherencia `tv` ↔ patch

| Campo patch | Campo `tv` |
|-------------|-----------|
| `agudeza.{ojo}.logmarActual` | `logmar` |
| `agudeza.{ojo}.letraActual` | `letra` |

En `cierre_ojo_R_e_inicio_L`, la `tv` lleva la letra y logMAR de **L** (H@0.3), no de R.

---

## Decisión clínica

Tabla canónica: cómo se elige la rama del protocolo según `clasificacion` del intérprete y el estado **tras registro del intento**. La versión operativa para el agente vive en `prompts/protocolo-agudeza.md` (Tabla de decisión + plantillas A–F).

### Variables

- `c = resultadosPorLogmar[logmarActual].correcto` del ojo activo (ya incrementado por el servidor).
- `logmarActual`, `ojoActual` del JSON literal.

### Tabla de ramas

| `clasificacion` | Condición sobre estado (tras registro) | Rama | `evento` |
|-----------------|----------------------------------------|------|----------|
| `continuacion` (bootstrap) | `agudeza[ojoActual].logmarActual == null` | BOOTSTRAP | `inicio_ojo` |
| `correcta` | `c == 1` y `logmarActual > 0.0` | BAJAR | `siguiente_optotipo` |
| `correcta` | `c == 1` y `logmarActual == 0.0` | ROTAR_0 | `siguiente_optotipo` |
| `correcta` | `c >= 2` y `ojoActual == "R"` | CIERRE_R_L | `cierre_ojo_R_e_inicio_L` |
| `correcta` | `c >= 2` y `ojoActual == "L"` | CIERRE_FINAL | `examen_finalizado` |
| `incorrecta` / `no_ve` | `logmarActual ∈ {0.2, 0.1, 0.0}` | SUBIR | `siguiente_optotipo` |
| `incorrecta` / `no_ve` | `logmarActual == 0.3` | ROTAR_TOPE | `siguiente_optotipo` |
| `ambigua` / `confianza_baja` | — | REPREGUNTA | `repregunta_sin_cambio` |
| `frase_paciente_no_clinica` | L no cerrado | REPREGUNTA | `repregunta_sin_cambio` |

### Regla dura

**`c < 2` ⇒ nunca CIERRE_R_L ni CIERRE_FINAL.** El cierre por ojo requiere dos aciertos acumulados en el mismo logMAR del ojo activo (ver BUG-003).

### Acumulación de contadores

`resultadosPorLogmar[k].correcto` es **acumulativo** en el ojo activo. Un `no_ve` / `incorrecta` en otro logMAR no resetea aciertos previos. Ejemplo:

- T1 `correcta` en 0.2 → `0.2.correcto: 1`.
- T2 `no_ve` en 0.1 → `0.1.incorrecto: 1` (los aciertos de 0.2 no se tocan).
- T3 `correcta` en 0.2 → `0.2.correcto: 2` ⇒ cierre del ojo (las dos correctas no eran consecutivas en pantalla).

### Bootstrap

Bootstrap aplica cuando el pipeline detecta `agudeza[ojoActual].letraActual == null && logmarActual == null && logmarFinal == null` (ver `detectarModoTurno` en `pipelineTurno.js`). El user prompt incluye `modo: bootstrap`. En ese turno no hay registro de intento ni respuesta del paciente; los contadores ya están en 0 en memoria y no van en el patch.

---

## Eventos del protocolo

Enum completo del schema (`agents/schemas.js`): `inicio_ojo`, `siguiente_optotipo`, `repregunta_sin_cambio`, `cierre_ojo_R_e_inicio_L`, `examen_finalizado`, `cierre_ojo_R`, `cierre_ojo_L`, `continuacion_dispositivos`, `esperar_primera_respuesta`, `error_bootstrap`.

### Eventos clínicos activos

| `evento` | Cuándo se emite | Patch típico | Acciones | Restricciones |
|----------|-----------------|--------------|----------|---------------|
| `inicio_ojo` | Bootstrap por ojo | `ojoActual` + `agudeza.{ojo}` H@0.3, `letrasUsadas:["H"]` | foróptero (RX ojo activo + oclusión contralateral) + tv H@0.3 | Sin registro de intento |
| `siguiente_optotipo` | Bajar / subir / rotar en el mismo ojo | `agudeza.{ojoActivo}` con `logmarActual`, `letraActual`, `letrasUsadas` | tv (alineada al patch) | Sin cambio de `ojoActual` |
| `repregunta_sin_cambio` | `ambigua` / `confianza_baja` / `frase_paciente_no_clinica` | `{}` | `[]` | Sin registro |
| `cierre_ojo_R_e_inicio_L` | `c >= 2` con `correcta` en R | `ojoActual:"L"` + `agudeza.R.logmarFinal` + `agudeza.L` H@0.3 + `letrasUsadas:["H"]` | foróptero (R close, L open + RX_L) + tv H@0.3 | **Atómico**: las tres partes obligatorias en el mismo JSON |
| `examen_finalizado` | `c >= 2` con `correcta` en L | `agudeza.L.logmarFinal` + `fase:"finalizado"` + `finalizado: <ts>` | — | Sin `tv` |

### Eventos sin uso clínico actual

- `cierre_ojo_R`, `cierre_ojo_L`: superados por `cierre_ojo_R_e_inicio_L` y `examen_finalizado`. **No emitir.**
- `continuacion_dispositivos`, `esperar_primera_respuesta`: reservados; sin uso documentado.
- `error_bootstrap`: fallback del pipeline ante error de arranque (`fallbackBootstrap` en `pipelineTurno.js`).

---

## Convenciones de letras Sloan

Vocabulario válido: **H, O, T, E, C, F, Z, L, P, D**.

- Rotación sin repetir en el mismo ojo (`letrasUsadas` crece por ojo).
- Pool lleno (las 10 usadas) + examen en curso: repetir con criterio clínico, priorizando baja confusión fonética con la letra previa.
- Cierre R→L y bootstrap inicializan `letrasUsadas: ["H"]` para el ojo nuevo.
- Pares de riesgo fonético (H↔C, E↔C, T↔P, F↔S): definidos en `interpretacion.md`.

---

## Catálogo de regresiones

Bugs históricos con estado, propuesta inválida y corrección. Citar el ID en `violaciones` del auditor para trazabilidad.

### BUG-001 — `L` mal anidado en cierre R→L (2026-05-19, turno 5)

- **Componente:** protocolo.
- **Estado de entrada:** R con `0.2.correcto: 2`, `ojoActual: "R"`, post-`no_ve` intercalado en 0.1.
- **Propuesta inválida:** `L` como hermano de `agudeza` (en la raíz de `estadoPatch`), **sin** `ojoActual: "L"`; MQTT correctos.
- **Efecto:** tras `deepMerge`, `ojoActual` siguió en `"R"`; el intérprete y el registro operaron sobre R mientras la TV mostraba L H@0.3 → cascada de turnos erróneos T6–T9.
- **Regla violada:** *Gramática del patch* (rutas prohibidas) + *Eventos* (atomicidad de `cierre_ojo_R_e_inicio_L`).
- **Mitigación:** auditor capa 0 (validación de rutas JSON en `core/auditoria-estructural.md`).
- **Propuesta correcta:** Plantilla D en `prompts/protocolo-agudeza.md`.
- **Fixtures:** `fixtures/auditor/AUD-04-correcta-cierre-R.json` (positivo); pendiente `AUD-08` (negativo).

### BUG-002 — Auditor aprobó BUG-001 (2026-05-19, turno 5)

- **Componente:** auditor.
- **Síntoma:** validó la intención clínica (cierre R→L con acciones correctas) sin chequear rutas JSON del patch.
- **Regla agregada:** capa 0 de forma en `core/auditoria-estructural.md` § *Validación de rutas JSON*; orden obligatorio forma → estructural → fase.
- **Mitigación:** auditor con paso 0 explícito antes del checklist clínico.

### BUG-003 — Cierre prematuro con `c = 1` (2026-05-20, turno 2)

- **Componente:** protocolo.
- **Estado de entrada:** R con `0.3.correcto: 1`, `logmarActual: 0.3`, primer acierto del examen.
- **Propuesta inválida:** `cierre_ojo_R_e_inicio_L` con `logmarFinal: 0.3` (interpretó c=1 como c≥2).
- **Efecto:** auditor rechazó; fallback dejó el estado congelado en H@0.3 sin avance, intento ya consumido.
- **Regla violada:** *Decisión clínica*, regla dura `c < 2` ⇒ nunca cerrar.
- **Mitigación:** *Tabla de decisión* explícita en prompt + regla dura citada debajo + cita del bug en plantilla B.
- **Propuesta correcta:** Plantilla B (BAJAR) — `agudeza.R.logmarActual: 0.2`, letra Sloan no usada, `tv` @0.2, `evento: "siguiente_optotipo"`.
- **Fixtures:** pendiente `AUD-11` (rechazo de cierre con `c = 1`).

---

## Referencias

- `prompts/protocolo-agudeza.md` — instrucciones operativas (Tabla de decisión + plantillas A–F del agente protocolo).
- `knowledge/fases/agudeza/auditoria.md` — checklist clínico del auditor.
- `knowledge/fases/agudeza/interpretacion.md` — vocabulario Sloan y tabla fonética.
- `knowledge/core/auditoria-estructural.md` — reglas estructurales transversales y validación de rutas JSON.
- `agents/schemas.js` — schema JSON del agente protocolo.
- `fixtures/auditor/` — casos de QA manual del auditor.
