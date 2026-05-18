import { cargarSystemAgente } from '../lib/knowledge.js';
import { llamarAgenteJson } from '../lib/llmClient.js';
import { INTERPRETE_SCHEMA } from './schemas.js';

function estadoParaInterprete(estado) {
  const ojo = estado.ojoActual;
  const ag = estado.agudeza?.[ojo] ?? {};
  return {
    ojoActual: ojo,
    letraActual: ag.letraActual,
    logmarActual: ag.logmarActual,
    logmarFinal: ag.logmarFinal
  };
}

function construirUser(estado, respuestaPaciente, confianza) {
  const partes = [
    '## Contexto del ojo en test',
    '```json',
    JSON.stringify(estadoParaInterprete(estado), null, 2),
    '```'
  ];

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

export async function ejecutarInterprete(estado, respuestaPaciente, confianza) {
  const parsed = await llamarAgenteJson({
    system: cargarSystemAgente('interprete'),
    user: construirUser(estado, respuestaPaciente, confianza),
    schema: INTERPRETE_SCHEMA,
    schemaName: 'agente_interprete',
    agente: 'interprete'
  });
  return normalizarInterpretacion(parsed);
}
