import { cargarSystemAgente } from '../lib/knowledge.js';
import { llamarAgenteJson } from '../lib/llmClient.js';
import { PROTOCOLO_SCHEMA } from './schemas.js';

function construirUser(vista) {
  const partes = [
    '## Vista del turno (VistaProtocolo)',
    'Los contadores en `agudeza[ojoActual].contadoresLogmarActual` **ya incluyen** este turno si la clasificación fue correcta/incorrecta/no_ve.',
    '**Prohibido** incluir `resultadosPorLogmar` ni `aciertosPorLogmar` en `estadoPatch`.',
    'En plantillas B/C: `letraActual` debe ser **∉** `letrasUsadas` pre-patch y el array del patch debe **extender** las previas (auto-verificación ítems 7–8; el auditor rechaza BUG-005 si no).',
    '```json',
    JSON.stringify(vista, null, 2),
    '```'
  ];

  if (vista.feedbackAuditor) {
    partes.push(
      '## Rechazo del auditor — corregí la propuesta',
      '```json',
      JSON.stringify(vista.feedbackAuditor, null, 2),
      '```',
      'Generá una nueva propuesta de protocolo válida.'
    );
  } else {
    partes.push('Aplicá el protocolo y devolvé el JSON del schema.');
  }

  return partes.join('\n\n');
}

export function normalizarProtocolo(parsed) {
  return {
    estadoPatch:
      parsed.estadoPatch && typeof parsed.estadoPatch === 'object'
        ? parsed.estadoPatch
        : {},
    acciones: Array.isArray(parsed.acciones) ? parsed.acciones : [],
    evento: parsed.evento,
    detalleEvento:
      parsed.detalleEvento && typeof parsed.detalleEvento === 'object'
        ? parsed.detalleEvento
        : {},
    razonamientoProtocolo: String(parsed.razonamientoProtocolo ?? '')
  };
}

export async function ejecutarProtocolo(vista, options = {}) {
  const fase = vista.fase ?? 'agudeza';
  const parsed = await llamarAgenteJson({
    system: cargarSystemAgente('protocolo', fase),
    user: construirUser(vista),
    schema: PROTOCOLO_SCHEMA,
    schemaName: 'agente_protocolo',
    agente: 'protocolo'
  });
  return normalizarProtocolo(parsed);
}
