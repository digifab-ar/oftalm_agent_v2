import { cargarSystemAgente } from '../lib/knowledge.js';
import { llamarAgenteJson } from '../lib/llmClient.js';
import { COMUNICACION_SCHEMA } from './schemas.js';

const CONTEXTO_VOZ_VALIDOS = new Set([
  'inicio',
  'esperar_respuesta',
  'continuar_sin_respuesta'
]);

function estadoResumido(estado) {
  return {
    fase: estado.fase,
    ojoActual: estado.ojoActual,
    R_cerrado: estado.agudeza?.R?.logmarFinal != null,
    L_cerrado: estado.agudeza?.L?.logmarFinal != null,
    logmarActual: estado.agudeza?.[estado.ojoActual]?.logmarActual,
    letraActual: estado.agudeza?.[estado.ojoActual]?.letraActual
  };
}

function construirUser(interpretacion, decisionProtocolo, estado) {
  return [
    '## Interpretación',
    '```json',
    JSON.stringify(interpretacion, null, 2),
    '```',
    '## Decisión de protocolo',
    '```json',
    JSON.stringify(
      {
        evento: decisionProtocolo.evento,
        detalleEvento: decisionProtocolo.detalleEvento
      },
      null,
      2
    ),
    '```',
    '## Estado resumido',
    '```json',
    JSON.stringify(estadoResumido(estado), null, 2),
    '```',
    'Redactá mensajes y devolvé el JSON del schema.'
  ].join('\n\n');
}

export function normalizarComunicacion(parsed) {
  const mensajesPaciente = Array.isArray(parsed.mensajesPaciente)
    ? parsed.mensajesPaciente.filter((m) => typeof m === 'string' && m.trim())
    : [];

  let contextoVoz = parsed.contextoVoz;
  if (!CONTEXTO_VOZ_VALIDOS.has(contextoVoz)) {
    contextoVoz = mensajesPaciente.length
      ? 'esperar_respuesta'
      : 'continuar_sin_respuesta';
  }

  return {
    mensajesPaciente,
    contextoVoz,
    razonamientoComunicacion: String(parsed.razonamientoComunicacion ?? '')
  };
}

export async function ejecutarComunicacion(
  interpretacion,
  decisionProtocolo,
  estado
) {
  const parsed = await llamarAgenteJson({
    system: cargarSystemAgente('comunicacion'),
    user: construirUser(interpretacion, decisionProtocolo, estado),
    schema: COMUNICACION_SCHEMA,
    schemaName: 'agente_comunicacion',
    agente: 'comunicacion'
  });
  return normalizarComunicacion(parsed);
}
