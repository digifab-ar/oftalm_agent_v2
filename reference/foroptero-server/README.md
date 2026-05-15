# Referencia: Servidor Foróptero MQTT

Este directorio contiene archivos de referencia del servidor MQTT que orquesta la comunicación con el foróptero digital.

## Archivos

- `server.js` - Servidor Express que orquesta MQTT y expone endpoints HTTP
- `motorExamen.js` - Motor de examen visual (state machine)
- `package.json` - Dependencias del servidor MQTT

## Endpoints del Servidor

### POST /api/movimiento
Envía comandos de movimiento al foróptero vía MQTT.

**Request:**
```json
{
  "accion": "movimiento" | "home",
  "R": { "sphere": 0.75, "cylinder": -1.75, "axis": 60 },
  "L": { "sphere": 2.75, "cylinder": 0.00, "axis": 0 }
}
```

**Response:**
```json
{
  "status": "busy",
  "timestamp": 1234567890
}
```

### GET /api/estado
Obtiene el estado actual del foróptero.

**Response:**
```json
{
  "status": "ready" | "busy" | "offline",
  "timestamp": 1234567890
}
```

### POST /api/pantalla
Envía comandos a la pantalla vía MQTT.

**Request:**
```json
{
  "dispositivo": "pantalla",
  "accion": "mostrar",
  "letra": "A",
  "logmar": 0.0
}
```

**Response:**
```json
{
  "status": "ok",
  "letra": "A",
  "logmar": 0.0,
  "timestamp": 1234567890
}
```

### GET /api/pantalla
Obtiene el estado actual de la pantalla.

**Response:**
```json
{
  "letra": "A",
  "logmar": 0.0,
  "timestamp": 1234567890
}
```

### POST /api/examen/nuevo
Inicializa un nuevo examen visual.

**Response:**
```json
{
  "ok": true,
  "mensaje": "Examen inicializado",
  "estado": { ... }
}
```

### POST /api/examen/instrucciones
Obtiene los pasos que el agente debe ejecutar.

**Garantía ETAPA_5:** en tests de lentes (`ETAPA_5`), el backend siempre devuelve al menos un paso `hablar` con la pregunta de comparación (`Ves mejor con este o con el anterior?`), incluso en transiciones internas como `esferico_grueso` → `esferico_fino`.

**Request:**
```json
{
  "respuestaPaciente": "<R> +0.75 , -1.75 , 60 / <L> +2.75 , 0.00 , 0"
}
```

**Response:**
```json
{
  "ok": true,
  "pasos": [
    {
      "tipo": "hablar",
      "orden": 1,
      "mensaje": "..."
    }
  ],
  "contexto": { ... }
}
```

### GET /api/examen/estado
Obtiene el estado actual del examen.

**Response:**
```json
{
  "ok": true,
  "estado": {
    "etapa": "ETAPA_1",
    "ojoActual": "R",
    "progreso": 20
  }
}
```

### POST /api/examen/reiniciar
Reinicia el examen desde el principio.

**Body opcional (JSON):**
```json
{ "modo": "normal" }
```
Valores permitidos para `modo`: `normal`, `testesf`, `testcil`, `testbin`. Si se omite el body o el campo `modo`, equivale a `normal`. Modo inválido → `400`.

**Response:**
```json
{
  "ok": true,
  "mensaje": "Examen reiniciado",
  "estado": { ... },
  "pasos": [
    {
      "tipo": "hablar",
      "orden": 1,
      "mensaje": "..."
    }
  ]
}
```

### GET /api/examen/detalle
Obtiene el detalle completo del examen, incluyendo valores iniciales, recalculados, secuencia de tests y resultados.

**Response:**
```json
{
  "ok": true,
  "detalle": {
    "modo": "normal",
    "valoresIniciales": {
      "R": { "esfera": 0.75, "cilindro": -1.75, "angulo": 60 },
      "L": { "esfera": 2.75, "cilindro": 0.00, "angulo": 0 }
    },
    "valoresRecalculados": {
      "R": { "esfera": 0.75, "cilindro": -1.25, "angulo": 60 },
      "L": { "esfera": 2.75, "cilindro": 0.00, "angulo": 0 }
    },
    "tests": [
      {
        "indice": 0,
        "tipo": "esferico_grueso",
        "ojo": "R",
        "estado": "en_curso",
        "resultado": null
      }
    ],
    "resultados": {
      "R": {
        "agudezaInicial": null,
        "esfericoGrueso": null,
        "esfericoFino": null,
        "cilindrico": null,
        "cilindricoAngulo": null,
        "agudezaAlcanzada": null
      },
      "L": { ... }
    },
    "estadoActual": {
      "etapa": "ETAPA_5",
      "ojoActual": "R",
      "testActual": { "tipo": "esferico_grueso", "ojo": "R" },
      "indiceActual": 0,
      "progreso": 50
    },
    "timestamps": {
      "iniciado": 1234567890,
      "finalizado": null
    }
  }
}
```

## Configuración MQTT

- **Broker:** `mqtt://broker.hivemq.com`
- **Tópicos:**
  - `foroptero01/cmd` - Comandos al ESP32
  - `foroptero01/state` - Estado publicado por el ESP32
  - `foroptero01/pantalla` - Comandos a la pantalla


## Ejecución Automática de Comandos

El backend ejecuta automáticamente todos los comandos de dispositivos (foróptero y TV) cuando el agente llama a `/api/examen/instrucciones`. El agente solo recibe pasos de tipo "hablar" para ejecutar.

**Flujo:**
1. Agente llama `obtenerEtapa()` → Backend genera pasos
2. Backend ejecuta automáticamente: foróptero → TV → esperar
3. Backend retorna solo pasos de tipo "hablar" al agente
4. Agente habla al paciente usando el mensaje exacto

**Nota ETAPA_5:** nunca retorna `pasos` vacío; siempre incluye una pregunta de comparación para mantener el flujo conversacional del agente.

**Tipos de pasos:**
- `foroptero` - Ejecutado automáticamente por el backend
- `tv` - Ejecutado automáticamente por el backend
- `esperar` - Ejecutado automáticamente por el backend
- `hablar` - Único tipo retornado al agente para ejecutar

## Motor de Examen

El archivo `motorExamen.js` contiene la lógica completa del examen visual implementada como state machine:

**Etapas:**
- `INICIO` - Estado inicial
- `ETAPA_1` - Recolección de valores iniciales del autorefractómetro
- `ETAPA_2` - Recálculo cilíndrico y esférico (silencioso)
  - Aplica reglas de recálculo según protocolo clínico
  - Recálculo esférico: valores negativos se mantienen igual, valores positivos según rangos específicos
  - Recálculo cilíndrico: aplica ajustes según rangos de valores
- `ETAPA_3` - Generación de secuencia y preparación
- `ETAPA_4` - Tests de agudeza visual (inicial y alcanzada por ojo)
- `ETAPA_5` - Tests de lentes (esférico grueso, fino, cilíndrico, cilíndrico ángulo)
- `ETAPA_6` - Examen binocular (ajuste final con ambos ojos; ver `DEFINICIONES_EXAMEN_BINOCULAR.md`)
- `FINALIZADO` - Examen completado

**Estado actual:** ETAPA_2 implementada (recálculo esférico y cilíndrico). ETAPA_4 implementada (agudeza inicial y agudeza alcanzada). ETAPA_5 implementada (todos los tests de lentes). **ETAPA_6** implementada (binocular: transición *listo*, comparaciones esférica/cilíndrica con variante aplicada antes del mensaje al paciente).

## Notas

- El servidor detecta automáticamente cuando el foróptero está offline (sin heartbeat por más de 90 segundos)
- El token interno `foropteroiñaki2022#` se agrega automáticamente a los comandos MQTT
- El servidor está desplegado en Railway en: `https://foroptero-production.up.railway.app`
- Los endpoints HTTP de control web (`/api/movimiento`, `/api/pantalla`) se mantienen intactos para compatibilidad
- Las funciones internas (`ejecutarComandoForopteroInterno`, `ejecutarComandoTVInterno`) se usan para ejecución automática desde motorExamen.js

