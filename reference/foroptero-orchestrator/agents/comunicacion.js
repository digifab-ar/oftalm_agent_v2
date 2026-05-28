import { cargarSystemAgente } from '../lib/knowledge.js';
import { llamarAgenteJson } from '../lib/llmClient.js';
import { COMUNICACION_SCHEMA } from './schemas.js';

const CONTEXTO_VOZ_VALIDOS = new Set([
  'inicio',
  'esperar_respuesta',
  'continuar_sin_respuesta'
]);

export function construirUser(vista) {
  return [
    '## Vista del turno (VistaComunicacion)',
    'Usá los flags pre-computados para `contextoVoz` (tabla en comunicacion-comun.md).',
    '**No** derivar `contextoVoz` del `evento` ni de razonamientos previos.',
    '```json',
    JSON.stringify(vista, null, 2),
    '```',
    'Redactá mensajes y devolvé el JSON del schema.'
  ].join('\n\n');
}

export function normalizarComunicacion(parsed) {
  const mensajesPaciente = Array.isArray(parsed.mensajesPaciente)
    ? parsed.mensajesPaciente.filter((m) => typeof m === 'string' && m.trim())
    : [];

  let contextoVoz = parsed.contextoVoz;
  if (!CONTEXTO_VOZ_VALIDOS.has(contextoVoz)) {
    contextoVoz = mensajesPaciente.length
      ? 'esperar_respuesta'
      : 'continuar_sin_respuesta';
  }

  return {
    mensajesPaciente,
    contextoVoz,
    razonamientoComunicacion: String(parsed.razonamientoComunicacion ?? '')
  };
}

export async function ejecutarComunicacion(vista, options = {}) {
  const fase = vista.fase ?? 'agudeza';
  const parsed = await llamarAgenteJson({
    system: cargarSystemAgente('comunicacion', fase),
    user: construirUser(vista),
    schema: COMUNICACION_SCHEMA,
    schemaName: 'agente_comunicacion',
    agente: 'comunicacion'
  });
  return normalizarComunicacion(parsed);
}
