import { procesarTurnoPipeline } from './pipelineTurno.js';
import { procesarTurnoMonolito } from './orquestadorMonolito.js';

export { cargarKnowledgeAgente } from './lib/knowledge.js';

function usarMonolito() {
  return process.env.OPENAI_USE_MONOLITH_ORCHESTRATOR === 'true';
}

/**
 * Procesa un turno del examen.
 * Por defecto: pipeline multi-agente (intérprete → protocolo → auditor → comunicación).
 * Monolito: OPENAI_USE_MONOLITH_ORCHESTRATOR=true
 */
export async function procesarTurno(respuestaPaciente = null, confianza = 1) {
  if (usarMonolito()) {
    return procesarTurnoMonolito(respuestaPaciente, confianza);
  }
  return procesarTurnoPipeline(respuestaPaciente, confianza);
}
