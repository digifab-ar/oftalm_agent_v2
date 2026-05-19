import 'dotenv/config';
import express from 'express';
import mqtt from 'mqtt';
import cors from 'cors';
import {
  inicializarExamen,
  examenIniciado,
  obtenerEstadoExamen,
  obtenerDetalleExamen,
  generarRegistroCsv
} from './estadoExamen.js';
import { procesarTurno } from './orquestadorExamen.js';
import { inicializarEjecutores } from './ejecutarAcciones.js';
import { AGENT_MODELS } from './lib/agentModels.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const MQTT_SERVER = process.env.MQTT_SERVER || 'mqtt://broker.hivemq.com';
const MQTT_TOPIC_CMD = process.env.MQTT_TOPIC_CMD || 'foroptero01/cmd';
const MQTT_TOPIC_STATE = process.env.MQTT_TOPIC_STATE || 'foroptero01/state';
const MQTT_TOPIC_PANTALLA =
  process.env.MQTT_TOPIC_PANTALLA || 'foroptero01/pantalla';
const TOKEN_ESPERADO = process.env.TOKEN_ESPERADO || 'foropteroiñaki2022#';
const TIMEOUT_OFFLINE_MS = 90 * 1000;
const INTERVALO_CHECK_MS = 60 * 1000;

let ultimoEstado = {
  status: 'offline',
  timestamp: Math.floor(Date.now() / 1000)
};
let estadoPantalla = { letra: null, logmar: null, timestamp: null };
let ultimoHeartbeatTimestamp = null;

const mqttClient = mqtt.connect(MQTT_SERVER);

mqttClient.on('connect', () => {
  console.log('✅ MQTT conectado');
  mqttClient.subscribe(MQTT_TOPIC_STATE);
  mqttClient.subscribe(MQTT_TOPIC_PANTALLA);
});

mqttClient.on('message', (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    if (topic === MQTT_TOPIC_STATE) {
      if (data.status === 'ready' || data.status === 'busy') {
        ultimoHeartbeatTimestamp = Date.now();
        ultimoEstado = data;
      }
    } else if (topic === MQTT_TOPIC_PANTALLA) {
      estadoPantalla = data;
    }
  } catch (err) {
    console.error('⚠️ MQTT parse:', err.message);
  }
});

function checkHeartbeatTimeout() {
  if (ultimoHeartbeatTimestamp === null) {
    if (ultimoEstado.status !== 'offline') {
      ultimoEstado = {
        status: 'offline',
        timestamp: Math.floor(Date.now() / 1000)
      };
    }
    return;
  }
  if (Date.now() - ultimoHeartbeatTimestamp > TIMEOUT_OFFLINE_MS) {
    if (ultimoEstado.status !== 'offline') {
      ultimoEstado = {
        status: 'offline',
        timestamp: Math.floor(Date.now() / 1000)
      };
    }
  }
}

export async function ejecutarComandoForopteroInterno(config) {
  const { R, L } = config;
  if (!R && !L) {
    return { ok: false, error: 'Debe incluir al menos R o L' };
  }
  const comando = {
    accion: 'movimiento',
    ...(R && { R }),
    ...(L && { L }),
    token: TOKEN_ESPERADO,
    timestamp: Math.floor(Date.now() / 1000)
  };
  mqttClient.publish(MQTT_TOPIC_CMD, JSON.stringify(comando));
  console.log('📤 Foróptero:', comando);
  return { ok: true, status: 'sent', timestamp: comando.timestamp };
}

export async function ejecutarComandoTVInterno(config) {
  const { letra, logmar } = config;
  if (!letra || logmar === undefined) {
    return { ok: false, error: 'Debe incluir letra y logmar' };
  }
  const comandoPantalla = {
    dispositivo: 'pantalla',
    accion: 'mostrar',
    letra,
    logmar,
    token: TOKEN_ESPERADO,
    timestamp: Math.floor(Date.now() / 1000)
  };
  mqttClient.publish(MQTT_TOPIC_PANTALLA, JSON.stringify(comandoPantalla));
  estadoPantalla = { letra, logmar, timestamp: comandoPantalla.timestamp };
  console.log('📤 TV:', comandoPantalla);
  return { ok: true, status: 'sent', letra, logmar };
}

// --- Dispositivos HTTP (manual / debug) ---

app.post('/api/movimiento', (req, res) => {
  const { accion, R, L } = req.body;
  if (!accion || (accion !== 'movimiento' && accion !== 'home')) {
    return res.status(400).json({ error: "Acción inválida" });
  }
  if (!R && !L) {
    return res.status(400).json({ error: 'Debe incluir R o L' });
  }
  const comando = {
    accion,
    ...(R && { R }),
    ...(L && { L }),
    token: TOKEN_ESPERADO,
    timestamp: Math.floor(Date.now() / 1000)
  };
  mqttClient.publish(MQTT_TOPIC_CMD, JSON.stringify(comando));
  res.json({ status: 'busy', timestamp: comando.timestamp });
});

app.get('/api/estado', (req, res) => {
  res.json(ultimoEstado);
});

app.post('/api/pantalla', (req, res) => {
  const { dispositivo, accion, letra, logmar } = req.body;
  if (dispositivo !== 'pantalla' || accion !== 'mostrar') {
    return res.status(400).json({ error: 'Dispositivo o acción inválido' });
  }
  ejecutarComandoTVInterno({ letra, logmar }).then((r) => res.json(r));
});

app.get('/api/pantalla', (req, res) => {
  res.json(estadoPantalla);
});

// --- Examen (orquestador) ---

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    servicio: 'foroptero-orchestrator',
    examenIniciado: examenIniciado(),
    openai: Boolean(process.env.OPENAI_API_KEY)
  });
});

app.post('/api/examen/nuevo', (req, res) => {
  try {
    const rx = req.body?.rx;
    const estado = inicializarExamen(rx);
    res.json({ ok: true, mensaje: 'Examen inicializado', estado });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/examen/turno', async (req, res) => {
  try {
    if (!examenIniciado()) {
      inicializarExamen(req.body?.rx);
    }

    const { respuestaPaciente, confianza, timestamp } = req.body ?? {};
    const tieneRespuesta =
      respuestaPaciente != null && String(respuestaPaciente).trim() !== '';

    const resultado = await procesarTurno(
      tieneRespuesta ? String(respuestaPaciente).trim() : null,
      confianza,
      {
        timestamp:
          timestamp != null && String(timestamp).trim() !== ''
            ? String(timestamp).trim()
            : new Date().toISOString()
      }
    );

    if (!resultado.ok) {
      return res.status(400).json(resultado);
    }

    res.json(resultado);
  } catch (error) {
    console.error('❌ /api/examen/turno:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/examen/estado', (req, res) => {
  const resultado = obtenerEstadoExamen();
  if (!resultado.ok) {
    return res.status(404).json(resultado);
  }
  res.json(resultado);
});

app.get('/api/examen/detalle', (req, res) => {
  const resultado = obtenerDetalleExamen();
  if (!resultado.ok) {
    return res.status(404).json(resultado);
  }
  res.json(resultado);
});

app.get('/api/examen/registro.csv', (req, res) => {
  const csv = generarRegistroCsv();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="examen-orquestador-${stamp}.csv"`
  );
  res.send(csv);
});

app.listen(PORT, () => {
  console.log(`🚀 Foróptero Orchestrator en puerto ${PORT}`);
  for (const [id, cfg] of Object.entries(AGENT_MODELS)) {
    const r = cfg.reasoning ? `, reasoning=${cfg.reasoning}` : '';
    console.log(`   ${id}: ${cfg.model}${r}`);
  }

  inicializarEjecutores(
    ejecutarComandoForopteroInterno,
    ejecutarComandoTVInterno
  );

  setInterval(checkHeartbeatTimeout, INTERVALO_CHECK_MS);
});
