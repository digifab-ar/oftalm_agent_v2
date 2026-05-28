# Orquestador — pipeline multi-agente

**Ubicación código:** `reference/foroptero-orchestrator/`  
**Puerto local:** `:3001`  
**Stack:** Node.js 18+, Express, OpenAI API, MQTT

---

## Responsabilidad

El orquestador es el backend clínico del sistema. Recibe cada turno del frontend, ejecuta un pipeline de 4 agentes LLM para decidir el próximo paso del examen, actualiza el estado en memoria y envía los comandos a dispositivos físicos.

---

## Estructura de archivos

```
reference/foroptero-orchestrator/
├── server.js                  # HTTP server, MQTT, endpoints
├── orquestadorExamen.js       # Entry point por turno (llamado desde server.js)
├── pipelineTurno.js           # Lógica del pipeline (intérprete → protocolo → auditor → comunicación)
├── estadoExamen.js            # Estado en memoria + historial + tabla resultadosPorLogmar
├── ejecutarAcciones.js        # Traducción patch → comandos MQTT
├── agents/
│   ├── interprete.js          # Agente intérprete (clasificación de respuesta)
│   ├── protocolo.js           # Agente protocolo (propuesta de siguiente paso)
│   ├── auditor.js             # Agente auditor (aprobación/rechazo de propuesta)
│   ├── comunicacion.js        # Agente comunicación (redacción del mensaje al paciente)
│   └── schemas.js             # JSON schemas de outputs por agente
├── lib/
│   ├── vistasAgentes.js       # Proyección estado → vista mínima por agente
│   ├── registroAgudeza.js     # Tabla resultadosPorLogmar, idempotencia de intentos
│   ├── knowledge.js           # Carga manifest externo + archivos MD
│   ├── knowledgeBootstrap.js  # Clone git del repo de knowledge en startup
│   ├── agentModels.js         # Selección de modelos LLM por agente
│   ├── estimulo.js            # Construcción del estímulo visual (letra, logMAR, ojo)
│   ├── llmClient.js           # Wrapper OpenAI con structured outputs
│   └── validarSchema.js       # Validación de outputs LLM
├── fixtures/
│   └── auditor/               # Fixtures JSON para QA manual del auditor
├── docs/
│   └── contratos-agentes.md   # Shapes de vistas por agente
└── test/
    └── *.test.js
```

---

## Pipeline por turno

### `modo: respuesta` (turno normal)

```
POST /api/examen/turno
  ↓
detectarModoTurno() → "respuesta"
  ↓
1. armarVistaInterprete() → ejecutarInterprete()
     Clasifica respuesta del paciente: correcta | incorrecta | no_ve | ambigua
  ↓
2. registrarIntentoAgudeza()
     Registra intento en tabla resultadosPorLogmar (idempotente por timestamp)
  ↓
3. armarVistaProtocolo() → ejecutarProtocolo()
     Propone: estadoPatch + acciones MQTT + evento clínico
  ↓
4. armarVistaAuditor() → ejecutarAuditor()
     Valida propuesta contra checklists y BUG catalog
     Si rechaza → feedback al protocolo → 1 reintento
     Si rechaza de nuevo → fallbackAuditoria()
  ↓
5. aplicarEstadoPatch()  ← escritura en estado
   ejecutarAcciones()    ← MQTT foróptero + TV
  ↓
6. armarVistaComunicacion() → ejecutarComunicacion()
     Redacta mensajesPaciente[] + contextoVoz
  ↓
registrarTurnoHistorial()
  ↓
Respuesta: { ok, pasos[{tipo:hablar, mensaje}], contextoVoz, timingMs }
```

### `modo: bootstrap` (primer turno por ojo)

Activado cuando `letraActual == null && logmarActual == null` para el ojo activo.

- El intérprete se **omite** (clasificación fija: `continuacion`).
- Protocolo y auditor reciben `modo: bootstrap` → aplican inicio de ojo: H@0.3, foróptero + TV.
- Si el auditor rechaza → `fallbackBootstrap()` (mensaje neutro, sin asumir letra en pantalla).

---

## Roles de los agentes LLM

### Intérprete

- **Input (VistaInterprete):** `fase`, `modo`, `estimulo` (letraActual), `respuestaPaciente`, `confianza`
- **Output:** `clasificacion` (correcta | incorrecta | no_ve | ambigua), `letrasCandidatas`, `letraElegida`, `notasInterprete`
- **Regla clave:** no clasifica en bootstrap; en respuesta evalúa fonética Sloan (C/D/F/H/K/N/O/R/S/T/V/Z).

### Protocolo

- **Input (VistaProtocolo):** `fase`, `modo`, `ojoActual`, `agudeza.{R|L}` + `contadoresLogmarActual`, `rx`, `interpretacion`, `feedbackAuditor`
- **Output:** `estadoPatch`, `acciones[]`, `evento`, `detalleEvento`, `razonamientoProtocolo`
- **Regla clave:** propone el próximo paso clínico; no escribe contadores directamente (solo patch de estado); lee tabla ya actualizada.

### Auditor

- **Input (VistaAuditor):** igual que VistaProtocolo + `intentoRecienRegistrado` + `propuestaProtocolo` con `letrasUsadasResultantes`
- **Output:** `aprobado` (boolean), `violaciones[]`, `correccionSugerida`
- **Regla clave:** valida BUG-005 (letra reutilizada), BUG-006 (re-cierre de ojo ya cerrado), BUG-003/004 (cierre prematuro / examen que no cierra). Puede devolver feedback para reintento del protocolo.

### Comunicación

- **Input (VistaComunicacion):** `fase`, `evento`, `detalleEvento`, `huboCambioDispositivo`, flags booleanos, `interpretacion` (`clasificacion`, `notasInterprete`), `estadoResumido`
- **Output:** `mensajesPaciente[]`, `contextoVoz` (esperar_respuesta | continuar_sin_respuesta), `razonamientoComunicacion`
- **Regla clave:** redacta el mensaje al paciente en español argentino; adapta tono según flags (`esPrimerTurnoExamen`, `esCambioDeOjo`, `esExamenFinalizado`, etc.).

---

## Vistas por agente (principio de menor contexto)

Cada agente recibe el subconjunto mínimo de estado necesario, pre-computado en `lib/vistasAgentes.js`. El estado completo y el historial nunca se serializan al LLM; viven solo en memoria para auditoría, CSV y debug.

Detalle de contratos: [`docs/contratos-agentes.md`](../reference/foroptero-orchestrator/docs/contratos-agentes.md) y [docs/API.md](./API.md#vistas-de-agentes).

---

## Estado del examen

Singleton en memoria por instancia del proceso (`estadoExamen.js`). Se reinicia con `POST /api/examen/nuevo`.

```javascript
{
  fase: "agudeza",
  ojoActual: "R",
  rx: { R: { esfera, cilindro, angulo }, L: { ... } },
  agudeza: {
    R: {
      logmarActual, letraActual, ultimoLogmarCorrecto,
      resultadosPorLogmar: { "0.3": { correcto, incorrecto, noVe, intentos[] }, ... },
      letrasUsadas: [],
      logmarFinal, letraFinal
    },
    L: { ... }
  },
  historial: [],           // solo server-side, no se pasa a LLMs
  intentosRegistrados: []  // para idempotencia de timestamp
}
```

**Escala logMAR:** 0.3 → 0.2 → 0.1 → 0.0 (letras Sloan: C, D, F, H, K, N, O, R, S, T, V, Z)  
**Cierre ojo R→L:** cuando `contadoresLogmarActual.correcto >= 2` en el logMAR actual de R  
**Fin de examen:** cuando `contadoresLogmarActual.correcto >= 2` en el logMAR actual de L

---

## Dispositivos MQTT

`ejecutarAcciones.js` traduce el array `acciones[]` de la propuesta del protocolo a comandos MQTT.

| Acción | Topic | Payload |
|--------|-------|---------|
| `mover_foroptero` | `MQTT_TOPIC_CMD` | `{ R: { esfera, cilindro, angulo, occlusion }, L: { occlusion } }` |
| `mostrar_optotipo` | `MQTT_TOPIC_PANTALLA` | `{ letra, logmar }` |

Broker: HiveMQ público por defecto. El foróptero y la TV (ESP32) suscriben a sus topics.

---

## Fallbacks

| Situación | Fallback | Mensaje al paciente |
|-----------|---------|---------------------|
| Auditor rechaza tras reintento (respuesta clínica clara) | `fallback_auditoria` | "Un momento, estoy ajustando el examen..." |
| Auditor rechaza tras reintento (respuesta ambigua) | `fallback_repregunta` | "No llegué a entender bien la letra..." |
| Bootstrap falla | `fallback_bootstrap` | "Hubo un problema al iniciar el examen..." |

Cuando hay fallback: `estadoPatch = {}` y `acciones = []` (sin cambios de dispositivo).

---

## Tests

```bash
cd reference/foroptero-orchestrator

npm run test:knowledge    # carga de manifest y knowledge files
npm run test:vistas       # schemas de vistas por agente
npm run test:registro     # tabla resultadosPorLogmar e idempotencia
```

Fixtures de QA manual para el auditor: `fixtures/auditor/AUD-01-*.json` … `AUD-14-*.json`.

---

## Cómo correr

```bash
cd reference/foroptero-orchestrator
cp .env.example .env      # configurar OPENAI_API_KEY (mínimo)
npm install
npm start                 # escucha en :3001

# Prueba sin voz:
BACKEND_URL=http://localhost:3001 npm run test:agent
```

Para despliegue en Railway: ver `reference/foroptero-orchestrator/README.md`.

---

## Knowledge — actualización sin redeploy

1. Hacer merge a `main` en el repo `Oftalm_agent_v2_prompts_knowledge`.
2. El webhook GitHub llama `POST /api/admin/webhook/knowledge` automáticamente.
3. O manualmente: `curl -X POST http://localhost:3001/api/admin/recargar-knowledge -H "Authorization: Bearer $KNOWLEDGE_RELOAD_TOKEN"`.
4. Verificar con `GET /api/health` → campo `knowledge.version`.
