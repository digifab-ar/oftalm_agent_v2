import { cargarSystemAgente } from '../lib/knowledge.js';
import { resolverFaseDesdeEstado } from '../lib/estimulo.js';
import { llamarAgenteJson } from '../lib/llmClient.js';
import { INTERPRETE_SCHEMA } from './schemas.js';

/** Vocabulario Sloan (agudeza). */
const LETRAS_SLOAN = new Set(['H', 'O', 'T', 'E', 'C', 'F', 'Z', 'L', 'P', 'D']);

function esLetraSloan(letra) {
  if (letra == null || String(letra).trim() === '') return false;
  return LETRAS_SLOAN.has(String(letra).trim().toUpperCase());
}

/**
 * Letras fuera de Sloan → incorrecta con letraElegida null.
 * Corrige salidas del LLM que aún marquen ambigua o rellenen letraElegida inválida.
 */
export function corregirInterpretacionAgudeza(parsed) {
  const letraInvalida =
    parsed.letraElegida != null && !esLetraSloan(parsed.letraElegida);

  const candidatas = Array.isArray(parsed.letrasCandidatas)
    ? parsed.letrasCandidatas
    : [];
  const soloCandidatasNoSloan =
    candidatas.length > 0 && candidatas.every((c) => !esLetraSloan(c));

  let clasificacion = parsed.clasificacion;
  if (
    (letraInvalida || soloCandidatasNoSloan) &&
    (clasificacion === 'ambigua' || clasificacion === 'incorrecta')
  ) {
    clasificacion = 'incorrecta';
  }

  return {
    ...parsed,
    clasificacion,
    letrasCandidatas: candidatas.filter((c) => esLetraSloan(c)),
    letraElegida: letraInvalida ? null : (parsed.letraElegida ?? null)
  };
}

export function construirUser(vista) {
  const partes = [
    '## Vista del turno (VistaInterprete)',
    '```json',
    JSON.stringify(vista, null, 2),
    '```'
  ];

  if (vista.respuestaPaciente == null) {
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

export function normalizarInterpretacion(parsed, fase = null) {
  const base = {
    clasificacion: parsed.clasificacion,
    letrasCandidatas: Array.isArray(parsed.letrasCandidatas)
      ? parsed.letrasCandidatas
      : [],
    letraElegida: parsed.letraElegida ?? null,
    notasInterprete: String(parsed.notasInterprete ?? '')
  };
  if (fase === 'agudeza') {
    return corregirInterpretacionAgudeza(base);
  }
  return base;
}

export async function ejecutarInterprete(vista, options = {}) {
  const { modo } = options;
  if (modo === 'bootstrap') {
    return interpretacionBootstrapHardcoded();
  }

  const fase = vista.fase ?? resolverFaseDesdeEstado({ fase: vista.fase });
  const parsed = await llamarAgenteJson({
    system: cargarSystemAgente('interprete', fase),
    user: construirUser(vista),
    schema: INTERPRETE_SCHEMA,
    schemaName: 'agente_interprete',
    agente: 'interprete'
  });
  return normalizarInterpretacion(parsed, fase);
}
