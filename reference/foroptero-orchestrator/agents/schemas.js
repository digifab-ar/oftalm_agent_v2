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

const RX_OJO = {
  type: 'object',
  properties: {
    esfera: { type: 'number' },
    cilindro: { type: 'number' },
    angulo: { type: 'number' }
  },
  required: ['esfera', 'cilindro', 'angulo'],
  additionalProperties: true
};

const OJO_AGUDEZA_VISTA = {
  type: 'object',
  properties: {
    logmarActual: { type: ['number', 'null'] },
    letraActual: { type: ['string', 'null'] },
    letrasUsadas: { type: 'array', items: { type: 'string' } },
    logmarFinal: { type: ['number', 'null'] },
    contadoresLogmarActual: {
      type: ['object', 'null'],
      properties: {
        correcto: { type: 'number' },
        incorrecto: { type: 'number' }
      },
      required: ['correcto', 'incorrecto'],
      additionalProperties: false
    }
  },
  required: [
    'logmarActual',
    'letraActual',
    'letrasUsadas',
    'logmarFinal',
    'contadoresLogmarActual'
  ],
  additionalProperties: false
};

const INTERPRETACION_VISTA = {
  type: 'object',
  properties: {
    clasificacion: { type: 'string', enum: CLASIFICACION_ENUM },
    letraElegida: { type: ['string', 'null'] },
    letrasCandidatas: { type: 'array', items: { type: 'string' } },
    notasInterprete: { type: 'string' }
  },
  required: ['clasificacion', 'letraElegida', 'letrasCandidatas', 'notasInterprete'],
  additionalProperties: false
};

const FEEDBACK_AUDITOR_VISTA = {
  type: 'object',
  properties: {
    violaciones: { type: 'array', items: { type: 'string' } },
    correccionSugerida: { type: ['string', 'null'] }
  },
  required: ['violaciones'],
  additionalProperties: false
};

export const VISTA_INTERPRETE_SCHEMA = {
  type: 'object',
  properties: {
    fase: { type: 'string' },
    modo: { type: 'string', enum: ['respuesta', 'bootstrap'] },
    estimulo: {
      type: 'object',
      properties: {
        tipo: { type: 'string' },
        letraActual: { type: ['string', 'null'] },
        logmarActual: { type: ['number', 'null'] },
        ojo: { type: 'string', enum: ['R', 'L'] }
      },
      required: ['tipo', 'letraActual', 'logmarActual', 'ojo'],
      additionalProperties: true
    },
    respuestaPaciente: { type: ['string', 'null'] },
    confianza: { type: 'number' }
  },
  required: ['fase', 'modo', 'estimulo', 'respuestaPaciente', 'confianza'],
  additionalProperties: false
};

export const VISTA_PROTOCOLO_SCHEMA = {
  type: 'object',
  properties: {
    fase: { type: 'string' },
    modo: { type: 'string', enum: ['respuesta', 'bootstrap'] },
    ojoActual: { type: 'string', enum: ['R', 'L'] },
    agudeza: {
      type: 'object',
      properties: {
        R: OJO_AGUDEZA_VISTA,
        L: OJO_AGUDEZA_VISTA
      },
      required: ['R', 'L'],
      additionalProperties: false
    },
    rx: {
      type: 'object',
      properties: { R: RX_OJO, L: RX_OJO },
      required: ['R', 'L'],
      additionalProperties: false
    },
    interpretacion: INTERPRETACION_VISTA,
    feedbackAuditor: {
      type: ['object', 'null'],
      properties: FEEDBACK_AUDITOR_VISTA.properties,
      required: FEEDBACK_AUDITOR_VISTA.required,
      additionalProperties: false
    }
  },
  required: [
    'fase',
    'modo',
    'ojoActual',
    'agudeza',
    'rx',
    'interpretacion',
    'feedbackAuditor'
  ],
  additionalProperties: false
};

const INTENTO_RECIEN_REGISTRADO = {
  type: 'object',
  properties: {
    ojo: { type: 'string', enum: ['R', 'L'] },
    logmarEstimulo: { type: ['number', 'null'] },
    letraEstimulo: { type: ['string', 'null'] },
    clasificacion: { type: 'string', enum: CLASIFICACION_ENUM },
    duplicado: { type: 'boolean' },
    contadoresPostRegistro: {
      type: ['object', 'null'],
      properties: {
        correcto: { type: 'number' },
        incorrecto: { type: 'number' }
      },
      required: ['correcto', 'incorrecto'],
      additionalProperties: false
    }
  },
  required: [
    'ojo',
    'logmarEstimulo',
    'letraEstimulo',
    'clasificacion',
    'duplicado',
    'contadoresPostRegistro'
  ],
  additionalProperties: false
};

export const VISTA_AUDITOR_SCHEMA = {
  type: 'object',
  properties: {
    fase: { type: 'string' },
    modo: { type: 'string', enum: ['respuesta', 'bootstrap'] },
    ojoActual: { type: 'string', enum: ['R', 'L'] },
    agudeza: {
      type: 'object',
      properties: {
        R: OJO_AGUDEZA_VISTA,
        L: OJO_AGUDEZA_VISTA
      },
      required: ['R', 'L'],
      additionalProperties: false
    },
    rx: {
      type: 'object',
      properties: { R: RX_OJO, L: RX_OJO },
      required: ['R', 'L'],
      additionalProperties: false
    },
    interpretacion: INTERPRETACION_VISTA,
    intentoRecienRegistrado: {
      type: ['object', 'null'],
      properties: INTENTO_RECIEN_REGISTRADO.properties,
      required: INTENTO_RECIEN_REGISTRADO.required,
      additionalProperties: false
    },
    propuestaProtocolo: {
      type: 'object',
      properties: {
        estadoPatch: { type: 'object', additionalProperties: true },
        acciones: { type: 'array', items: ACCION_ITEM },
        evento: { type: 'string', enum: EVENTO_ENUM },
        detalleEvento: { type: 'object', additionalProperties: true },
        razonamientoProtocolo: { type: 'string' },
        letrasUsadasResultantes: {
          type: 'object',
          properties: {
            R: { type: 'array', items: { type: 'string' } },
            L: { type: 'array', items: { type: 'string' } }
          },
          required: ['R', 'L'],
          additionalProperties: false
        }
      },
      required: [
        'estadoPatch',
        'acciones',
        'evento',
        'detalleEvento',
        'razonamientoProtocolo',
        'letrasUsadasResultantes'
      ],
      additionalProperties: false
    }
  },
  required: [
    'fase',
    'modo',
    'ojoActual',
    'agudeza',
    'rx',
    'interpretacion',
    'intentoRecienRegistrado',
    'propuestaProtocolo'
  ],
  additionalProperties: false
};

export const VISTA_COMUNICACION_SCHEMA = {
  type: 'object',
  properties: {
    fase: { type: 'string' },
    modo: { type: 'string', enum: ['respuesta', 'bootstrap'] },
    evento: { type: 'string', enum: EVENTO_ENUM },
    detalleEvento: { type: 'object', additionalProperties: true },
    huboCambioDispositivo: { type: 'boolean' },
    esPrimerTurnoExamen: { type: 'boolean' },
    esPrimerTurnoOjoActivo: { type: 'boolean' },
    esCambioDeOjo: { type: 'boolean' },
    esExamenFinalizado: { type: 'boolean' },
    interpretacion: {
      type: 'object',
      properties: {
        clasificacion: { type: 'string', enum: CLASIFICACION_ENUM },
        notasInterprete: { type: 'string' }
      },
      required: ['clasificacion', 'notasInterprete'],
      additionalProperties: false
    },
    estadoResumido: {
      type: 'object',
      properties: {
        ojoActual: { type: 'string', enum: ['R', 'L'] },
        R_cerrado: { type: 'boolean' },
        L_cerrado: { type: 'boolean' }
      },
      required: ['ojoActual', 'R_cerrado', 'L_cerrado'],
      additionalProperties: false
    }
  },
  required: [
    'fase',
    'modo',
    'evento',
    'detalleEvento',
    'huboCambioDispositivo',
    'esPrimerTurnoExamen',
    'esPrimerTurnoOjoActivo',
    'esCambioDeOjo',
    'esExamenFinalizado',
    'interpretacion',
    'estadoResumido'
  ],
  additionalProperties: false
};

export { CLASIFICACION_ENUM, EVENTO_ENUM };
