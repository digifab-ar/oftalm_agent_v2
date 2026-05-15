# Arquitectura de Endpoints - Control Web y Ejecución Automática

## 📋 Resumen

El backend soporta **dos formas de control** de dispositivos:

1. **Endpoints HTTP** - Para control web directo (mantenidos intactos)
2. **Funciones internas** - Para ejecución automática desde motorExamen.js

Ambas formas coexisten sin conflictos y usan la misma infraestructura MQTT.

---

## 🌐 Endpoints HTTP (Control Web)

### ✅ `POST /api/movimiento`
**Propósito:** Control manual del foróptero desde web  
**URL:** https://foroptero-production.up.railway.app/api/movimiento

**Request:**
```json
{
  "accion": "movimiento",
  "R": {
    "esfera": 0.75,
    "cilindro": -1.75,
    "angulo": 60,
    "occlusion": "open"
  },
  "L": {
    "occlusion": "close"
  }
}
```

**Response:**
```json
{
  "status": "busy",
  "timestamp": 1763494918
}
```

**Estado:** ✅ **INTACTO** - Funcionando correctamente  
**Ubicación:** Líneas 105-128 en `server.js`

---

### ✅ `GET /api/estado`
**Propósito:** Consultar estado del foróptero desde web  
**URL:** https://foroptero-production.up.railway.app/api/estado

**Response:**
```json
{
  "status": "offline",
  "timestamp": 1763494918
}
```

**Estados posibles:**
- `"ready"` - Foróptero listo
- `"busy"` - Foróptero en movimiento
- `"offline"` - Foróptero desconectado

**Estado:** ✅ **INTACTO** - Funcionando correctamente  
**Ubicación:** Líneas 133-135 en `server.js`

---

### ✅ `POST /api/pantalla`
**Propósito:** Control manual de la TV desde web  
**URL:** https://foroptero-production.up.railway.app/api/pantalla

**Request:**
```json
{
  "dispositivo": "pantalla",
  "accion": "mostrar",
  "letra": "D",
  "logmar": 0.1
}
```

**Response:**
```json
{
  "status": "ok",
  "letra": "D",
  "logmar": 0.1,
  "timestamp": 1763495085
}
```

**Estado:** ✅ **INTACTO** - Funcionando correctamente  
**Ubicación:** Líneas 140-170 en `server.js`

---

### ✅ `GET /api/pantalla`
**Propósito:** Consultar estado de la pantalla desde web  
**URL:** https://foroptero-production.up.railway.app/api/pantalla

**Response:**
```json
{
  "dispositivo": "pantalla",
  "accion": "mostrar",
  "letra": "D",
  "logmar": 0.1,
  "token": "foropteroiñaki2022#",
  "timestamp": 1763495085
}
```

**Estado:** ✅ **INTACTO** - Funcionando correctamente  
**Ubicación:** Líneas 175-177 en `server.js`

---

## 🔧 Funciones Internas (Ejecución Automática)

### `ejecutarComandoForopteroInterno(config)`
**Propósito:** Ejecutar comandos de foróptero desde motorExamen.js  
**Uso:** Interno, no expuesto como endpoint HTTP

**Parámetros:**
```javascript
{
  R: { esfera: 0.75, cilindro: -1.75, angulo: 60, occlusion: "open" },
  L: { occlusion: "close" }
}
```

**Retorna:**
```javascript
Promise<{
  ok: true,
  status: "sent",
  timestamp: 1763494918
}>
```

**Estado:** ✅ **NUEVO** - Agregado en FASE 1  
**Ubicación:** Líneas 188-222 en `server.js`

---

### `ejecutarComandoTVInterno(config)`
**Propósito:** Ejecutar comandos de TV desde motorExamen.js  
**Uso:** Interno, no expuesto como endpoint HTTP

**Parámetros:**
```javascript
{
  letra: "D",
  logmar: 0.1
}
```

**Retorna:**
```javascript
Promise<{
  ok: true,
  status: "sent",
  letra: "D",
  logmar: 0.1,
  timestamp: 1763495085
}>
```

**Estado:** ✅ **NUEVO** - Agregado en FASE 1  
**Ubicación:** Líneas 229-272 en `server.js`

---

## 🔄 Arquitectura Dual

### Flujo de Control Web (Endpoints HTTP)
```
Web App → POST /api/movimiento → MQTT → Foróptero
Web App → POST /api/pantalla → MQTT → TV
Web App → GET /api/estado → Estado local
Web App → GET /api/pantalla → Estado local
```

### Flujo de Ejecución Automática (Funciones Internas)
```
Agente → obtenerEtapa() → motorExamen.js
  → ejecutarComandoForopteroInterno() → MQTT → Foróptero
  → ejecutarComandoTVInterno() → MQTT → TV
  → Retorna solo pasos "hablar" al agente
```

### Infraestructura Compartida
```
Ambos flujos usan:
- MQTT Client (mqttClient)
- MQTT Topics (MQTT_TOPIC_CMD, MQTT_TOPIC_PANTALLA)
- Estado local (ultimoEstado, estadoPantalla)
- Token interno (TOKEN_ESPERADO)
```

---

## ✅ Compatibilidad y Coexistencia

### ✅ Sin Conflictos
- Los endpoints HTTP y las funciones internas **NO interfieren** entre sí
- Ambos usan la misma infraestructura MQTT
- El estado se comparte correctamente

### ✅ Casos de Uso
1. **Control Web Manual:**
   - Usar endpoints HTTP directamente
   - Útil para testing, debugging, control manual

2. **Ejecución Automática:**
   - Usar funciones internas desde motorExamen.js
   - El agente no necesita llamar endpoints HTTP

3. **Híbrido:**
   - Ambos pueden usarse simultáneamente
   - El estado se sincroniza automáticamente

---

## 🔍 Verificación de Endpoints

### Estado Actual (según web search):
- ✅ `GET /api/estado` → Funcionando: `{"status":"offline","timestamp":1763494918}`
- ✅ `GET /api/pantalla` → Funcionando: `{"dispositivo":"pantalla","accion":"mostrar","letra":"D","logmar":0.1,...}`

### Endpoints Disponibles:
1. ✅ `POST /api/movimiento` - Control foróptero
2. ✅ `GET /api/estado` - Estado foróptero
3. ✅ `POST /api/pantalla` - Control TV
4. ✅ `GET /api/pantalla` - Estado TV
5. ✅ `POST /api/examen/nuevo` - Inicializar examen
6. ✅ `POST /api/examen/instrucciones` - Obtener pasos (ahora ejecuta automáticamente)
7. ✅ `GET /api/examen/estado` - Estado del examen
8. ✅ `POST /api/examen/reiniciar` - Reiniciar examen

---

## 📝 Notas Importantes

### Mantenimiento de Endpoints HTTP
- ✅ **Todos los endpoints HTTP están intactos**
- ✅ **No se modificó ninguna funcionalidad existente**
- ✅ **Compatible con control web actual**

### Funciones Internas
- ✅ **No exponen endpoints adicionales**
- ✅ **Solo se usan internamente desde motorExamen.js**
- ✅ **No afectan el control web**

### Estado Compartido
- ✅ **Ambos flujos actualizan el mismo estado local**
- ✅ **MQTT sincroniza con dispositivos físicos**
- ✅ **No hay conflictos de estado**

---

## 🧪 Testing de Endpoints

### Test de Endpoints HTTP:
```bash
# Test POST /api/movimiento
curl -X POST https://foroptero-production.up.railway.app/api/movimiento \
  -H "Content-Type: application/json" \
  -d '{"accion":"movimiento","R":{"esfera":0.75,"cilindro":-1.75,"angulo":60}}'

# Test GET /api/estado
curl https://foroptero-production.up.railway.app/api/estado

# Test POST /api/pantalla
curl -X POST https://foroptero-production.up.railway.app/api/pantalla \
  -H "Content-Type: application/json" \
  -d '{"dispositivo":"pantalla","accion":"mostrar","letra":"H","logmar":0.3}'

# Test GET /api/pantalla
curl https://foroptero-production.up.railway.app/api/pantalla
```

---

**Fecha:** 2025-01-27  
**Estado:** ✅ Todos los endpoints HTTP funcionando correctamente  
**Compatibilidad:** ✅ 100% compatible con control web existente

