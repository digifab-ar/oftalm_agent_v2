import { cargarSystemAgente } from '../lib/knowledge.js';
import { resolverFaseDesdeEstado } from '../lib/estimulo.js';
import { llamarAgenteJson } from '../lib/llmClient.js';
import { COMUNICACION_SCHEMA } from './schemas.js';

const CONTEXTO_VOZ_VALIDOS = new Set([
  'inicio',
  'esperar_respuesta',
  'continuar_sin_respuesta'
]);

function estadoResumido(estado) {
  const ojo = estado.ojoActual;
  const ag = estado.agudeza?.[ojo];
  return {
    fase: estado.fase,
    ojoActual: ojo,
    R_cerrado: estado.agudeza?.R?.logmarFinal != null,
    L_cerrado: estado.agudeza?.L?.logmarFinal != null,
    logmarActual: ag?.logmarActual ?? null,
    letraActual: ag?.letraActual ?? null
  };
}

function construirUser(
  interpretacion,
  decisionProtocolo,
  estado,
  modo,
  huboCambioDispositivo
) {
  const fase = resolverFaseDesdeEstado(estado);
  const partes = ['## Fase activa', `fase: ${fase}`];

  if (modo) {
    partes.push('## Modo del turno', `modo: ${modo}`);
  }

  partes.push(
    '## Interpretación',
    '```json',
    JSON.stringify(interpretacion, null, 2),
    '```',
    '## Decisión de protocolo',
    '```json',
    JSON.stringify(
      {
        evento: decisionProtocolo.evento,
        detalleEvento: decisionProtocolo.detalleEvento
      },
      null,
      2
    ),
    '```',
    '## Cambio de dispositivos en este turno',
    `huboCambioDispositivo: ${Boolean(huboCambioDispositivo)}`,
    '## Estado resumido',
    '```json',
    JSON.stringify(estadoResumido(estado), null, 2),
    '```',
    'Redactá mensajes y devolvé el JSON del schema.'
  );

  return partes.join('\n\n');
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

export async function ejecutarComunicacion(
  interpretacion,
  decisionProtocolo,
  estado,
  options = {}
) {
  const { modo, huboCambioDispositivo = false } = options;
  const fase = resolverFaseDesdeEstado(estado);
  const parsed = await llamarAgenteJson({
    system: cargarSystemAgente('comunicacion', fase),
    user: construirUser(
      interpretacion,
      decisionProtocolo,
      estado,
      modo,
      huboCambioDispositivo
    ),
    schema: COMUNICACION_SCHEMA,
    schemaName: 'agente_comunicacion',
    agente: 'comunicacion'
  });
  return normalizarComunicacion(parsed);
}
