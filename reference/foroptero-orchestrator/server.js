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
import {
  asegurarKnowledgeRepo,
  recargarKnowledgeRepo,
  obtenerBootstrapInfo
} from './lib/knowledgeBootstrap.js';
import { obtenerInfoKnowledge } from './lib/knowledge.js';
import {
  bearerMatches,
  verifyGithubWebhookSignature,
  isPushToMain
} from './lib/knowledgeAdmin.js';

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3001;
const MQTT_SERVER = process.env.MQTT_SERVER || 'mqtt://broker.hivemq.com';
const MQTT_TOPIC_CMD = process.env.MQTT_TOPIC_CMD || 'foroptero01/cmd';
const MQTT_TOPIC_STATE = process.env.MQTT_TOPIC_STATE || 'foroptero01/state';
const MQTT_TOPIC_PANTALLA =
  process.env.MQTT_TOPIC_PANTALLA || 'foroptero01/pantalla';
const TOKEN_ESPERADO = process.env.TOKEN_ESPERADO || 'foropteroiñaki2022#';
const KNOWLEDGE_RELOAD_TOKEN = process.env.KNOWLEDGE_RELOAD_TOKEN ?? '';
const KNOWLEDGE_GITHUB_WEBHOOK_SECRET =
  process.env.KNOWLEDGE_GITHUB_WEBHOOK_SECRET ?? '';
const KNOWLEDGE_WEBHOOK_ENABLED =
  process.env.KNOWLEDGE_WEBHOOK_ENABLED !== 'false';
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

function knowledgeHealthPayload() {
  try {
    return {
      ...obtenerInfoKnowledge(),
      ...obtenerBootstrapInfo()
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function handleRecargarKnowledge(req, res) {
  if (!KNOWLEDGE_RELOAD_TOKEN.trim()) {
    return res.status(503).json({
      ok: false,
      error: 'KNOWLEDGE_RELOAD_TOKEN no configurado'
    });
  }
  if (!bearerMatches(req, KNOWLEDGE_RELOAD_TOKEN)) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  try {
    const result = await recargarKnowledgeRepo();
    if (!result.ok) {
      return res.status(409).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('❌ recargar-knowledge:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// --- Dispositivos HTTP (manual / debug) ---

app.use(express.json());

app.post('/api/movimiento', (req, res) => {
  const { accion, R, L } = req.body;
  if (!accion || (accion !== 'movimiento' && accion !== 'home')) {
    return res.status(400).json({ error: 'Acción inválida' });
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

// --- Knowledge admin ---

app.post('/api/admin/recargar-knowledge', handleRecargarKnowledge);

app.post(
  '/api/admin/webhook/knowledge',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    if (!KNOWLEDGE_WEBHOOK_ENABLED) {
      return res.status(404).json({ ok: false, error: 'Webhook deshabilitado' });
    }

    const rawBody = req.body;
    const sig = req.headers['x-hub-signature-256'];
    let authorized = false;

    if (KNOWLEDGE_GITHUB_WEBHOOK_SECRET.trim()) {
      authorized = verifyGithubWebhookSignature(
        rawBody,
        sig,
        KNOWLEDGE_GITHUB_WEBHOOK_SECRET
      );
    }
    if (!authorized && KNOWLEDGE_RELOAD_TOKEN.trim()) {
      authorized = bearerMatches(req, KNOWLEDGE_RELOAD_TOKEN);
    }

    if (!authorized) {
      return res.status(401).json({ ok: false, error: 'No autorizado' });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ ok: false, error: 'JSON inválido' });
    }

    if (payload.ref && !isPushToMain(payload)) {
      return res.json({ ok: true, skipped: true, reason: 'not main' });
    }

    try {
      const result = await recargarKnowledgeRepo();
      if (!result.ok) {
        return res.status(409).json(result);
      }
      console.log('🔔 Webhook knowledge: recarga OK', result.knowledge?.version);
      return res.json(result);
    } catch (err) {
      console.error('❌ webhook knowledge:', err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }
);

// --- Examen (orquestador) ---

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    servicio: 'foroptero-orchestrator',
    examenIniciado: examenIniciado(),
    openai: Boolean(process.env.OPENAI_API_KEY),
    knowledge: knowledgeHealthPayload()
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

async function start() {
  try {
    await asegurarKnowledgeRepo({ pull: Boolean(process.env.KNOWLEDGE_GIT_URL?.trim()) });
  } catch (err) {
    console.error('❌ Knowledge bootstrap:', err.message);
    process.exit(1);
  }

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
}

start();
