import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  armarVistaInterprete,
  armarVistaProtocolo,
  armarVistaAuditor,
  armarVistaComunicacion,
  vistaContieneCampoProhibido,
  CAMPOS_PROHIBIDOS_VISTA
} from '../lib/vistasAgentes.js';
import { validarContraSchema } from '../lib/validarSchema.js';
import {
  VISTA_INTERPRETE_SCHEMA,
  VISTA_PROTOCOLO_SCHEMA,
  VISTA_AUDITOR_SCHEMA,
  VISTA_COMUNICACION_SCHEMA
} from '../agents/schemas.js';
import {
  aplicarRegistroIntento,
  crearResultadosPorLogmarVacio
} from '../lib/registroAgudeza.js';

function estadoBase() {
  return {
    fase: 'agudeza',
    ojoActual: 'L',
    rx: {
      R: { esfera: 0.75, cilindro: -1.75, angulo: 60 },
      L: { esfera: 2.75, cilindro: 0, angulo: 0 }
    },
    agudeza: {
      R: {
        logmarActual: null,
        letraActual: null,
        letrasUsadas: ['H', 'O', 'T', 'E'],
        logmarFinal: 0.2,
        resultadosPorLogmar: crearResultadosPorLogmarVacio()
      },
      L: {
        logmarActual: 0.3,
        letraActual: 'H',
        letrasUsadas: ['H', 'O'],
        logmarFinal: null,
        resultadosPorLogmar: crearResultadosPorLogmarVacio()
      }
    },
    historial: [{ ts: 'x' }],
    intentosRegistrados: []
  };
}

describe('armarVistaInterprete', () => {
  it('devuelve shape con estimulo y respuesta', () => {
    const estado = estadoBase();
    const vista = armarVistaInterprete(estado, 'veo una h', 0.9, 'respuesta');
    assert.equal(vista.fase, 'agudeza');
    assert.equal(vista.modo, 'respuesta');
    assert.equal(vista.estimulo.letraActual, 'H');
    assert.equal('logmarActual' in vista.estimulo, false);
    assert.equal('ojo' in vista.estimulo, false);
    assert.equal('tipo' in vista.estimulo, false);
    assert.equal(vista.respuestaPaciente, 'veo una h');
    assert.equal(vistaContieneCampoProhibido(vista), false);
  });

  it('sin respuesta → respuestaPaciente null', () => {
    const vista = armarVistaInterprete(estadoBase(), null, 1, 'respuesta');
    assert.equal(vista.respuestaPaciente, null);
  });
});

describe('armarVistaProtocolo', () => {
  it('no incluye campos prohibidos del estado completo', () => {
    const estado = estadoBase();
    estado.agudeza.L.resultadosPorLogmar['0.3'] = {
      correcto: 2,
      incorrecto: 0
    };
    const vista = armarVistaProtocolo(
      estado,
      { clasificacion: 'correcta', letrasCandidatas: ['H'], letraElegida: 'H', notasInterprete: 'ok' },
      'respuesta',
      null
    );
    for (const campo of CAMPOS_PROHIBIDOS_VISTA) {
      assert.equal(vistaContieneCampoProhibido(vista), false, `no debe incluir ${campo}`);
    }
    assert.deepEqual(vista.agudeza.L.contadoresLogmarActual, {
      correcto: 2,
      incorrecto: 0
    });
    assert.equal(vista.agudeza.R.logmarFinal, 0.2);
    assert.equal('logmarActual' in vista.agudeza.R, false);
    assert.deepEqual(vista.interpretacion, {
      clasificacion: 'correcta',
      letraElegida: 'H'
    });
  });

  it('contadoresLogmarActual en 0.0 tras correcta (BUG-007)', () => {
    const estado = estadoBase();
    estado.agudeza.L.logmarActual = 0;
    estado.agudeza.L.letraActual = 'E';
    estado.agudeza.L.letrasUsadas = ['H', 'O', 'T', 'E'];
    aplicarRegistroIntento(estado.agudeza.L, 0, 'correcta');

    const interpretacion = {
      clasificacion: 'correcta',
      letrasCandidatas: ['E'],
      letraElegida: 'E',
      notasInterprete: 'ok'
    };
    const vista = armarVistaProtocolo(estado, interpretacion, 'respuesta', null);
    assert.deepEqual(vista.agudeza.L.contadoresLogmarActual, {
      correcto: 1,
      incorrecto: 0
    });

    const vistaAuditor = armarVistaAuditor(
      estado,
      interpretacion,
      {
        estadoPatch: {},
        acciones: [],
        evento: 'siguiente_optotipo',
        detalleEvento: {},
        razonamientoProtocolo: ''
      },
      'respuesta',
      {
        registrado: true,
        ojo: 'L',
        logmarEstimulo: 0,
        letraEstimulo: 'E',
        clasificacion: 'correcta',
        duplicado: false
      }
    );
    assert.deepEqual(
      vistaAuditor.intentoRecienRegistrado.contadoresPostRegistro,
      { correcto: 1, incorrecto: 0 }
    );
  });

  it('bootstrap con feedbackAuditor', () => {
    const estado = estadoBase();
    estado.ojoActual = 'R';
    estado.agudeza.R.logmarActual = null;
    estado.agudeza.L.logmarFinal = null;
    const vista = armarVistaProtocolo(
      estado,
      { clasificacion: 'continuacion', letrasCandidatas: [], letraElegida: null, notasInterprete: 'bootstrap' },
      'bootstrap',
      { violaciones: ['x'], correccionSugerida: 'y' }
    );
    assert.equal(vista.modo, 'bootstrap');
    assert.deepEqual(vista.feedbackAuditor.violaciones, ['x']);
  });
});

describe('armarVistaAuditor', () => {
  it('simula letrasUsadas encogidas tras patch', () => {
    const estado = estadoBase();
    const propuesta = {
      estadoPatch: {
        agudeza: { L: { letraActual: 'H', letrasUsadas: ['H'] } }
      },
      acciones: [],
      evento: 'siguiente_optotipo',
      detalleEvento: {},
      razonamientoProtocolo: 'test'
    };
    const vista = armarVistaAuditor(
      estado,
      { clasificacion: 'correcta', letrasCandidatas: [], letraElegida: 'H', notasInterprete: '' },
      propuesta,
      'respuesta',
      {
        registrado: true,
        ojo: 'L',
        logmarEstimulo: 0.3,
        letraEstimulo: 'H',
        clasificacion: 'correcta',
        duplicado: false
      }
    );
    assert.deepEqual(vista.propuestaProtocolo.letrasUsadasResultantes.L, ['H']);
    assert.equal(vista.intentoRecienRegistrado.ojo, 'L');
  });

  it('bootstrap omite intentoRecienRegistrado', () => {
    const vista = armarVistaAuditor(
      estadoBase(),
      { clasificacion: 'continuacion', letrasCandidatas: [], letraElegida: null, notasInterprete: '' },
      { estadoPatch: {}, acciones: [], evento: 'inicio_ojo', detalleEvento: {}, razonamientoProtocolo: '' },
      'bootstrap',
      null
    );
    assert.equal(vista.intentoRecienRegistrado, null);
  });
});

describe('armarVistaComunicacion', () => {
  it('esCambioDeOjo cuando patch cambia ojoActual', () => {
    const estadoAntes = estadoBase();
    estadoAntes.ojoActual = 'R';
    const estadoTras = { ...estadoBase(), ojoActual: 'L' };
    const vista = armarVistaComunicacion({
      interpretacion: { clasificacion: 'correcta', notasInterprete: '' },
      propuestaProtocolo: {
        evento: 'cierre_ojo_R_e_inicio_L',
        detalleEvento: {},
        estadoPatch: { ojoActual: 'L' }
      },
      estadoTrasRegistro: estadoTras,
      estadoAntes,
      modo: 'respuesta',
      huboCambioDispositivo: true
    });
    assert.equal(vista.esCambioDeOjo, true);
    assert.equal('modo' in vista, false);
  });

  it('esPrimerTurnoExamen con historial vacío', () => {
    const estado = estadoBase();
    estado.historial = [];
    const vista = armarVistaComunicacion({
      interpretacion: { clasificacion: 'continuacion', notasInterprete: '' },
      propuestaProtocolo: { evento: 'inicio_ojo', detalleEvento: {}, estadoPatch: {} },
      estadoTrasRegistro: estado,
      estadoAntes: estado,
      modo: 'bootstrap',
      huboCambioDispositivo: true
    });
    assert.equal(vista.esPrimerTurnoExamen, true);
  });

  it('esExamenFinalizado por evento', () => {
    const vista = armarVistaComunicacion({
      interpretacion: { clasificacion: 'correcta', notasInterprete: '' },
      propuestaProtocolo: {
        evento: 'examen_finalizado',
        detalleEvento: {},
        estadoPatch: { fase: 'finalizado' }
      },
      estadoTrasRegistro: estadoBase(),
      estadoAntes: estadoBase(),
      modo: 'respuesta',
      huboCambioDispositivo: false
    });
    assert.equal(vista.esExamenFinalizado, true);
  });
});

describe('validación schema vistas', () => {
  it('rechaza VistaInterprete con campo extra', () => {
    assert.throws(() =>
      validarContraSchema(VISTA_INTERPRETE_SCHEMA, {
        fase: 'agudeza',
        modo: 'respuesta',
        estimulo: { letraActual: null },
        respuestaPaciente: null,
        confianza: 1,
        historial: []
      })
    );
  });

  it('acepta ejemplos válidos mínimos de comunicación', () => {
    const vista = armarVistaComunicacion({
      interpretacion: { clasificacion: 'correcta', notasInterprete: 'n' },
      propuestaProtocolo: { evento: 'siguiente_optotipo', detalleEvento: {}, estadoPatch: {} },
      estadoTrasRegistro: estadoBase(),
      estadoAntes: estadoBase(),
      modo: 'respuesta',
      huboCambioDispositivo: false
    });
    validarContraSchema(VISTA_COMUNICACION_SCHEMA, vista);
    validarContraSchema(
      VISTA_PROTOCOLO_SCHEMA,
      armarVistaProtocolo(estadoBase(), {
        clasificacion: 'correcta',
        letrasCandidatas: [],
        letraElegida: null,
        notasInterprete: ''
      })
    );
    validarContraSchema(VISTA_AUDITOR_SCHEMA, armarVistaAuditor(estadoBase(), { clasificacion: 'correcta', letrasCandidatas: [], letraElegida: null, notasInterprete: '' }, { estadoPatch: {}, acciones: [], evento: 'siguiente_optotipo', detalleEvento: {}, razonamientoProtocolo: '' }, 'respuesta', null));
  });
});
