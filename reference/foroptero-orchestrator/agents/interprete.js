import { cargarSystemAgente } from '../lib/knowledge.js';
import { estimuloParaInterprete, resolverFaseDesdeEstado } from '../lib/estimulo.js';
import { llamarAgenteJson } from '../lib/llmClient.js';
import { INTERPRETE_SCHEMA } from './schemas.js';

function construirUser(estado, respuestaPaciente, confianza, modo) {
  const fase = resolverFaseDesdeEstado(estado);
  const partes = [
    '## Fase activa',
    `fase: ${fase}`,
    '## Estímulo de referencia',
    '```json',
    JSON.stringify(estimuloParaInterprete(estado), null, 2),
    '```'
  ];

  if (modo) {
    partes.push('## Modo del turno', `modo: ${modo}`);
  }

  if (
    respuestaPaciente != null &&
    String(respuestaPaciente).trim() !== ''
  ) {
    partes.push(
      '## Respuesta del paciente (transcripción literal)',
      String(respuestaPaciente).trim(),
      `## Confianza de captura (0-1): ${confianza}`
    );
  } else {
    partes.push(
      '## Sin respuesta del paciente en este turno',
      'Devolvé clasificacion: continuacion.'
    );
  }

  partes.push('Clasificá y devolvé el JSON del schema.');
  return partes.join('\n\n');
}

export function interpretacionBootstrapHardcoded() {
  return {
    clasificacion: 'continuacion',
    letrasCandidatas: [],
    letraElegida: null,
    notasInterprete: 'turno bootstrap'
  };
}

export function normalizarInterpretacion(parsed) {
  return {
    clasificacion: parsed.clasificacion,
    letrasCandidatas: Array.isArray(parsed.letrasCandidatas)
      ? parsed.letrasCandidatas
      : [],
    letraElegida: parsed.letraElegida ?? null,
    notasInterprete: String(parsed.notasInterprete ?? '')
  };
}

export async function ejecutarInterprete(
  estado,
  respuestaPaciente,
  confianza,
  options = {}
) {
  const { modo } = options;
  if (modo === 'bootstrap') {
    return interpretacionBootstrapHardcoded();
  }

  const fase = resolverFaseDesdeEstado(estado);
  const parsed = await llamarAgenteJson({
    system: cargarSystemAgente('interprete', fase),
    user: construirUser(estado, respuestaPaciente, confianza, modo),
    schema: INTERPRETE_SCHEMA,
    schemaName: 'agente_interprete',
    agente: 'interprete'
  });
  return normalizarInterpretacion(parsed);
}
