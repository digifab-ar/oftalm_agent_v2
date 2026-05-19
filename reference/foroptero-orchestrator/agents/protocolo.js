import { cargarSystemAgente } from '../lib/knowledge.js';
import { resolverFaseDesdeEstado } from '../lib/estimulo.js';
import { llamarAgenteJson } from '../lib/llmClient.js';
import { PROTOCOLO_SCHEMA } from './schemas.js';

function construirUser(estado, interpretacion, feedbackAuditor = null, modo) {
  const fase = resolverFaseDesdeEstado(estado);
  const partes = ['## Fase activa', `fase: ${fase}`];

  if (modo) {
    partes.push('## Modo del turno', `modo: ${modo}`);
  }

  partes.push(
    '## Estado actual del examen',
    '```json',
    JSON.stringify(estado, null, 2),
    '```',
    '## Interpretación (agente intérprete — no re-clasificar)',
    '```json',
    JSON.stringify(interpretacion, null, 2),
    '```'
  );

  if (feedbackAuditor) {
    partes.push(
      '## Rechazo del auditor — corregí la propuesta',
      feedbackAuditor,
      'Generá una nueva propuesta de protocolo válida.'
    );
  } else {
    partes.push('Aplicá el protocolo y devolvé el JSON del schema.');
  }

  return partes.join('\n\n');
}

export function normalizarProtocolo(parsed) {
  return {
    estadoPatch:
      parsed.estadoPatch && typeof parsed.estadoPatch === 'object'
        ? parsed.estadoPatch
        : {},
    acciones: Array.isArray(parsed.acciones) ? parsed.acciones : [],
    evento: parsed.evento,
    detalleEvento:
      parsed.detalleEvento && typeof parsed.detalleEvento === 'object'
        ? parsed.detalleEvento
        : {},
    razonamientoProtocolo: String(parsed.razonamientoProtocolo ?? '')
  };
}

export async function ejecutarProtocolo(
  estado,
  interpretacion,
  feedbackAuditor = null,
  options = {}
) {
  const { modo } = options;
  const fase = resolverFaseDesdeEstado(estado);
  const parsed = await llamarAgenteJson({
    system: cargarSystemAgente('protocolo', fase),
    user: construirUser(estado, interpretacion, feedbackAuditor, modo),
    schema: PROTOCOLO_SCHEMA,
    schemaName: 'agente_protocolo',
    agente: 'protocolo'
  });
  return normalizarProtocolo(parsed);
}
