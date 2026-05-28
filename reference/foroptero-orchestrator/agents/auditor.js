import { cargarSystemAgente } from '../lib/knowledge.js';
import { llamarAgenteJson } from '../lib/llmClient.js';
import { AUDITOR_SCHEMA } from './schemas.js';

export function construirUser(vista) {
  return [
    '## Vista del turno (VistaAuditor)',
    '```json',
    JSON.stringify(vista, null, 2),
    '```',
    'Auditá y devolvé el JSON del schema.'
  ].join('\n\n');
}

export function normalizarAuditoria(parsed) {
  return {
    aprobado: Boolean(parsed.aprobado),
    violaciones: Array.isArray(parsed.violaciones) ? parsed.violaciones : [],
    correccionSugerida: parsed.correccionSugerida ?? null
  };
}

export async function ejecutarAuditor(vista, options = {}) {
  const fase = vista.fase ?? 'agudeza';
  const parsed = await llamarAgenteJson({
    system: cargarSystemAgente('auditor', fase),
    user: construirUser(vista),
    schema: AUDITOR_SCHEMA,
    schemaName: 'agente_auditor',
    agente: 'auditor'
  });
  return normalizarAuditoria(parsed);
}
