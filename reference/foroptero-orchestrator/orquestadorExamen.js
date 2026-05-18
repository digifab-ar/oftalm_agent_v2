import { procesarTurnoPipeline } from './pipelineTurno.js';

export { cargarKnowledgeAgente } from './lib/knowledge.js';

/**
 * Procesa un turno: pipeline multi-agente
 * (intérprete → protocolo → auditor → comunicación).
 */
export async function procesarTurno(respuestaPaciente = null, confianza = 1) {
  return procesarTurnoPipeline(respuestaPaciente, confianza);
}
