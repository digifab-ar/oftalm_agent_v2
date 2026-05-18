import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import {
  aplicarEstadoPatch,
  obtenerEstadoParaOrquestador,
  registrarTurnoHistorial
} from './estadoExamen.js';
import { ejecutarAcciones } from './ejecutarAcciones.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONTEXTO_VOZ_VALIDOS = new Set([
  'inicio',
  'esperar_respuesta',
  'continuar_sin_respuesta'
]);

const ORQUESTADOR_SCHEMA = {
  type: 'object',
  properties: {
    mensajesPaciente: {
      type: 'array',
      items: { type: 'string' }
    },
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
    estadoPatch: {
      type: 'object',
      properties: {
        fase: { type: 'string' },
        ojoActual: { type: 'string' },
        finalizado: { type: ['number', 'null'] },
        agudeza: {
          type: 'object',
          properties: {
            R: {
              type: 'object',
              properties: {
                logmarActual: { type: 'number' },
                letraActual: { type: 'string' },
                ultimoLogmarCorrecto: { type: ['number', 'null'] },
                confirmaciones: { type: 'number' },
                aciertosPorLogmar: {
                  type: 'object',
                  properties: {
                    '0.3': { type: 'number' },
                    '0.2': { type: 'number' },
                    '0.1': { type: 'number' },
                    '0.0': { type: 'number' }
                  },
                  additionalProperties: false
                },
                logmarFinal: { type: ['number', 'null'] },
                letraFinal: { type: ['string', 'null'] },
                letrasUsadas: {
                  type: 'array',
                  items: { type: 'string' }
                }
              },
              additionalProperties: false
            },
            L: {
              type: 'object',
              properties: {
                logmarActual: { type: 'number' },
                letraActual: { type: 'string' },
                ultimoLogmarCorrecto: { type: ['number', 'null'] },
                confirmaciones: { type: 'number' },
                aciertosPorLogmar: {
                  type: 'object',
                  properties: {
                    '0.3': { type: 'number' },
                    '0.2': { type: 'number' },
                    '0.1': { type: 'number' },
                    '0.0': { type: 'number' }
                  },
                  additionalProperties: false
                },
                logmarFinal: { type: ['number', 'null'] },
                letraFinal: { type: ['string', 'null'] },
                letrasUsadas: {
                  type: 'array',
                  items: { type: 'string' }
                }
              },
              additionalProperties: false
            }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    },
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

let openaiClient = null;

function getOpenAI() {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY no configurada');
    }
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

function leerMarkdown(relPath) {
  return fs.readFileSync(path.join(__dirname, relPath), 'utf8');
}

function cargarConocimiento() {
  return [
    leerMarkdown('prompts/sistema.md'),
    '---\n# examen-agudeza.md\n',
    leerMarkdown('knowledge/examen-agudeza.md'),
    '---\n# letras-fonetica-es.md\n',
    leerMarkdown('knowledge/letras-fonetica-es.md'),
    '---\n# foroptero.md\n',
    leerMarkdown('knowledge/foroptero.md'),
    '---\n# tv.md\n',
    leerMarkdown('knowledge/tv.md')
  ].join('\n');
}

const systemKnowledge = cargarConocimiento();

const DEFAULT_MODEL = 'gpt-5-mini';
const DEFAULT_REASONING_EFFORT = 'low';

/** Modelos o* / gpt-5* usan reasoning en Responses API (sin temperature). */
function esModeloReasoning(model) {
  return /^(o\d|gpt-5)/i.test(String(model).trim());
}

function opcionesResponsesApi(model) {
  const opts = { model };
  if (esModeloReasoning(model)) {
    const effort =
      process.env.OPENAI_REASONING_EFFORT?.trim() || DEFAULT_REASONING_EFFORT;
    opts.reasoning = { effort };
  } else {
    opts.temperature = 0;
  }
  return opts;
}

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

/**
 * Procesa un turno del examen vía LLM.
 */
export async function procesarTurno(respuestaPaciente = null, confianza = 1) {
  const estado = obtenerEstadoParaOrquestador();
  if (!estado) {
    return { ok: false, error: 'Examen no iniciado' };
  }

  const conf =
    typeof confianza === 'number' && !Number.isNaN(confianza)
      ? Math.min(1, Math.max(0, confianza))
      : 1;

  const openai = getOpenAI();
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;

  let parsed;
  try {
    const response = await openai.responses.parse({
      ...opcionesResponsesApi(model),
      input: [
        {
          role: 'system',
          content: systemKnowledge
        },
        {
          role: 'user',
          content: construirUserMessage(estado, respuestaPaciente, conf)
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'orquestador_examen',
          strict: false,
          schema: ORQUESTADOR_SCHEMA
        }
      }
    });

    parsed = response.output_parsed;
    if (!parsed) {
      throw new Error('Respuesta sin JSON parseado');
    }
  } catch (err) {
    console.error('❌ Orquestador OpenAI:', err.message);
    return {
      ok: false,
      error: `Error del orquestador: ${err.message}`
    };
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
    estadoPatch: salida.estadoPatch
  });

  return {
    ok: true,
    pasos: aPasosHablar(salida.mensajesPaciente),
    contextoVoz: salida.contextoVoz,
    accionesEjecutadas
  };
}
