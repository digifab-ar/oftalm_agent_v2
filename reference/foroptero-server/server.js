import express from "express";
import mqtt from "mqtt";
import cors from "cors";
import {
  inicializarExamen,
  obtenerInstrucciones,
  obtenerEstado,
  obtenerDetalleExamen,
  inicializarEjecutores,
  generarRegistroExamenCsv,
  registrarPasosOftalmologoDesdeRespuesta
} from "./motorExamen.js";

// ============================================================
// CONFIGURACIÓN GENERAL
// ============================================================
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Broker MQTT público HiveMQ
const MQTT_SERVER = "mqtt://broker.hivemq.com";

// Tópicos específicos
const MQTT_TOPIC_CMD = "foroptero01/cmd";       // comandos al ESP32
const MQTT_TOPIC_STATE = "foroptero01/state";   // estado publicado por el ESP32
const MQTT_TOPIC_PANTALLA = "foroptero01/pantalla"; // comandos a la pantalla

// Token interno (no se expone en las llamadas del GPT)
const TOKEN_ESPERADO = "foropteroiñaki2022#";

// Configuración de timeout para detección de offline
const TIMEOUT_OFFLINE_MS = 90 * 1000; // 1:30 min en milisegundos
const INTERVALO_CHECK_MS = 60 * 1000; // 1 minuto en milisegundos

// Estado local
let ultimoEstado = { 
  status: "offline", 
  timestamp: Math.floor(Date.now() / 1000) 
};
let estadoPantalla = { letra: null, logmar: null, timestamp: null };
let ultimoHeartbeatTimestamp = null; // null = nunca recibido mensaje

// ============================================================
// CONEXIÓN MQTT
// ============================================================
const mqttClient = mqtt.connect(MQTT_SERVER);

mqttClient.on("connect", () => {
  console.log("✅ Conectado al broker MQTT");
  mqttClient.subscribe(MQTT_TOPIC_STATE);
  mqttClient.subscribe(MQTT_TOPIC_PANTALLA);
});

mqttClient.on("message", (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    if (topic === MQTT_TOPIC_STATE) {
      // Solo actualizar si el estado es "ready" o "busy" (heartbeat válido)
      if (data.status === "ready" || data.status === "busy") {
        ultimoHeartbeatTimestamp = Date.now();
        ultimoEstado = data;
        console.log("📡 Estado foróptero recibido:", data);
      }
    } else if (topic === MQTT_TOPIC_PANTALLA) {
      estadoPantalla = data;
      console.log("📺 Estado pantalla recibido:", data);
    }
  } catch (err) {
    console.error("⚠️ Error al parsear mensaje MQTT:", err.message);
  }
});

// ============================================================
// FUNCIÓN: Verificación de timeout para detección de offline
// ============================================================
function checkHeartbeatTimeout() {
  if (ultimoHeartbeatTimestamp === null) {
    // Nunca se recibió un mensaje, mantener offline
    if (ultimoEstado.status !== "offline") {
      ultimoEstado = {
        status: "offline",
        timestamp: Math.floor(Date.now() / 1000)
      };
    }
    return;
  }
  
  const tiempoTranscurrido = Date.now() - ultimoHeartbeatTimestamp;
  
  if (tiempoTranscurrido > TIMEOUT_OFFLINE_MS) {
    if (ultimoEstado.status !== "offline") {
      ultimoEstado = {
        status: "offline",
        timestamp: Math.floor(Date.now() / 1000)
      };
      console.log("⚠️ Foróptero marcado como OFFLINE (sin heartbeat por más de 90s)");
    }
  }
}

// ============================================================
// ENDPOINT: /api/movimiento (sin token público)
// Acepta acciones: "movimiento" y "home"
// ============================================================
app.post("/api/movimiento", (req, res) => {
  const { accion, R, L } = req.body;

  // --- Validaciones básicas ---
  if (!accion || (accion !== "movimiento" && accion !== "home"))
    return res.status(400).json({ error: "Acción inválida. Debe ser 'movimiento' o 'home'" });

  if (!R && !L)
    return res.status(400).json({ error: "Debe incluir al menos R o L" });

  // --- Construir comando con token interno ---
  const comando = {
    accion,
    ...(R && { R }),
    ...(L && { L }),
    token: TOKEN_ESPERADO,
    timestamp: Math.floor(Date.now() / 1000)
  };

  mqttClient.publish(MQTT_TOPIC_CMD, JSON.stringify(comando));
  console.log("📤 Comando MQTT → foróptero:", comando);

  res.json({ status: "busy", timestamp: comando.timestamp });
});

// ============================================================
// ENDPOINT: /api/estado
// ============================================================
app.get("/api/estado", (req, res) => {
  res.json(ultimoEstado);
});

// ============================================================
// ENDPOINT: /api/pantalla (sin token público)
// ============================================================
app.post("/api/pantalla", (req, res) => {
  const { dispositivo, accion, letra, logmar } = req.body;

  if (dispositivo !== "pantalla" || accion !== "mostrar")
    return res.status(400).json({ error: "Acción o dispositivo inválido" });

  const comandoPantalla = {
    dispositivo,
    accion,
    letra,
    logmar,
    token: TOKEN_ESPERADO,
    timestamp: Math.floor(Date.now() / 1000)
  };

  mqttClient.publish(MQTT_TOPIC_PANTALLA, JSON.stringify(comandoPantalla));
  console.log("📤 Comando MQTT → pantalla:", comandoPantalla);

  estadoPantalla = {
    letra,
    logmar,
    timestamp: comandoPantalla.timestamp
  };

  res.json({
    status: "ok",
    letra,
    logmar,
    timestamp: comandoPantalla.timestamp
  });
});

// ============================================================
// ENDPOINT: /api/pantalla (GET)
// ============================================================
app.get("/api/pantalla", (req, res) => {
  res.json(estadoPantalla);
});

// ============================================================
// FUNCIONES INTERNAS: Ejecución directa de comandos
// (Para uso desde motorExamen.js, sin pasar por HTTP)
// ============================================================

/**
 * Ejecuta comando de foróptero internamente (sin endpoint HTTP)
 * @param {object} config - Configuración { R?: {...}, L?: {...} }
 * @returns {Promise<object>} - Resultado de la ejecución
 */
export async function ejecutarComandoForopteroInterno(config) {
  return new Promise((resolve) => {
    const { R, L } = config;
    
    // Validar que al menos uno tenga configuración
    if (!R && !L) {
      resolve({ 
        ok: false, 
        error: 'Debe incluir al menos R o L' 
      });
      return;
    }
    
    // Construir comando con token interno
    const comando = {
      accion: 'movimiento',
      ...(R && { R }),
      ...(L && { L }),
      token: TOKEN_ESPERADO,
      timestamp: Math.floor(Date.now() / 1000)
    };
    
    // Publicar comando MQTT
    mqttClient.publish(MQTT_TOPIC_CMD, JSON.stringify(comando));
    console.log("📤 [INTERNO] Comando MQTT → foróptero:", comando);
    
    // Retornar inmediatamente (no esperamos confirmación para no bloquear)
    // El comando se envió, el dispositivo lo procesará
    resolve({ 
      ok: true, 
      status: 'sent', 
      timestamp: comando.timestamp 
    });
  });
}

/**
 * Obtiene el estado actual del foróptero
 * @returns {object} - Estado del foróptero { status: 'ready' | 'busy' | 'offline', ... }
 */
export function obtenerEstadoForoptero() {
  return { ...ultimoEstado };
}

/**
 * Ejecuta comando de TV internamente (sin endpoint HTTP)
 * @param {object} config - Configuración { letra: string, logmar: number }
 * @returns {Promise<object>} - Resultado de la ejecución
 */
export async function ejecutarComandoTVInterno(config) {
  return new Promise((resolve) => {
    const { letra, logmar } = config;
    
    // Validar parámetros
    if (!letra || logmar === undefined) {
      resolve({ 
        ok: false, 
        error: 'Debe incluir letra y logmar' 
      });
      return;
    }
    
    // Construir comando con token interno
    const comandoPantalla = {
      dispositivo: 'pantalla',
      accion: 'mostrar',
      letra,
      logmar,
      token: TOKEN_ESPERADO,
      timestamp: Math.floor(Date.now() / 1000)
    };
    
    // Publicar comando MQTT
    mqttClient.publish(MQTT_TOPIC_PANTALLA, JSON.stringify(comandoPantalla));
    console.log("📤 [INTERNO] Comando MQTT → pantalla:", comandoPantalla);
    
    // Actualizar estado local
    estadoPantalla = {
      letra,
      logmar,
      timestamp: comandoPantalla.timestamp
    };
    
    // Retornar inmediatamente
    resolve({ 
      ok: true, 
      status: 'sent', 
      letra, 
      logmar, 
      timestamp: comandoPantalla.timestamp 
    });
  });
}

// ============================================================
// ENDPOINTS: Motor de Examen Visual
// ============================================================

// POST /api/examen/nuevo - Inicializar examen
app.post("/api/examen/nuevo", (req, res) => {
  try {
    const estado = inicializarExamen();
    res.json({
      ok: true,
      mensaje: "Examen inicializado",
      estado: estado
    });
  } catch (error) {
    console.error("❌ Error inicializando examen:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Error al inicializar examen"
    });
  }
});

// POST /api/examen/instrucciones - Obtener pasos a ejecutar
app.post("/api/examen/instrucciones", async (req, res) => {
  try {
    const { respuestaPaciente, interpretacionAgudeza, interpretacionComparacion } = req.body;
    
    // Si hay interpretación de agudeza o comparación, pasarla al procesamiento
    // Nota: obtenerInstrucciones ahora es async y ejecuta comandos automáticamente
    const resultado = await obtenerInstrucciones(
      respuestaPaciente || null,
      interpretacionAgudeza || null,
      interpretacionComparacion || null
    );
    
    if (!resultado.ok) {
      return res.status(400).json(resultado);
    }

    registrarPasosOftalmologoDesdeRespuesta(resultado);
    res.json(resultado);
  } catch (error) {
    console.error("❌ Error obteniendo instrucciones:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Error al obtener instrucciones"
    });
  }
});

// GET /api/examen/estado - Consultar estado actual
app.get("/api/examen/estado", (req, res) => {
  try {
    const resultado = obtenerEstado();
    res.json(resultado);
  } catch (error) {
    console.error("❌ Error obteniendo estado:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Error al obtener estado"
    });
  }
});

// GET /api/examen/registro.csv — POC: registro del examen en curso (PLAN_POC_REGISTRO_EXAMEN_CSV)
app.get("/api/examen/registro.csv", (req, res) => {
  try {
    const csv = generarRegistroExamenCsv();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="examen-registro-${stamp}.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error("❌ Error generando registro CSV:", error);
    res.status(500).send("Error al generar CSV");
  }
});

// GET /api/examen/detalle - Consultar detalle completo del examen
app.get("/api/examen/detalle", (req, res) => {
  try {
    const resultado = obtenerDetalleExamen();
    res.json(resultado);
  } catch (error) {
    console.error("❌ Error obteniendo detalle del examen:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Error al obtener detalle del examen"
    });
  }
});

// POST /api/examen/reiniciar - Reiniciar examen (vuelve a etapa 1)
app.post("/api/examen/reiniciar", (req, res) => {
  try {
    const modosPermitidos = ['normal', 'testesf', 'testcil', 'testbin'];
    const modoSolicitado = req.body?.modo;
    const modoFinal = modoSolicitado ?? 'normal';

    if (!modosPermitidos.includes(modoFinal)) {
      return res.status(400).json({
        ok: false,
        error: `Modo inválido. Debe ser uno de: ${modosPermitidos.join(', ')}`
      });
    }

    const estado = inicializarExamen(modoFinal);
    const mensajeModo = modoFinal === 'normal'
      ? 'Perfecto, vamos a reiniciar el examen.'
      : `Perfecto, reiniciamos en modo de prueba ${modoFinal}.`;

    const payload = {
      ok: true,
      mensaje: "Examen reiniciado",
      estado: estado,
      pasos: [
        {
          tipo: 'hablar',
          orden: 1,
          mensaje: `${mensajeModo} Escribí los valores del autorefractómetro. Ejemplo: <R> +0.75 , -1.75 , 60 / <L> +2.75 , 0.00 , 0`
        }
      ]
    };
    registrarPasosOftalmologoDesdeRespuesta(payload);
    res.json(payload);
  } catch (error) {
    console.error("❌ Error reiniciando examen:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Error al reiniciar examen"
    });
  }
});

// ============================================================
// SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 Backend Foróptero corriendo en puerto ${PORT}`);
  console.log(`MQTT CMD → ${MQTT_TOPIC_CMD}`);
  console.log(`MQTT STATE → ${MQTT_TOPIC_STATE}`);
  console.log(`MQTT PANTALLA → ${MQTT_TOPIC_PANTALLA}`);
  
  // Inicializar ejecutores internos en motorExamen.js
  inicializarEjecutores(
    ejecutarComandoForopteroInterno,
    ejecutarComandoTVInterno,
    obtenerEstadoForoptero
  );
  
  // Inicializar verificación periódica de heartbeat
  setInterval(checkHeartbeatTimeout, INTERVALO_CHECK_MS);
  console.log(`⏱️ Verificación de heartbeat cada ${INTERVALO_CHECK_MS / 1000}s, timeout: ${TIMEOUT_OFFLINE_MS / 1000}s`);
});

