> **Archivo archivado** — movido a `docs/historial/` el 2026-05-28. Estado original: Implementado (2026-05-21)
> Ver [docs/ARQUITECTURA.md](../ARQUITECTURA.md) para la documentación vigente del sistema.

---

# Plan de integración — orquestador × repo externo de knowledge

**Estado:** implementado (2026-05-21).  
**Repo de contenido:** [digifab-ar/Oftalm_agent_v2_prompts_knowledge](https://github.com/digifab-ar/Oftalm_agent_v2_prompts_knowledge) — tag de referencia `knowledge-v1.0.0`; **runtime siempre en `main`**.  
**Orquestador:** `reference/foroptero-orchestrator/`.

### Decisiones cerradas (2026-05-21)

| Tema | Decisión |
|------|----------|
| **Deploy** | **Opción A** — `git clone` al arranque + `git pull` en recarga (`KNOWLEDGE_ROOT` en disco). |
| **Recarga** | **Híbrido** — webhook GitHub en prod (push a `main`); manual en local/staging y contingencias. |
| **Ref git** | Siempre **`main`** (`KNOWLEDGE_GIT_REF=main`). Tags `knowledge-v*` solo hitos documentales. |
| **Copia local** | **Eliminar** `prompts/` y `knowledge/` del orquestador (I6 obligatorio). Sin fallback embedded. |
| **Repo** | Público por ahora; ver §12 si pasa a privado. |

---

## 1. Objetivo

Hacer que el runtime del orquestador cargue **prompts** y **knowledge** desde el repo externo usando `knowledge.manifest.json`, de modo que:

- Cambios en `.md` + manifest → **sin redeploy** del servicio (solo `git pull` o recarga).
- Comportamiento del pipeline **idéntico** al actual en `knowledge-v1.0.0` (paridad de regresión).
- `contratos-agentes.md`, `schemas.js`, fixtures y lógica determinista **permanecen** en el orquestador.

---

## 2. Estado actual vs. objetivo

| Aspecto | Hoy | Objetivo |
|---------|-----|----------|
| Índice de archivos | Hardcode en `lib/knowledge.js` (`CORE_KNOWLEDGE`, `FASE_KNOWLEDGE`) | `knowledge.manifest.json` en repo externo |
| Paths de knowledge | `ROOT/knowledge/{rel}` (ej. `core/...`) | `KNOWLEDGE_ROOT/knowledge/...` según manifest |
| Paths de prompts | `ROOT/prompts/{agente}.md` o `protocolo-{fase}.md` | Paths del manifest (ej. `prompts/protocolo-agudeza.md`) |
| Lectura por turno | Sync, sin caché de contenido | Sync desde disco (clone local); manifest con caché opcional por mtime |
| Fuente canónica en git | Duplicada (orquestador + repo externo) | **Solo** repo externo; borrar `prompts/` y `knowledge/` del orquestador en I6 |
| Meta-agente | No usado por orquestador | Sigue fuera del pipeline (`metaAgent` ignorado en runtime) |

---

## 3. Arquitectura objetivo

```text
┌─────────────────────────────────────────────────────────────┐
│  Railway / Docker — foroptero-orchestrator                  │
│                                                             │
│  server.js                                                  │
│    └── agents/*.js → cargarSystemAgente()                   │
│              └── lib/knowledge.js                           │
│                    ├── lee KNOWLEDGE_ROOT/                  │
│                    │     knowledge.manifest.json            │
│                    ├── concatena prompt + knowledge[]       │
│                    └── fail fast si falta manifest/archivos   │
│                                                             │
│  KNOWLEDGE_ROOT=/app/knowledge-repo   (git clone, ref main) │
│  estadoExamen, schemas, MQTT, pipeline  → sin cambios       │
└─────────────────────────────────────────────────────────────┘
         ▲
         │ prod: webhook push main → POST recargar (interno)
         │ dev/staging/contingencia: POST manual recargar-knowledge
         │
┌────────┴────────────────────────────────────────────────────┐
│  Oftalm_agent_v2_prompts_knowledge (GitHub)                 │
│  knowledge.manifest.json, prompts/, knowledge/              │
└─────────────────────────────────────────────────────────────┘
```

**Principio:** el orquestador solo cambia la **capa de carga de texto** (`lib/knowledge.js` + arranque + ops). No se toca `pipelineTurno.js`, `agents/schemas.js`, `vistasAgentes.js`, `estadoExamen.js`.

---

## 4. Variables de entorno (nuevas)

| Variable | Obligatoria | Default | Descripción |
|----------|-------------|---------|-------------|
| `KNOWLEDGE_ROOT` | **Sí** | — | Ruta absoluta al clone (raíz con `knowledge.manifest.json`). Ej. `/app/knowledge-repo`. |
| `KNOWLEDGE_GIT_URL` | Sí (Railway) | repo público URL | `https://github.com/digifab-ar/Oftalm_agent_v2_prompts_knowledge.git` |
| `KNOWLEDGE_GIT_REF` | No | `main` | **Fijado a `main`** en prod/staging. |
| `KNOWLEDGE_RELOAD_TOKEN` | **Sí** | — | Bearer para `POST /api/admin/recargar-knowledge` y webhook (mismo secret o dos tokens — ver §12 O2). |
| `KNOWLEDGE_WEBHOOK_ENABLED` | No | `true` en prod | Si `true`, aceptar POST de GitHub en ruta dedicada o reutilizar recarga con validación. |
| `KNOWLEDGE_MANIFEST_CACHE_MS` | No | `5000` | Cache del manifest parseado; invalidar en recarga. |
| `KNOWLEDGE_GIT_TOKEN` | Solo si repo privado | — | PAT read-only para clone/pull (§12 O1). |

**Eliminadas respecto al borrador:** `KNOWLEDGE_SOURCE`, modo `embedded` — no aplican.

Documentar en `.env.example` del orquestador (sin valores secretos).

### Dev local

```bash
git clone https://github.com/digifab-ar/Oftalm_agent_v2_prompts_knowledge.git ../Oftalm_agent_v2_prompts_knowledge
export KNOWLEDGE_ROOT=/ruta/absoluta/Oftalm_agent_v2_prompts_knowledge
# Opcional: KNOWLEDGE_GIT_URL vacío si el clone ya existe y no se quiere pull al boot
npm start
```

---

## 5. Cambios de código previstos (fase de implementación)

### 5.1 `lib/knowledge.js` (refactor principal)

| Tarea | Detalle |
|-------|---------|
| K1 | `CONTENT_ROOT = KNOWLEDGE_ROOT` (obligatorio). Fallar al primer `cargarSystemAgente` si falta manifest o archivos referenciados. |
| K2 | Cargar y parsear manifest una vez por request o con cache (mtime del JSON). |
| K3 | `resolverFaseKnowledge(fase)`: usar `manifest.defaultPhase` + `manifest.phases[fase]`; fallback a `agudeza` si fase desconocida (igual que hoy). |
| K4 | `cargarPrompt(agente, fase)`: leer `manifest.phases[f][agente].prompt` desde `CONTENT_ROOT` (path completo desde raíz del repo). Eliminar o dejar como fallback la convención `protocolo-${f}.md`. |
| K5 | `listarKnowledge(agente, fase)`: devolver `manifest.phases[f][agente].knowledge[]` en orden. **No** usar `CORE_KNOWLEDGE` / `FASE_KNOWLEDGE` cuando manifest activo. |
| K6 | `leerMarkdown(relPath)`: leer `path.join(CONTENT_ROOT, relPath)` — el manifest ya incluye prefijo `knowledge/...`. |
| K7 | `cargarKnowledgeAgente`: mantener formato `---
# {path}
` + contenido (misma forma que hoy para no romper prompts). |
| K8 | Eliminar `CORE_KNOWLEDGE`, `FASE_KNOWLEDGE` y rutas `ROOT/prompts`, `ROOT/knowledge`. |
| K9 | `obtenerInfoKnowledge()` → `{ version, root, gitRef, commitShort, manifestMtime }` para health. |

**Nota de paths:** el manifest v1 usa paths desde la raíz del repo (`knowledge/core/...`, `prompts/...`). El código embebido actual usa paths relativos a `knowledge/` sin prefijo. El refactor **no** debe mezclar ambas convenciones.

### 5.2 `lib/knowledgeBootstrap.js` (nuevo, recomendado)

| Tarea | Detalle |
|-------|---------|
| B1 | `asegurarKnowledgeRepo()`: si `KNOWLEDGE_GIT_URL` y carpeta vacía/inexistente → `git clone --depth 1 --branch ${REF}`. |
| B2 | `actualizarKnowledgeRepo()`: `git -C $KNOWLEDGE_ROOT fetch origin && git checkout main && git reset --hard origin/main` (pull atómico). |
| B3 | Invocar en `server.js` **antes** de `app.listen`; **no** escuchar si clone inválido o `validate-manifest` falla. |
| B4 | Validar manifest post-pull reutilizando lógica de `scripts/validate-manifest.mjs` (copiar o importar reglas mínimas). |

**Descartadas:** opciones B (submódulo) y C (volumen manual) — ver §6.

### 5.3 `server.js`

| Tarea | Detalle |
|-------|---------|
| S1 | Al boot: `await asegurarKnowledgeRepo()` (si aplica). |
| S2 | Extender `GET /api/health` con `knowledge: { source, version, root, gitRef }`. |
| S3 | `POST /api/admin/recargar-knowledge`: Bearer `KNOWLEDGE_RELOAD_TOKEN` → pull + validar manifest + invalidar cache → `{ ok, version, commit }`. |
| S4 | Webhook prod (híbrido): `POST /api/admin/webhook/knowledge` o reutilizar S3 con header `X-Hub-Signature-256` (GitHub) + mismo flujo que S3. Solo eventos `push` a `main`. |

### 5.4 Tests (nuevo)

| Tarea | Detalle |
|-------|---------|
| T1 | `test/knowledgeLoader.test.js`: con fixture minimal manifest + 2 archivos temp, verificar orden de concatenación. |
| T2 | Test fallo explícito si `KNOWLEDGE_ROOT` ausente o manifest roto. |
| T3 | Test error claro si manifest referencia archivo inexistente. |
| T4 | Test `actualizarKnowledgeRepo` con mock git (opcional). |

No hay tests de knowledge hoy; esto reduce riesgo de regresión en el refactor.

### 5.5 Documentación

| Tarea | Detalle |
|-------|---------|
| D1 | Actualizar `README.md` orquestador: variables, recarga, link al repo. |
| D2 | Actualizar `knowledge/README.md` en repo externo: quitar “pendiente integración” tras deploy. |
| D3 | Runbook corto en este doc §10. |

### 5.6 Fuera de alcance de la integración

- Consumir `metaAgent` del manifest en el orquestador.
- Mover `contratos-agentes.md` al repo externo.
- Mover `fixtures/auditor/`.
- Cambiar schemas, modelos, pipeline, MQTT.

---

## 6. Deploy — Opción A (decidida)

| Paso | Acción |
|------|--------|
| A1 | Dockerfile / imagen Railway con **`git`** en PATH. |
| A2 | `KNOWLEDGE_GIT_URL`, `KNOWLEDGE_GIT_REF=main`, `KNOWLEDGE_ROOT=/app/knowledge-repo`. |
| A3 | Boot: `asegurarKnowledgeRepo()` → clone shallow si no existe, luego `reset --hard origin/main`. |
| A4 | **Híbrido recarga:** ver §6.1. |

### 6.1 Recarga híbrida (decidida)

| Entorno | Disparador | Cuándo |
|---------|------------|--------|
| **Producción** | Webhook GitHub `push` → `main` | Automático tras merge (configurar en repo knowledge o org). |
| **Staging** | Manual `POST /api/admin/recargar-knowledge` | Antes de validar un PR de content en entorno staging. |
| **Local** | Clone local + opcional POST manual; sin webhook | Dev con `KNOWLEDGE_ROOT` al clone en disco. |
| **Contingencia** | Mismo POST manual | Si webhook falla, manifest malo revertido en GitHub, o rollback de content. |

Flujo webhook (prod):

```text
merge PR → main en Oftalm_agent_v2_prompts_knowledge
    → GitHub webhook POST orquestador
    → git reset --hard origin/main en KNOWLEDGE_ROOT
    → validar manifest
    → invalidar cache
    → log + health actualizado
```

**No redeploy** del orquestador en este flujo.

### Opciones descartadas

| Opción | Motivo del descarte |
|--------|---------------------|
| B — Submódulo | Actualizar content suele exigir redeploy del orquestador. |
| C — Volumen manual | No alinea con webhook; riesgo de olvido operativo. |

---

## 7. Fases de implementación

### Fase I0 — Preparación (sin código)

| # | Tarea | Criterio |
|---|-------|----------|
| I0.1 | ~~Estrategia deploy~~ | ✅ Opción A |
| I0.2 | ~~Ref prod~~ | ✅ `main` |
| I0.3 | Generar `KNOWLEDGE_RELOAD_TOKEN` en Railway (prod + staging) | Secreto configurado |
| I0.4 | Resolver §12 O1–O3 si aplica | Ver abajo |
| I0.5 | Configurar webhook GitHub → URL prod del orquestador | Push a `main` dispara recarga |
| I0.6 | Documentar dev local (clone + `KNOWLEDGE_ROOT`) en README orquestador | README actualizado |

### Fase I1 — Refactor loader (dev local)

| # | Tarea | Criterio |
|---|-------|----------|
| I1.1 | Implementar §5.1 con `KNOWLEDGE_ROOT` → clone local del repo externo | `npm start` + `test:agent` comportamiento igual |
| I1.2 | README: arranque exige clone (sin `prompts/`/`knowledge/` locales tras I6) | Documentado |
| I1.3 | Tests T1–T3 (T4 opcional) verdes | `npm test` |

**Prueba de paridad (pre-I6):** hash de `cargarSystemAgente` por agente vs baseline capturado con copia embebida actual y manifest v1.0.0 en clone.

### Fase I2 — Bootstrap git + health

| # | Tarea | Criterio |
|---|-------|----------|
| I2.1 | Implementar §5.2 + §5.3 S1–S2 | `/api/health` muestra `knowledge.version: 1.0.0` |
| I2.2 | Fallo controlado si external exigido y clone falla | Log claro, proceso no escucha |

### Fase I3 — Recarga operativa

| # | Tarea | Criterio |
|---|-------|----------|
| I3.1 | Endpoint recarga §5.3 S3 | Merge en repo externo + POST → próximo turno usa texto nuevo |
| I3.1b | Webhook prod §6.1 (híbrido) | Merge a `main` → recarga sin POST manual |
| I3.2 | Runbook §10 (manual + webhook + health) | Documentado |

### Fase I4 — Staging Railway

| # | Tarea | Criterio |
|---|-------|----------|
| I4.1 | Variables en servicio staging | Health OK |
| I4.2 | Correr `test:agent` / `test:registro` contra staging | Mismos resultados que baseline |
| I4.3 | Editar un `.md` menor en repo externo (zona verde comunicación) + recarga | Cambio visible en mensaje sin redeploy orquestador |

### Fase I5 — Producción

| # | Tarea | Criterio |
|---|-------|----------|
| I5.1 | Deploy orquestador con integración | Health `source: external` |
| I5.2 | `KNOWLEDGE_GIT_REF=main` en Railway | Health muestra `gitRef: main` |
| I5.3 | Smoke test examen real o simulado | OK |

### Fase I6 — Limpieza (**obligatoria**, mismo release o PR inmediato post-I5)

| # | Tarea | Criterio |
|---|-------|----------|
| I6.1 | Eliminar `prompts/` y `knowledge/` del orquestador (excepto no aplica a `contratos-agentes` — mover a `docs/contratos-agentes.md` o `knowledge-server/`) | Carpetas borradas en git |
| I6.2 | Mover `contratos-agentes.md` a `docs/contratos-agentes.md` en orquestador | Referencias actualizadas en README/knowledge README |
| I6.3 | Actualizar referencias en HTML/docs que apunten a `prompts/` o `knowledge/` locales | Links al repo externo |
| I6.4 | CI repo externo: workflow validate (subir cuando PAT tenga scope `workflow`) | Verde en PRs de content |

---

## 8. Plan de pruebas

| Nivel | Qué | Cómo |
|-------|-----|------|
| Unit | Loader + manifest | `test/knowledgeLoader.test.js` |
| Contrato | Paridad v1.0.0 | Script hash `cargarSystemAgente` vs baseline (capturado pre-I6) |
| Integración | Pipeline agudeza | `BACKEND_URL=... npm run test:agent` (bootstrap + respuesta) |
| Manual | Recarga | Cambiar `comunicacion.md` → recarga → turno repregunta con texto nuevo |
| Manual | Regresión clínica | Escenarios BUG-003/004 no reintroducidos (examen corto R) |

**Baseline:** tag `knowledge-v1.0.0` + commit del orquestador previo a integración.

---

## 9. Rollback (sin embedded)

| Escenario | Acción |
|-----------|--------|
| Manifest corrupto tras pull | `git revert` en repo knowledge → merge `main` → webhook/recarga; o `git reset --hard <commit-bueno>` en clone + POST recarga |
| Comportamiento clínico roto | Revert PR en repo knowledge; recarga; orquestador **sin** redeploy |
| Fallo total arranque (clone) | Arreglar credenciales/URL; redeploy orquestador solo si cambió imagen sin `git` |
| Webhook disparó mal | Deshabilitar webhook; POST manual tras validar `main` |

**Pre-I6:** capturar baseline de hashes antes de borrar copia embebida. **Post-I6:** rollback solo vía git en repo knowledge.

---

## 10. Runbook operativo (post-integración)

### Producción — flujo normal (webhook, sin POST manual)

1. PR en [Oftalm_agent_v2_prompts_knowledge](https://github.com/digifab-ar/Oftalm_agent_v2_prompts_knowledge) → merge a `main`.
2. Webhook ejecuta pull + validación en el orquestador.
3. Verificar `GET /api/health` → `knowledge.version` y `commit` actualizados.
4. Smoke opcional: un turno de examen.

### Staging / contingencia — recarga manual

```bash
curl -X POST https://<orquestador>/api/admin/recargar-knowledge \
  -H "Authorization: Bearer $KNOWLEDGE_RELOAD_TOKEN"
```

Usar si el webhook falló, para probar un PR antes de merge a `main`, o tras revert en GitHub.

### Agregar archivo nuevo de knowledge

1. Crear `.md` en repo externo.
2. Añadir path en `knowledge.manifest.json` → `phases.agudeza.<agente>.knowledge`.
3. `npm run validate` en repo externo.
4. PR → merge → recarga (§ arriba).

**No requiere** redeploy del orquestador si el loader ya usa manifest (Fase I1+).

---

## 11. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Sin embedded post-I6 | Paridad baseline pre-I6; validar manifest en cada pull |
| Webhook merge roto a prod | Branch protection + review en repo knowledge; validación manifest en pull |
| Manifest inválido en prod | Validar en boot; CI en repo externo |
| Clone falla en Railway | Health fail fast; alertas |
| Pull parcial / conflicto git | Recarga atómica: `git fetch && git reset --hard origin/REF` |
| Token de recarga expuesto | Solo variable Railway; rotación |
| Latencia por lectura sync cada turno | Aceptable (archivos pequeños); cache manifest opcional |

---

## 12. Decisiones cerradas vs. abiertas

### Cerradas

| ID | Decisión |
|----|----------|
| D1 | Deploy **A** (clone + pull en `KNOWLEDGE_ROOT`) |
| D2 | Recarga **híbrida** (webhook prod + manual staging/contingencia) |
| D3 | Ref **`main`** siempre |
| D4 | Eliminar `prompts/` y `knowledge/` del orquestador (I6 obligatorio) |
| D5 | Repo knowledge **público** por ahora |
| D6 | `contratos-agentes.md` **solo servidor** (mover a `docs/` en orquestador, no al repo knowledge) |

### Abiertas (resolver en I0, no bloquean diseño)

| ID | Tema | Opciones / nota | Quién |
|----|------|-----------------|-------|
| **O1** | Repo pasa a **privado** | `KNOWLEDGE_GIT_TOKEN` o deploy key en Railway | Cuando ocurra |
| **O2** | Seguridad webhook | (a) Solo `Bearer KNOWLEDGE_RELOAD_TOKEN` en URL secreta; (b) validar `X-Hub-Signature-256` de GitHub | Implementación I3 — recomendación: **(b) en prod** |
| **O3** | Pull falla **durante** recarga con examen activo | (a) Mantener archivos viejos + log error; (b) fallar recarga y no invalidar cache | Recomendación: **(a)** |
| **O4** | Imagen Docker | ¿`node:20` + `apt install git` o imagen custom? | Quien arma Railway |
| **O5** | ¿Servicio staging separado en Railway? | Mismo código; webhook deshabilitado (`KNOWLEDGE_WEBHOOK_ENABLED=false`) | Ops |
| **O6** | `KNOWLEDGE_MANIFEST_CACHE_MS` | ✅ **5000** (invalidación en recarga) |

**Nada más estructural queda por definir** para empezar I1. O2, O3, O4 son detalles de implementación resolubles en el PR de integración con valores por defecto arriba.

---

## 13. Cronograma estimado

| Fase | Esfuerzo |
|------|----------|
| I0 | 0.5 día |
| I1 | 1–1.5 días |
| I2 | 0.5 día |
| I3 | 0.5 día |
| I4–I5 | 1 día |
| I6 | 0.5 día (**obligatorio**, con o justo después de I5) |

**Total:** ~3–4 días hábiles hasta producción con recarga operativa.

---

## 14. Criterios de cierre

- [ ] Orquestador en prod con `knowledge.source === "external"` en `/api/health`.
- [ ] Paridad con comportamiento pre-integración en tests de agente.
- [ ] Cambio de un `.md` en repo externo + recarga altera salida sin redeploy.
- [ ] Runbook y `.env.example` actualizados.
- [ ] Equipo sabe que `contratos-agentes.md` sigue solo en orquestador (`docs/`).
- [ ] `prompts/` y `knowledge/` eliminados del orquestador (I6).
- [ ] Webhook prod activo en push a `main`.

---

*Última actualización del plan: 2026-05-21 — decisiones A + híbrido + main + sin embedded.*
