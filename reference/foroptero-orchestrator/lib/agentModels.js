/**
 * Modelos por agente del pipeline (fuente de verdad en código).
 * Editá acá para cambiar modelo / reasoning sin variables de entorno.
 *
 * Sugerencia latencia: intérprete, auditor y comunicación en gpt-4o-mini;
 * protocolo en el modelo más capaz que toleres (gpt-4.1-mini o gpt-5-mini).
 */

/** @typedef {{ model: string, reasoning?: 'minimal'|'low'|'medium'|'high' }} AgentModelConfig */

/** @type {Record<'interprete'|'protocolo'|'auditor'|'comunicacion', AgentModelConfig>} */
export const AGENT_MODELS = {
  interprete: {
    model: 'gpt-4o-mini'
  },
  protocolo: {
    model: 'gpt-4.1-mini'
  },
  auditor: {
    model: 'gpt-4o-mini'
  },
  comunicacion: {
    model: 'gpt-4o-mini'
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
