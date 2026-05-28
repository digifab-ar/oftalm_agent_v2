/**
 * Persistencia de user prompts LLM en historial (QA / ForopteroControl).
 * Activar/desactivar con PIPELINE_GUARDAR_PROMPTS (default: true).
 */

/** @typedef {{ intento: number, user: string, vista: object }} PromptIntento */

/** @typedef {{ invocado: boolean, motivo?: string, user?: string, vista?: object }} AgentePromptRegistro */

/**
 * @typedef {object} LlmPromptsTurno
 * @property {AgentePromptRegistro} [interprete]
 * @property {{ intentos: PromptIntento[] }} [protocolo]
 * @property {{ intentos: PromptIntento[] }} [auditor]
 * @property {AgentePromptRegistro} [comunicacion]
 */

export function guardarPromptsEnHistorial() {
  const raw = process.env.PIPELINE_GUARDAR_PROMPTS;
  if (raw === 'false' || raw === '0') return false;
  return true;
}

/** @returns {LlmPromptsTurno} */
export function crearLlmPromptsTurno() {
  return {
    interprete: { invocado: false, motivo: 'pendiente' },
    protocolo: { intentos: [] },
    auditor: { intentos: [] },
    comunicacion: { invocado: false, motivo: 'pendiente' }
  };
}

/** @param {object} vista */
export function clonarVista(vista) {
  return JSON.parse(JSON.stringify(vista));
}

/**
 * @param {{ intento: number, user: string, vista: object }} params
 * @returns {PromptIntento}
 */
export function registroIntentoPrompt({ intento, user, vista }) {
  return {
    intento,
    user,
    vista: clonarVista(vista)
  };
}

/**
 * @param {LlmPromptsTurno} llmPrompts
 * @param {'protocolo'|'auditor'} agente
 * @param {number} intento
 * @param {string} user
 * @param {object} vista
 */
export function pushIntentoPrompt(llmPrompts, agente, intento, user, vista) {
  llmPrompts[agente].intentos.push(
    registroIntentoPrompt({ intento, user, vista })
  );
}

/**
 * @param {LlmPromptsTurno} llmPrompts
 * @param {'interprete'|'comunicacion'} agente
 * @param {{ invocado: boolean, motivo?: string, user?: string, vista?: object }} registro
 */
export function setPromptAgente(llmPrompts, agente, registro) {
  const out = { invocado: registro.invocado };
  if (registro.motivo != null) out.motivo = registro.motivo;
  if (registro.user != null) out.user = registro.user;
  if (registro.vista != null) out.vista = clonarVista(registro.vista);
  llmPrompts[agente] = out;
}
