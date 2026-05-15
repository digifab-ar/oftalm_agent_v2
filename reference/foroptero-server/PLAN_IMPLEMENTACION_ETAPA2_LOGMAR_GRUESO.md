# Plan de implementación — Etapa 2: “¿Ves bien?” + ajuste de logMAR antes del esférico grueso

**Tipo de entrega:** planificación lista para implementar — **sin cambios de código** en este documento.

**Relación con Etapa 1:** `PLAN_ETAPA1_LOGMAR_DEFAULT_03.md` — baseline **logMAR 0,3** y letra **H** como convención operativa antes de lentes.

---

## 1. Objetivo

Antes de entrar en la **comparación** del **esférico grueso** (“¿Ves mejor con este o con el anterior?”), el sistema debe:

1. Tras posicionar el foróptero (y **TV con H** al logMAR en curso, ver §6), hacer una **pregunta de calidad visual** (“¿ves bien?” / ajuste iterativo).
2. Si el paciente **ve bien** → **confirmar en un solo paso** ese logMAR como **logMAR de trabajo** para todo el bloque `esferico_grueso` de ese ojo y continuar con la lógica de comparación ya existente.
3. Si responde **borroso**, **no veo** o pide **más ajuste** → **subir** logMAR (paso discreto con `subirLogMAR`), mostrar de nuevo **H** a ese logMAR y repreguntar con el texto de seguimiento acordado hasta “ve bien” o hasta **saturación de la escala** del motor (ver §5).

**Payload del agente:** reutilizar **`interpretacionAgudeza`** (decisión de producto §3.5).

---

## 2. Alcance y fuera de alcance

| En alcance | Fuera de alcance |
|------------|------------------|
| Momentos **inicio ojo derecho** (ETAPA_3, primer test `esferico_grueso` R) e **inicio ojo izquierdo** (tras agudeza del otro ojo, ETAPA_5), con los textos del §3.4 | `esferico_fino`, cilíndrico, cilíndrico ángulo |
| Repregunta iterativa con subida de logMAR | Tope de logMAR **clínico** arbitrario (§5: no hay; sí hay límite técnico de la lista) |
| Motor + `contexto` + `chatSupervisor` | Reanudación de examen; renombrar `agudezaInicial` |
| Modos **`normal`** y **`testesf`** donde el primer test sea grueso R | Cambiar saltos dióptricos del grueso |

---

## 3. Decisiones de producto **cerradas** (respuestas acordadas)

### 3.1 Flujo y confirmaciones

- En el momento del mensaje inicial por ojo (§3.4), el paciente debe poder decir si **ve bien** o no.
- **Si ve bien** → se continúa al **esférico grueso** (comparación de lentes) con el **logMAR actual** en pantalla.
- **Si borroso o no veo** (o equivalente) → **subir** logMAR, mostrar **H** a ese valor y preguntar: **«¿Ahora ves bien o necesitás un ajuste más?»**
  - **Si ve bien** → se **toma ese valor de logMAR** (una confirmación alcanza para fijar trabajo).
  - **Si necesita un ajuste más** → **subir** logMAR otra vez y repetir la misma pregunta de §3.4.3.
- **Una sola confirmación de “ve bien”** es suficiente para fijar el logMAR de trabajo (no hace falta doble confirmación en el mismo logMAR).

### 3.2 Tope de logMAR

- **No hay tope de logMAR fijado por producto** (el paciente puede seguir pidiendo “más ajuste” en principio sin límite clínico explícito).
- **Implicación técnica obligatoria:** la función `subirLogMAR` del motor usa una **lista finita**. Cuando el valor ya sea el **máximo de la lista** y aún se interprete como “necesitás más ajuste”, el motor debe definir un comportamiento **determinístico** (ver §5.2) — no es un “tope de producto”, es un **límite de implementación**.

### 3.3 Optotipo

- **Siempre letra H** en TV durante esta subfase.

### 3.4 Mensajes `hablar` (texto literal a implementar)

1. **Inicio ojo derecho:**  
   «Vamos a empezar con el ojo derecho, esperemos a que se termine de mover los lentes y luego decime si ves bien.»

2. **Inicio ojo izquierdo** (tras adaptación de ojo / antes del grueso L):  
   «Ahora vamos con el ojo izquierdo. Esperemos a que se terminen de ajustar los lentes y decime si ves bien.»

3. **Repregunta tras subir logMAR:**  
   «¿Ahora ves bien o necesitás un ajuste más?»

*(Simetría: si en el futuro hubiera mensaje equivalente para ojo derecho en medio de iteración, usar la misma línea 3.)*

### 3.5 Uso de `interpretacionAgudeza`

- **Reutilizar** `interpretacionAgudeza` en estos turnos (también cuando `contexto.etapa` sea **ETAPA_3** en el arranque OD, si el motor sigue reportando ETAPA_3 durante la subfase).
- **Mapeo semántico sugerido** (cerrar en implementación si hace falta matiz):

| Lo que expresa el paciente | `resultado` | `letraIdentificada` |
|----------------------------|-------------|---------------------|
| Ve bien / sí / se ve claro | `correcta` | `H` o `null` (según convenga al validador) |
| Borroso | `borroso` | `null` |
| No veo / no distingo | `no_ve` | `null` |
| Necesitá más ajuste / peor / más grande | Tratar como pedido de subir: **`no_ve`** o **`borroso`** (elegir uno y documentarlo en código) o `no_se` si el modelo duda — **regla única** en motor: “no ve bien” → subir logMAR |
| Letra incorrecta forzada | `incorrecta` | (opcional; raro en “¿ves bien?”) |

- **No** usar `interpretacionComparacion` hasta que el backend emita la pregunta comparativa del grueso.

---

## 4. Contradicciones con lo ya implementado y resolución

### 4.1 “Listo” vs “¿ves bien?”

- **Situación:** En código actual existen fases que esperan **solo** `respuestaPaciente` tipo “listo” (`LISTO_OD_PENDIENTE`, `esperaListoCambioOjo`) **sin** `interpretacionAgudeza`, alineadas con el prompt del agente.
- **Nueva regla:** El guion pasa a **pregunta de calidad visual** y a **`interpretacionAgudeza`**.
- **Resolución para implementar:** **Sustituir** esas fases “listo” por la subfase **“ajuste_logmar_pre_grueso”** (nombre interno sugerido) con los mensajes del §3.4.1–3.4.3 y TV **H** al logMAR actual. El agente debe enviar **`interpretacionAgudeza`** cuando el `contexto` indique esta subfase (actualizar tabla del `chatSupervisor` y retirar reglas que mandan “solo respuestaPaciente” para esos momentos).
- **Sin contradicción:** ETAPA_6 binocular sigue usando **“listo”** y solo `respuestaPaciente` donde ya está definido — **no** tocar ese flujo salvo revisión de copy global.

### 4.2 “No hay tope” vs lista finita de logMAR

- **Contradicción aparente:** Sin tope de producto, igual existe un **último** logMAR en `subirLogMAR`.
- **Resolución:** Comportamiento al saturar: **fijar** ese logMAR como trabajo, **emitir** un `hablar` breve (texto a redactar en implementación, p. ej. continuamos con esta fila) y **entrar** al esférico grueso; **log** para soporte. Opcionalmente registrar flag en `detalle` si existe.

### 4.3 ETAPA_3 sin TV en el arranque OD

- **Situación:** Hoy el primer bloque OD puede ser foróptero + espera + **sin** comando TV antes del `hablar`.
- **Contradicción:** Preguntar “¿ves bien?” sin optotipo en pantalla es clínicamente incoherente.
- **Resolución:** En la **misma** tanda de pasos que precede al primer “¿ves bien?” (OD y OI), incluir **TV `H` @ logMAR actual** (inicial 0,3; luego el valor tras cada `subirLogMAR`), más `esperar_foroptero` si aplica el mismo patrón que en ETAPA_5.

### 4.4 Mensaje OI respecto a documentación previa

- Si existía la variante con “avisame cuando estés listo”, **queda obsoleta** frente al texto del §3.4.2 — al implementar, alinear **DEFINICIONES** / **README** / **DOCUMENTACION**.

---

## 5. Máquina de estados (borrador para codificar)

**Estado sugerido** (nombre interno): `preGruesoVisual` colgado de `comparacionActual` o objeto hermano, con:

| Campo | Uso |
|-------|-----|
| `activa` | `true` solo durante `esferico_grueso` antes de `faseComparacion === 'iniciando'` |
| `logmarEnPantalla` | Valor actual mostrado en TV |
| `faseDialogo` | `inicial_od` \| `inicial_oi` \| `repregunta_ajuste` |
| `confirmado` | `true` tras primer `interpretacionAgudeza` con “ve bien” |

**Transiciones (resumen):**

1. Entrar en `esferico_grueso` (tras prerrequisitos de foróptero por ojo) → `activa=true`, `logmarEnPantalla=0.3`, `faseDialogo` según OD u OI → pasos: foroptero, espera, **TV H**, `hablar` (§3.4.1 o §3.4.2).
2. Respuesta + `interpretacionAgudeza`:
   - **correcta** (“ve bien”) → fijar `comparacionActual.logmarActual` (o campo equivalente), `activa=false`, arrancar `iniciarComparacionLentes` / flujo actual de comparación.
   - **borroso** / **no_ve** / criterio “más ajuste” → `subirLogMAR(logmarEnPantalla)`; si **cambió** el número → actualizar TV, `faseDialogo=repregunta_ajuste`, `hablar` §3.4.3.
   - Si **no cambió** (saturación) → §4.2.
3. En **repregunta**, mismo procesamiento que el paso 2.

---

## 6. Fases de implementación (actualizadas)

### Fase 0

- Usar este documento como fuente única de verdad para copy y flujo.
- Actualizar documentación que aún cite solo “listo” en OD/OI (§4.1, §4.4).

### Fase 1 — Motor (`motorExamen.js`)

- Implementar estado §5 y ramas en `generarPasosEtapa5` y, si aplica, **reemplazar** `LISTO_OD_PENDIENTE` / lógica `esperaListoCambioOjo` por la subfase unificada **pre-grueso visual** (misma semántica OD y OI).
- `obtenerInstrucciones`: antes de comparación, si `interpretacionAgudeza` presente y subfase activa, procesar; validar que no se mezcle con `interpretacionComparacion`.
- Reutilizar `subirLogMAR` / secuencia existente; **H** fija en TV.

### Fase 2 — `server.js`

- Sin cambio de ruta si el body ya acepta `interpretacionAgudeza`; solo validar coherencia etapa/subfase.

### Fase 3 — Agente (`chatSupervisor/index.ts`)

- Tabla: cuando `contexto` indique subfase pre-grueso (nombre estable), enviar **`respuestaPaciente` + `interpretacionAgudeza`**.
- Quitar instrucciones que obliguen “solo `respuestaPaciente`” en OD/OI para esos mensajes.
- Ajustar punto de “no re-llamar `obtenerEtapa`”: si el mensaje pide respuesta del paciente sobre **visión**, **esperar** y mandar interpretación.

### Fase 4 — QA

- Matriz: (OD inicio, OI post-agudeza) × (ve bien a 0,3; varias subidas; saturación de escala).
- Regresión: **binocular** inalterado; examen completo hasta `FINALIZADO`.

### Fase 5 — Despliegue

- Railway / logs; rollback por tag si hace falta.

---

## 7. Checklist de implementación

1. [ ] Motor: estado §5 + TV en OD/OI antes de “¿ves bien?”.  
2. [ ] Motor: reemplazar espera “listo” por flujo §3 + §5.  
3. [ ] Motor: saturación `subirLogMAR` §4.2.  
4. [ ] `obtenerInstrucciones`: procesar `interpretacionAgudeza` en subfase pre-grueso.  
5. [ ] Agente: prompt + tool schema alineados.  
6. [ ] Docs: mensajes y flujo; quitar “listo” en OD/OI donde corresponda.  
7. [ ] QA §6 Fase 4.

---

## 8. Criterios de salida (“hecho”)

- Tras el mensaje inicial por ojo, sin “ve bien” confirmado, la TV muestra **H** al logMAR que corresponda y solo entonces se interpreta respuesta.
- Una confirmación “ve bien” fija el logMAR del bloque grueso.
- Subidas monótonas de logMAR mientras no ve bien; en saturación de lista, comportamiento §4.2 sin bucle infinito.
- Comparación de lentes posterior idéntica en lógica salvo el logMAR de trabajo.
- Binocular y resto de etapas no regredidos.

---

## 9. Referencias

- `PLAN_ETAPA1_LOGMAR_DEFAULT_03.md`  
- `motorExamen.js` — `generarPasosEtapa5`, `generarPasosEtapa3`, `obtenerInstrucciones`, `subirLogMAR`, `interpretacionAgudeza` en agudeza alcanzada como referencia de procesamiento  
- `src/app/agentConfigs/chatSupervisor/index.ts`  
- `DEFINICIONES_EXAMEN_BINOCULAR.md` — solo como referencia de subfases; **no** cambia el contrato “listo” binocular salvo decisión aparte  

---

## 10. Soluciones documentadas a las contradicciones

Este apartado fija **por escrito** cómo se resuelven las tensiones identificadas en el §4, para trazabilidad de producto y de implementación. **No** sustituye al §4 (contexto breve); aquí se explicita la **decisión** y el **alcance** de cada solución.

### 10.1 “Listo” (solo voz) vs “¿ves bien?” + `interpretacionAgudeza`

| Tensión | Había dos contratos en el mismo tramo del examen: esperar **continuidad verbal** (“listo”) **sin** interpretación estructurada, frente a valorar **calidad visual** con **`interpretacionAgudeza`**. |
| **Solución adoptada** | **Sustituir** la fase basada en “listo” en **arranque OD** y **transición a OI antes del primer grueso** por una **única subfase** de **pre-esférico grueso** (pregunta “¿ves bien?” / ajuste de logMAR). El agente envía **`respuestaPaciente` + `interpretacionAgudeza`** cuando el `contexto` indique esa subfase. |
| **Alcance** | Aplica solo a los pasos previos al **primer** comparativo de **`esferico_grueso`** por ese arranque. **No** aplica a **ETAPA_6 binocular**, que conserva el contrato **“listo”** + solo `respuestaPaciente` donde ya está definido. |

### 10.2 Sin tope de logMAR (producto) vs lista finita (motor)

| Tensión | Producto: **no** fijar tope clínico explícito. Implementación: `subirLogMAR` opera sobre una **secuencia discreta finita**. |
| **Solución adoptada** | Distinguir **tope de producto** (ninguno) de **límite técnico** (último valor de la lista). Al **saturar** (el siguiente “subir” no aumenta el logMAR), se **fija** ese valor como logMAR de trabajo, se emite un **mensaje** acordado al paciente, se deja **trazabilidad** en log si aplica, y se **continúa** al esférico grueso para evitar **bucle infinito** ante respuestas repetidas de “más ajuste”. |
| **Alcance** | Solo dentro de la subfase pre-grueso; no redefine reglas de agudeza alcanzada ni de comparación de lentes. |

### 10.3 Pregunta “¿ves bien?” sin optotipo en TV

| Tensión | Un mensaje que pide valorar la visión **sin** haber mostrado optotipo en ese logMAR es clínicamente incoherente y desalineado con el flujo del OI. |
| **Solución adoptada** | En **toda** iteración (primera y posteriores), **antes** del `hablar` que pregunta por la visión, el backend debe incluir en la secuencia de pasos automáticos un comando **TV** con letra **H** al **logMAR en pantalla** actual (0,3 inicialmente; valor actual tras cada subida), más la espera operativa del foróptero según el mismo patrón que el resto del motor. |
| **Alcance** | OD (incl. ETAPA_3 si aplica el arranque) y OI en transición al grueso; no obliga a cambiar otros tests salvo que compartan el mismo subpaso. |

### 10.4 Documentación / copy previo (“avisame listo”) vs copy cerrado (“decime si ves bien”)

| Tensión | Textos o definiciones anteriores pueden describir solo **“listo”** en la transición al OI u OD. |
| **Solución adoptada** | Declarar **obsoleto** el copy basado únicamente en “listo” para esos tramos. Al implementar, **actualizar** referencias (`README`, `DOCUMENTACION`, definiciones de transición si existen) para que coincidan con los **textos literales** del §3.4 del presente plan. Una sola fuente de verdad para guion en ese segmento. |
| **Alcance** | Documentación y prompts del agente; sin cambiar el guion binocular salvo decisión explícita aparte. |

### 10.5 Una confirmación de “ve bien” vs doble confirmación en `agudeza_alcanzada`

| Tensión | En otras partes del examen (p. ej. agudeza alcanzada) puede exigirse **más de una** confirmación en el mismo logMAR. |
| **Solución adoptada** | Son **protocolos distintos**: el pre-grueso es un **subpaso operativo** para fijar la **fila de trabajo** en TV antes de la comparación; aquí basta **una** interpretación `correcta` (“ve bien”) para fijar logMAR. **No** portar automáticamente la regla de doble confirmación de ETAPA_4 a este bloque. |
| **Alcance** | Solo subfase pre-grueso; no modifica la lógica de `agudeza_alcanzada` ni la de comparación de lentes. |

### 10.6 Resumen operativo para implementadores

- Resolver contradicciones **no** mezcla estados: **binocular** ≠ **pre-grueso**; **tope producto** ≠ **saturación técnica**; **agudeza alcanzada** ≠ **pre-grueso**.  
- Cualquier PR debe cerrar **código + docs + prompt** en coherencia con §10.1–10.5 (véase checklist §7 ítem 6 y §6 Fase 0).

---

*Versión: 2026-05-12 — incorpora §10 (soluciones a contradicciones).*
