import OpenAI from 'openai';

const DEFAULT_MODEL = 'gpt-5-mini';
const DEFAULT_REASONING_EFFORT = 'low';

let openaiClient = null;

export function getOpenAI() {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY no configurada');
    }
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

function esModeloReasoning(model) {
  return /^(o\d|gpt-5)/i.test(String(model).trim());
}

export function opcionesResponsesApi(model, reasoningEffort) {
  const opts = { model };
  if (esModeloReasoning(model)) {
    const effort =
      reasoningEffort?.trim() ||
      process.env.OPENAI_REASONING_EFFORT?.trim() ||
      DEFAULT_REASONING_EFFORT;
    opts.reasoning = { effort };
  } else {
    opts.temperature = 0;
  }
  return opts;
}

export function modelParaAgente(agente) {
  const key = `OPENAI_MODEL_${agente.toUpperCase()}`;
  return (
    process.env[key]?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    DEFAULT_MODEL
  );
}

export function reasoningParaAgente(agente) {
  const key = `OPENAI_REASONING_${agente.toUpperCase()}`;
  return process.env[key]?.trim() || undefined;
}

/**
 * @param {{ system: string, user: string, schema: object, schemaName: string, agente?: string }} opts
 */
export async function llamarAgenteJson({
  system,
  user,
  schema,
  schemaName,
  agente = 'default'
}) {
  const openai = getOpenAI();
  const model = modelParaAgente(agente);

  const response = await openai.responses.parse({
    ...opcionesResponsesApi(model, reasoningParaAgente(agente)),
    input: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: schemaName,
        strict: false,
        schema
      }
    }
  });

  const parsed = response.output_parsed;
  if (!parsed) {
    throw new Error(`Agente ${schemaName}: respuesta sin JSON parseado`);
  }
  return parsed;
}
