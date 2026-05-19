import { cargarSystemAgente } from '../lib/knowledge.js';
import { resolverFaseDesdeEstado } from '../lib/estimulo.js';
import { llamarAgenteJson } from '../lib/llmClient.js';
import { AUDITOR_SCHEMA } from './schemas.js';

function construirUser(estadoAntes, interpretacion, propuestaProtocolo, modo) {
  const fase = resolverFaseDesdeEstado(estadoAntes);
  const partes = ['## Fase activa', `fase: ${fase}`];

  if (modo) {
    partes.push('## Modo del turno', `modo: ${modo}`);
  }

  partes.push(
    '## Estado antes del patch',
    '```json',
    JSON.stringify(estadoAntes, null, 2),
    '```',
    '## Interpretación',
    '```json',
    JSON.stringify(interpretacion, null, 2),
    '```',
    '## Propuesta del agente protocolo',
    '```json',
    JSON.stringify(propuestaProtocolo, null, 2),
    '```',
    'Auditá y devolvé el JSON del schema.'
  );

  return partes.join('\n\n');
}

export function normalizarAuditoria(parsed) {
  return {
    aprobado: Boolean(parsed.aprobado),
    violaciones: Array.isArray(parsed.violaciones) ? parsed.violaciones : [],
    correccionSugerida: parsed.correccionSugerida ?? null
  };
}

export async function ejecutarAuditor(
  estadoAntes,
  interpretacion,
  propuestaProtocolo,
  options = {}
) {
  const { modo } = options;
  const fase = resolverFaseDesdeEstado(estadoAntes);
  const parsed = await llamarAgenteJson({
    system: cargarSystemAgente('auditor', fase),
    user: construirUser(estadoAntes, interpretacion, propuestaProtocolo, modo),
    schema: AUDITOR_SCHEMA,
    schemaName: 'agente_auditor',
    agente: 'auditor'
  });
  return normalizarAuditoria(parsed);
}
