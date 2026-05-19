import { procesarTurnoPipeline } from './pipelineTurno.js';

export { cargarKnowledgeAgente } from './lib/knowledge.js';

/**
 * Procesa un turno: pipeline multi-agente
 * (intérprete → protocolo → auditor → comunicación).
 */
/**
 * @param {string | null} respuestaPaciente
 * @param {number} confianza
 * @param {{ timestamp?: string }} [options]
 */
export async function procesarTurno(respuestaPaciente = null, confianza = 1, options = {}) {
  return procesarTurnoPipeline(respuestaPaciente, confianza, options);
}
