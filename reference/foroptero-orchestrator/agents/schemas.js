const CLASIFICACION_ENUM = [
  'correcta',
  'incorrecta',
  'no_ve',
  'ambigua',
  'confianza_baja',
  'continuacion',
  'frase_paciente_no_clinica'
];

const EVENTO_ENUM = [
  'repregunta_sin_cambio',
  'siguiente_optotipo',
  'cierre_ojo_R',
  'cierre_ojo_R_e_inicio_L',
  'cierre_ojo_L',
  'examen_finalizado',
  'continuacion_dispositivos',
  'inicio_ojo',
  'esperar_primera_respuesta'
];

const ACCION_ITEM = {
  type: 'object',
  properties: {
    dispositivo: { type: 'string', enum: ['foroptero', 'tv'] },
    config: {
      type: 'object',
      properties: {
        R: { type: 'object', additionalProperties: true },
        L: { type: 'object', additionalProperties: true }
      },
      additionalProperties: false
    },
    letra: { type: 'string' },
    logmar: { type: 'number' }
  },
  required: ['dispositivo'],
  additionalProperties: false
};

const OJO_AGUDEZA = {
  type: 'object',
  properties: {
    logmarActual: { type: 'number' },
    letraActual: { type: 'string' },
    ultimoLogmarCorrecto: { type: ['number', 'null'] },
    confirmaciones: { type: 'number' },
    resultadosPorLogmar: {
      type: 'object',
      properties: {
        '0.3': {
          type: 'object',
          properties: {
            correcto: { type: 'number' },
            incorrecto: { type: 'number' }
          },
          additionalProperties: false
        },
        '0.2': {
          type: 'object',
          properties: {
            correcto: { type: 'number' },
            incorrecto: { type: 'number' }
          },
          additionalProperties: false
        },
        '0.1': {
          type: 'object',
          properties: {
            correcto: { type: 'number' },
            incorrecto: { type: 'number' }
          },
          additionalProperties: false
        },
        '0.0': {
          type: 'object',
          properties: {
            correcto: { type: 'number' },
            incorrecto: { type: 'number' }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    },
    aciertosPorLogmar: {
      type: 'object',
      properties: {
        '0.3': { type: 'number' },
        '0.2': { type: 'number' },
        '0.1': { type: 'number' },
        '0.0': { type: 'number' }
      },
      additionalProperties: false
    },
    logmarFinal: { type: ['number', 'null'] },
    letraFinal: { type: ['string', 'null'] },
    letrasUsadas: { type: 'array', items: { type: 'string' } }
  },
  additionalProperties: false
};

export const INTERPRETE_SCHEMA = {
  type: 'object',
  properties: {
    clasificacion: { type: 'string', enum: CLASIFICACION_ENUM },
    letrasCandidatas: { type: 'array', items: { type: 'string' } },
    letraElegida: { type: ['string', 'null'] },
    notasInterprete: { type: 'string' }
  },
  required: ['clasificacion', 'letrasCandidatas', 'notasInterprete'],
  additionalProperties: false
};

export const PROTOCOLO_SCHEMA = {
  type: 'object',
  properties: {
    estadoPatch: {
      type: 'object',
      properties: {
        fase: { type: 'string' },
        ojoActual: { type: 'string' },
        finalizado: { type: ['number', 'null'] },
        agudeza: {
          type: 'object',
          properties: {
            R: OJO_AGUDEZA,
            L: OJO_AGUDEZA
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    },
    acciones: { type: 'array', items: ACCION_ITEM },
    evento: { type: 'string', enum: EVENTO_ENUM },
    detalleEvento: { type: 'object', additionalProperties: true },
    razonamientoProtocolo: { type: 'string' }
  },
  required: [
    'estadoPatch',
    'acciones',
    'evento',
    'detalleEvento',
    'razonamientoProtocolo'
  ],
  additionalProperties: false
};

export const AUDITOR_SCHEMA = {
  type: 'object',
  properties: {
    aprobado: { type: 'boolean' },
    violaciones: { type: 'array', items: { type: 'string' } },
    correccionSugerida: { type: ['string', 'null'] }
  },
  required: ['aprobado', 'violaciones'],
  additionalProperties: false
};

export const COMUNICACION_SCHEMA = {
  type: 'object',
  properties: {
    mensajesPaciente: { type: 'array', items: { type: 'string' } },
    contextoVoz: {
      type: 'string',
      enum: ['inicio', 'esperar_respuesta', 'continuar_sin_respuesta']
    },
    razonamientoComunicacion: { type: 'string' }
  },
  required: ['mensajesPaciente', 'contextoVoz', 'razonamientoComunicacion'],
  additionalProperties: false
};

export { CLASIFICACION_ENUM, EVENTO_ENUM };
