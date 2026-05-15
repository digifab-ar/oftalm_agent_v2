# Plan POC — Registro del examen en curso y export CSV

**Estado:** implementado en código (`motorExamen.js`, `server.js`, `reference_framer/ForopteroControl.tsx`). Despliegue: requiere publicar backend con estos cambios para que el botón Framer contra producción reciba el CSV.  
**Alcance:** prueba de concepto simple; un solo examen en memoria hasta reinicio; descarga desde panel Framer.  
**Relacionado:** `motorExamen.js` (estado global `estadoExamen`, `obtenerInstrucciones`, ejecución automática de pasos), `server.js` (`/api/examen/*`), `src/app/agentConfigs/chatSupervisor/index.ts`, `reference_framer/ForopteroControl.tsx`.

---

## 1. Objetivo

Permitir **registrar** todo lo relevante del **examen en curso** y **exportar en cualquier momento** un archivo **CSV** (o paquete CSV + convenciones claras) que incluya:

1. **Valores iniciales** indicados por el paciente (texto autorefractómetro en el formato acordado).
2. **Valores recalculados** por el motor (misma familia de formato legible).
3. **Línea de tiempo** ordenada: mensajes que el backend envía al oftalmólogo virtual (`hablar`), texto del paciente, **interpretaciones estructuradas** ya presentes en el JSON de request (`interpretacionAgudeza`, `interpretacionComparacion`), y eventos **foróptero / TV** con **vista legible** y marca de tiempo.
4. **Resultados por etapa** (tabla resumen alineada a `secuenciaExamen.resultados` y binocular cuando aplique).

La POC no sustituye historia clínica ni archivo legal; es **trazabilidad técnica y operativa** para QA, depuración y revisión del flujo.

---

## 2. Decisiones de producto (cerradas para esta POC)

| # | Decisión |
|---|----------|
| 1 | **Un solo examen** por instancia del motor: es el examen en curso. Al **reiniciar** el examen (`/api/examen/reiniciar` o flujo equivalente), el **registro anterior se descarta** y el buffer queda en blanco (mismo ciclo de vida que el estado en memoria). |
| 2 | **Interfaz POC:** botón en el **panel de control Framer** (`ForopteroControl` o módulo hermano) que dispare la descarga del CSV (vía nuevo endpoint o URL estática generada por el servidor; ver §6). |
| 3 | **Zona horaria:** todas las marcas de tiempo mostradas en el CSV en **Argentina (UTC−3)**. Recomendación técnica: almacenar internamente en **UTC** (ISO 8601 con `Z`) y **convertir solo al export** con zona fija `America/Argentina/Buenos_Aires` (maneja DST histórico si en el futuro cambia; hoy suele ser UTC−3). Si se prefiere máxima simplicidad en POC: offset fijo **−03:00** sin biblioteca, aceptando el riesgo de desalineación si la ley de DST cambia. |
| 4 | **Interpretación del agente:** alcanza con lo **identificado en el JSON** enviado al backend (`interpretacionAgudeza`, `interpretacionComparacion`); no se requiere texto natural adicional generado por el modelo en esta fase. |
| 5 | **Foróptero / TV:** en el CSV, **vista legible** derivada del payload de pasos o del comando efectivo (p. ej. resumen por ojo: esfera / cilindro / eje / oclusión; TV: letra y logMAR), no obligatoriamente el JSON crudo del hardware. |
| 6 | **Export en cualquier momento:** el archivo debe generarse con el **estado parcial** acumulado hasta el instante de la petición (etapas incompletas, resultados `null` donde aún no hubo medición). Las filas de resumen deben reflejar **solo lo confirmado o inferible** del estado actual; celdas vacías o marcador explícito (`—` / `pendiente`) donde no haya dato. |

---

## 3. Alcance y fuera de alcance (POC)

**Dentro del alcance**

- Buffer **append-only** de eventos en el **mismo proceso** que el motor (o escritura ligera a archivo temporal en disco del servidor, si se desea sobrevivir a reinicios del proceso; para POC suele bastar memoria alineada al estado del examen).
- Un endpoint dedicado, p. ej. `GET /api/examen/registro.csv` (nombre tentativo), que devuelva `text/csv` con `Content-Disposition: attachment`.
- Formateo de cabecera + timeline + bloque de resultados.
- Botón en Framer que llame a ese endpoint (misma base URL que el resto de controles) y fuerce descarga en el navegador.

**Fuera del alcance (POC)**

- Multi-sesión, base de datos, usuarios y permisos granulares.
- Cifrado en reposo, retención legal, integración EMR.
- Sincronización con tiempo real del “momento exacto” del audio del paciente (se registra **momento de llegada al servidor** del request con `respuestaPaciente`).
- Garantía de que el TTS en el cliente pronunció literalmente cada `hablar` (se registra **instrucción emitida por el backend**).

---

## 4. Estructura contractual del CSV

El archivo es **un solo CSV** con **tres bloques verticales** (filas consecutivas). Los separadores de columna son coma (`,`). Los encabezados de la primera fila de cada bloque son literales acordados abajo.

> **Nota Excel:** un CSV con tablas de distinto número de columnas es válido; cada fila puede tener celdas vacías al final. Opcional: fila con una sola celda `### LOG` / `### RESULTADOS` como marcador visual (no obligatorio para la POC).

### 4.1 Bloque A — Valores RX (2 filas × 2 columnas)

Sin fila de encabezado obligatoria (son datos fijos al inicio del archivo), o bien una primera fila `Campo,Valor` si se prefiere homogeneidad.

| Columna 1 | Columna 2 |
|-------------|-----------|
| `Valores iniciales` | String con el texto de autorefracción tal como lo envió el paciente (mismo formato canónico, p. ej. `<R> +0.75 , -1.75 , 60 / <L> +2.75 , 0.00 , 0`). Si aún no hubo entrada: vacío o `pendiente`. |
| `Valores recalculados` | String generado por el motor a partir de `valoresRecalculados` (misma familia de formato legible que el producto use en mensajes). Si aún no hay recálculo: vacío o `pendiente`. |

Ejemplo conceptual (dos filas de datos):

```text
Valores iniciales,"<R> +0.75 , -1.75 , 60 / <L> +2.75 , 0.00 , 0"
Valores recalculados,"<R> +0.75 , -1.25 , 60 / <L> +2.25 , 0.00 , 0"
```

### 4.2 Bloque B — `log` (tabla de eventos)

**Primera fila del bloque (encabezado):**

`Timestamp,Origen,Detalle`

**Columnas:**

| Encabezado | Descripción |
|------------|-------------|
| `Timestamp` | Fecha y hora en **Argentina (UTC−3)** según §2.3. Formato recomendado POC: `YYYY-MM-DD HH:mm:ss` (sin mezclar milisegundos salvo necesidad). |
| `Origen` | Valores permitidos (literal, para filtrar en Excel): **`Oftalmologo`** \| **`Paciente`** \| **`Foroptero-TV`** \| **`Interpretacion`** (§4.2.2). |
| `Detalle` | Una sola celda de texto: guion del backend, texto del paciente, o **vista legible** conjunta foróptero + TV (ver §4.2.1). Comillas y saltos de línea escapados según RFC 4180. |

#### 4.2.1 Semántica de `Origen` y `Detalle`

| `Origen` | Contenido de `Detalle` |
|----------|-------------------------|
| `Oftalmologo` | Texto exacto de cada paso `hablar` devuelto por el backend (lo que el agente debe pronunciar). Si en una misma respuesta hay varios `hablar`, una **fila por mensaje**, mismo timestamp de registro o timestamps incrementales mínimos (documentar: preferible **una fila por mensaje** con el mismo timestamp del batch si no hay reloj fino). |
| `Paciente` | Valor de `respuestaPaciente` recibido en el body del `POST` (texto crudo). |
| `Foroptero-TV` | **Una cadena legible** que combine estado foróptero (R/L: esfera, cilindro, eje, oclusión open/close) y, si aplica en el mismo evento, TV (letra + logMAR). Ej.: `<R> Esf 0.75 / Cil -1.25 @ 60° (open); <L> … (close) | TV: H @ 0.3` (el formato exacto lo fija la implementación; debe ser estable entre exports). |

#### 4.2.2 Interpretaciones JSON (agudeza / comparación)

No hay una cuarta columna: se agregan filas extra en el mismo `log` con **`Origen = Interpretacion`** (convención añadida respecto al esquema mínimo de tres orígenes, para no mezclar JSON con el habla del paciente).

| `Origen` | `Detalle` |
|----------|-----------|
| `Interpretacion` | JSON serializado en una línea: p. ej. `{"tipo":"agudeza","resultado":"correcta","letraIdentificada":"H"}` o `{"tipo":"comparacion","preferencia":"actual"}`. El campo `tipo` en el JSON distingue `interpretacionAgudeza` vs `interpretacionComparacion`. |

**Orden sugerido** dentro de un mismo request: `Paciente` → `Interpretacion` (si existe) → eventos `Foroptero-TV` en orden de ejecución → filas `Oftalmologo` en orden de `pasos`.

### 4.3 Bloque C — Resultados por etapa (opcional pero recomendado)

Después del `log`, una tabla de dos columnas:

**Encabezado:** `Test,Valor`

Filas derivadas de `estadoExamen.secuenciaExamen.resultados` y binocular según `DEFINICIONES_EXAMEN_BINOCULAR.md`. Valores nulos → vacío o `pendiente`.

### 4.4 Metadatos opcionales (antes del bloque A)

Si se desea: 1–3 filas `Campo,Valor` con `exportado_en`, `zona_horaria`, `etapa_actual` (no contradice el bloque A; el bloque A puede ir inmediatamente después o después de estas filas — **fijar orden en implementación** y documentarlo aquí: recomendación **metadatos opcionales primero**, luego §4.1, §4.2, §4.3).

---

## 4bis. Modelo en memoria (conceptual, alineado al CSV)

- El buffer sigue siendo una lista de eventos con campos que mapean 1:1 a `Timestamp`, `Origen`, `Detalle`.
- Al export, se serializa: opcional metadatos → bloque A (2 filas) → encabezado + filas del log → encabezado + filas de resultados.

---

## 5. Puntos de enganche en el backend (solo diseño)

Sin escribir código aquí; lista para la implementación futura:

1. **`inicializarExamen` / `reiniciar`:** crear o vaciar el buffer de eventos junto con el reset de `estadoExamen`.
2. **`obtenerInstrucciones`:** al inicio del manejo de cada llamada, registrar filas `log`: `Paciente` (si hay `respuestaPaciente`), `Interpretacion` (si hay JSON de interpretación), según §4.2.2.
3. **Pipeline de ejecución automática de pasos** (donde hoy se envían foróptero y TV): por cada paso ejecutado, append de fila `log` con `Origen = Foroptero-TV` y **Detalle** = vista legible acordada en §4.2.1 (foróptero ± TV en una celda si aplica).
4. **Antes de responder** al cliente con los `pasos` filtrados para el agente: append de cada `hablar` como `Origen = Oftalmologo` (una fila por mensaje).
5. **Endpoint GET export:** serializar según **§4** (metadatos opcional → valores RX de 2 filas → tabla `log` con encabezado `Timestamp,Origen,Detalle` → tabla `Test,Valor`); charset `utf-8`; BOM opcional para Excel en Windows.

**CORS:** el panel Framer (origen distinto al de Railway) necesitará que el endpoint de export permita el origen del sitio Framer, igual que el resto de llamadas del control (reutilizar política existente o extenderla).

---

## 6. Integración Framer (POC)

- Añadir control **“Descargar registro CSV”** junto a acciones ya existentes (reiniciar, estado, etc.).
- URL: misma base que `POST .../instrucciones` (variable de entorno o constante en el componente de referencia).
- Comportamiento: `fetch` o `window.open` a `GET .../registro.csv`; al recibir blob, disparar descarga con nombre sugerido p. ej. `examen-registro-YYYY-MM-DD-HHmm.csv`.
- Manejo de error: si el servidor no implementa aún el endpoint, mostrar toast o `console.error` (en POC basta mensaje simple).

Archivo de referencia probable: `reference_framer/ForopteroControl.tsx`.

---

## 7. Privacidad y operación (mínimo viable)

- El CSV contiene **datos sensibles** (autorefracción, respuestas). En POC, asumir **entorno controlado** (clínica de prueba).
- Documentar en README o nota interna: no compartir el archivo; borrar manualmente tras revisión.
- La POC **no** incluye anonimización ni consentimiento formal; si el producto avanza, trasladar este apartado a requisitos legales.

---

## 8. Riesgos y mitigaciones (POC)

| Riesgo | Mitigación |
|--------|------------|
| CSV roto por comillas o saltos de línea en texto del paciente | Usar librería CSV estándar o escape RFC 4180; evitar separadores ambiguos en `detalle`. |
| Excel y UTF-8 | BOM `\ufeff` al inicio del stream (opcional). |
| Reinicio borra historia | Comportamiento **aceptado** por decisión (§2.1); advertir en tooltip del botón: “Al reiniciar examen se borra el registro”. |
| Desfase horario | Preferir zona `America/Argentina/Buenos_Aires` en implementación; documentar en cabecera del CSV qué zona se usó. |

---

## 9. Criterios de aceptación (POC)

1. Tras varios turnos de conversación simulada, el bloque `log` incluye filas con `Origen` coherente (`Oftalmologo`, `Paciente`, `Interpretacion` si aplica, `Foroptero-TV`) en orden documentado en §4.2.2.
2. Los timestamps visibles están en **UTC−3 (Argentina)** según §2.3.
3. Valores iniciales y recalculados coinciden con lo que muestra `GET /api/examen/detalle` (o equivalente) en el mismo instante.
4. El bloque de resultados refleja el estado parcial correcto al exportar a mitad de examen.
5. Tras **reiniciar** examen, un nuevo export no contiene eventos del examen anterior.
6. Desde Framer, un clic descarga el archivo sin pasos manuales de copiar/pegar.

---

## 10. Posible fase 2 (no POC)

- Persistencia en disco o S3 con `sessionId` si el modelo pasa a multi-equipo.
- JSONL paralelo para análisis programático.
- Registro del lado cliente del evento “TTS completado” para auditoría de cumplimiento del guion.

---

## 11. Checklist de implementación (cuando se aborde el código)

- [ ] Buffer de eventos + reset alineado a `inicializarExamen` / reinicio.
- [ ] Hooks en `obtenerInstrucciones` y en ejecución de pasos automáticos.
- [ ] Formateadores: bloque A (2 filas), `Detalle` foróptero+TV legible, filas `Interpretacion` según §4.2.2.
- [ ] `GET` export CSV + CORS.
- [ ] Botón en `ForopteroControl.tsx` (o componente dedicado).
- [ ] Prueba manual: examen completo + export parcial + reinicio + export vacío o solo metadatos.

---

## 12. Changelog del documento

| Fecha | Cambio |
|-------|--------|
| 2026-05-13 | Creación del plan POC con decisiones 1–6 del producto. |
| 2026-05-13 | §4 reemplazado por estructura contractual CSV: bloque valores (2 filas), `log` (`Timestamp`,`Origen`,`Detalle`), resultados; `Interpretacion` como cuarto valor de `Origen`. |
| 2026-05-13 | Implementación: buffer en `motorExamen.js`, `GET /api/examen/registro.csv`, botón en `ForopteroControl.tsx`. |
