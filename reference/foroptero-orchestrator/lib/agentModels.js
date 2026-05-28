/**
 * Modelos por agente del pipeline (fuente de verdad en código).
 * Editá acá para cambiar modelo / reasoning sin variables de entorno.
 *
 * interprete / comunicacion: gpt-4.1-mini (rápido).
 * protocolo / auditor: gpt-5.4-mini snapshot fijo + reasoning medium.
 */

/** @typedef {{ model: string, reasoning?: 'none'|'low'|'medium'|'high'|'xhigh' }} AgentModelConfig */

/** @type {Record<'interprete'|'protocolo'|'auditor'|'comunicacion', AgentModelConfig>} */
export const AGENT_MODELS = {
  interprete: {
    model: 'gpt-4.1-mini'
  },
  protocolo: {
    model: 'gpt-5.4-mini-2026-03-17',
    reasoning: 'medium'
  },
  auditor: {
    model: 'gpt-5.4-mini-2026-03-17',
    reasoning: 'medium'
  },
  comunicacion: {
    model: 'gpt-4.1-mini'
  }
};

export const PIPELINE_AGENT_IDS = Object.keys(AGENT_MODELS);

export function modelParaAgente(agente) {
  const cfg = AGENT_MODELS[agente];
  if (!cfg) {
    throw new Error(
      `Agente "${agente}" sin modelo en lib/agentModels.js. IDs: ${PIPELINE_AGENT_IDS.join(', ')}`
    );
  }
  return cfg.model;
}

export function reasoningParaAgente(agente) {
  return AGENT_MODELS[agente]?.reasoning;
}
