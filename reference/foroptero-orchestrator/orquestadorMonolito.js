/**
 * Orquestador monolítico (legacy): un solo LLM con todo el knowledge.
 * Activar con OPENAI_USE_MONOLITH_ORCHESTRATOR=true
 */
import {
  aplicarEstadoPatch,
  obtenerEstadoParaOrquestador,
  registrarTurnoHistorial
} from './estadoExamen.js';
import { ejecutarAcciones } from './ejecutarAcciones.js';
import { llamarAgenteJson } from './lib/llmClient.js';
import { leerMarkdown } from './lib/knowledge.js';

const CONTEXTO_VOZ_VALIDOS = new Set([
  'inicio',
  'esperar_respuesta',
  'continuar_sin_respuesta'
]);

const ORQUESTADOR_SCHEMA = {
  type: 'object',
  properties: {
    mensajesPaciente: { type: 'array', items: { type: 'string' } },
    acciones: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dispositivo: { type: 'string', enum: ['foroptero', 'tv'] },
          config: {
            type: 'object',
            properties: {
              R: { type: 'object', additionalProperties: true },
              L: { type: 'object', additionalProperties: true }
            },
            additionalProperties: false
          },
          letra: { type: 'string' },
          logmar: { type: 'number' }
        },
        required: ['dispositivo'],
        additionalProperties: false
      }
    },
    estadoPatch: { type: 'object', additionalProperties: true },
    contextoVoz: {
      type: 'string',
      enum: ['inicio', 'esperar_respuesta', 'continuar_sin_respuesta']
    },
    razonamientoInterno: { type: 'string' }
  },
  required: [
    'mensajesPaciente',
    'acciones',
    'estadoPatch',
    'contextoVoz',
    'razonamientoInterno'
  ],
  additionalProperties: false
};

const KNOWLEDGE_FILES = [
  'interpretacion-paciente.md',
  'protocolo-agudeza-estado.md',
  'dispositivos.md',
  'comunicacion-paciente.md',
  'auditoria-protocolo.md'
];

function cargarConocimientoMonolito() {
  const partes = [leerMarkdown('prompts/sistema.md')];
  for (const name of KNOWLEDGE_FILES) {
    partes.push(`---\n# ${name}\n`, leerMarkdown(`knowledge/${name}`));
  }
  return partes.join('\n');
}

const systemKnowledge = cargarConocimientoMonolito();

function construirUserMessage(estado, respuestaPaciente, confianza) {
  const partes = [
    '## Estado actual del examen',
    '```json',
    JSON.stringify(estado, null, 2),
    '```'
  ];

  if (
    respuestaPaciente != null &&
    String(respuestaPaciente).trim() !== ''
  ) {
    partes.push(
      '## Respuesta del paciente (texto libre, capturado por agente de voz)',
      String(respuestaPaciente).trim(),
      `## Confianza de captura (0-1): ${confianza ?? 1}`
    );
  } else {
    partes.push(
      '## Sin respuesta del paciente en este turno',
      '(arranque o continuación tras mensaje informativo)'
    );
  }

  partes.push(
    'Decidí el siguiente paso clínico y devolvé el JSON del schema.'
  );
  return partes.join('\n\n');
}

function normalizarSalida(parsed) {
  const mensajesPaciente = Array.isArray(parsed.mensajesPaciente)
    ? parsed.mensajesPaciente.filter((m) => typeof m === 'string' && m.trim())
    : [];
  const acciones = Array.isArray(parsed.acciones) ? parsed.acciones : [];
  let contextoVoz = parsed.contextoVoz;
  if (!CONTEXTO_VOZ_VALIDOS.has(contextoVoz)) {
    contextoVoz = mensajesPaciente.length
      ? 'esperar_respuesta'
      : 'continuar_sin_respuesta';
  }
  return {
    mensajesPaciente,
    acciones,
    estadoPatch:
      parsed.estadoPatch && typeof parsed.estadoPatch === 'object'
        ? parsed.estadoPatch
        : {},
    contextoVoz,
    razonamientoInterno: String(parsed.razonamientoInterno ?? '')
  };
}

function aPasosHablar(mensajes) {
  return mensajes.map((mensaje, i) => ({
    tipo: 'hablar',
    orden: i + 1,
    mensaje
  }));
}

export async function procesarTurnoMonolito(respuestaPaciente = null, confianza = 1) {
  const estado = obtenerEstadoParaOrquestador();
  if (!estado) {
    return { ok: false, error: 'Examen no iniciado' };
  }

  const conf =
    typeof confianza === 'number' && !Number.isNaN(confianza)
      ? Math.min(1, Math.max(0, confianza))
      : 1;

  let parsed;
  try {
    parsed = await llamarAgenteJson({
      system: systemKnowledge,
      user: construirUserMessage(estado, respuestaPaciente, conf),
      schema: ORQUESTADOR_SCHEMA,
      schemaName: 'orquestador_examen',
      agente: 'default'
    });
  } catch (err) {
    console.error('❌ Orquestador monolito:', err.message);
    return { ok: false, error: `Error del orquestador: ${err.message}` };
  }

  const salida = normalizarSalida(parsed);
  aplicarEstadoPatch(salida.estadoPatch);
  const accionesEjecutadas = await ejecutarAcciones(salida.acciones);

  registrarTurnoHistorial({
    respuestaPaciente:
      respuestaPaciente != null ? String(respuestaPaciente).trim() : null,
    confianza: conf,
    contextoVozEmitido: salida.contextoVoz,
    mensajesEmitidos: salida.mensajesPaciente,
    razonamientoInterno: salida.razonamientoInterno,
    acciones: salida.acciones,
    estadoPatch: salida.estadoPatch,
    pipeline: false
  });

  return {
    ok: true,
    pasos: aPasosHablar(salida.mensajesPaciente),
    contextoVoz: salida.contextoVoz,
    accionesEjecutadas
  };
}
