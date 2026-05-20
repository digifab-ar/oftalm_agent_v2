import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validarContraSchema } from '../lib/validarSchema.js';
import {
  VISTA_INTERPRETE_SCHEMA,
  VISTA_PROTOCOLO_SCHEMA,
  VISTA_AUDITOR_SCHEMA,
  VISTA_COMUNICACION_SCHEMA
} from '../agents/schemas.js';

const vistaInterpreteValida = {
  fase: 'agudeza',
  modo: 'respuesta',
  estimulo: { tipo: 'letra_logmar', letraActual: 'H', logmarActual: 0.3, ojo: 'L' },
  respuestaPaciente: 'h',
  confianza: 0.9
};

const ojoVista = {
  logmarActual: 0.3,
  letraActual: 'H',
  letrasUsadas: ['H'],
  logmarFinal: null,
  contadoresLogmarActual: { correcto: 1, incorrecto: 0 }
};

const vistaProtocoloValida = {
  fase: 'agudeza',
  modo: 'respuesta',
  ojoActual: 'L',
  agudeza: { R: { ...ojoVista, logmarActual: null, contadoresLogmarActual: null }, L: ojoVista },
  rx: {
    R: { esfera: 0.75, cilindro: -1.75, angulo: 60 },
    L: { esfera: 2.75, cilindro: 0, angulo: 0 }
  },
  interpretacion: {
    clasificacion: 'correcta',
    letraElegida: 'H',
    letrasCandidatas: ['H'],
    notasInterprete: 'ok'
  },
  feedbackAuditor: null
};

describe('VISTA_*_SCHEMA ejemplos válidos', () => {
  it('VistaInterprete', () => {
    assert.doesNotThrow(() =>
      validarContraSchema(VISTA_INTERPRETE_SCHEMA, vistaInterpreteValida)
    );
  });

  it('VistaProtocolo', () => {
    assert.doesNotThrow(() =>
      validarContraSchema(VISTA_PROTOCOLO_SCHEMA, vistaProtocoloValida)
    );
  });

  it('VistaAuditor', () => {
    const { feedbackAuditor, ...baseProtocolo } = vistaProtocoloValida;
    assert.doesNotThrow(() =>
      validarContraSchema(VISTA_AUDITOR_SCHEMA, {
        ...baseProtocolo,
        intentoRecienRegistrado: {
          ojo: 'L',
          logmarEstimulo: 0.3,
          letraEstimulo: 'H',
          clasificacion: 'correcta',
          duplicado: false,
          contadoresPostRegistro: { correcto: 1, incorrecto: 0 }
        },
        propuestaProtocolo: {
          estadoPatch: {},
          acciones: [],
          evento: 'siguiente_optotipo',
          detalleEvento: {},
          razonamientoProtocolo: 'x',
          letrasUsadasResultantes: { R: [], L: ['H'] }
        }
      })
    );
  });

  it('VistaComunicacion', () => {
    assert.doesNotThrow(() =>
      validarContraSchema(VISTA_COMUNICACION_SCHEMA, {
        fase: 'agudeza',
        modo: 'respuesta',
        evento: 'siguiente_optotipo',
        detalleEvento: {},
        huboCambioDispositivo: true,
        esPrimerTurnoExamen: false,
        esPrimerTurnoOjoActivo: false,
        esCambioDeOjo: false,
        esExamenFinalizado: false,
        interpretacion: { clasificacion: 'correcta', notasInterprete: 'n' },
        estadoResumido: { ojoActual: 'L', R_cerrado: true, L_cerrado: false }
      })
    );
  });
});

describe('VISTA_*_SCHEMA ejemplos inválidos', () => {
  it('VistaInterprete sin confianza', () => {
    const { confianza, ...sin } = vistaInterpreteValida;
    assert.throws(() => validarContraSchema(VISTA_INTERPRETE_SCHEMA, sin));
  });

  it('VistaProtocolo con historial', () => {
    assert.throws(() =>
      validarContraSchema(VISTA_PROTOCOLO_SCHEMA, {
        ...vistaProtocoloValida,
        historial: []
      })
    );
  });

  it('VistaComunicacion modo inválido', () => {
    assert.throws(() =>
      validarContraSchema(VISTA_COMUNICACION_SCHEMA, {
        ...vistaProtocoloValida,
        modo: 'invalido',
        evento: 'siguiente_optotipo',
        detalleEvento: {},
        huboCambioDispositivo: false,
        esPrimerTurnoExamen: false,
        esPrimerTurnoOjoActivo: false,
        esCambioDeOjo: false,
        esExamenFinalizado: false,
        interpretacion: { clasificacion: 'correcta', notasInterprete: '' },
        estadoResumido: { ojoActual: 'L', R_cerrado: false, L_cerrado: false }
      })
    );
  });
});
