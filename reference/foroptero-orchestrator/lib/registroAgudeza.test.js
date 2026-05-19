import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarRegistroIntento,
  buildIntentId,
  crearResultadosPorLogmarVacio,
  debeRegistrarIntento,
  logmarAClave
} from './registroAgudeza.js';

function ojoVacio() {
  return {
    logmarActual: 0.3,
    letraActual: 'H',
    aciertosPorLogmar: { '0.3': 0, '0.2': 0, '0.1': 0, '0.0': 0 },
    resultadosPorLogmar: crearResultadosPorLogmarVacio(),
    letrasUsadas: ['H']
  };
}

describe('logmarAClave', () => {
  it('normaliza 0.3', () => {
    assert.equal(logmarAClave(0.3), '0.3');
    assert.equal(logmarAClave('0.3'), '0.3');
  });
});

describe('debeRegistrarIntento', () => {
  it('registra correcta en modo respuesta', () => {
    assert.equal(debeRegistrarIntento('correcta', 'respuesta'), true);
  });
  it('no registra ambigua ni bootstrap', () => {
    assert.equal(debeRegistrarIntento('ambigua', 'respuesta'), false);
    assert.equal(debeRegistrarIntento('correcta', 'bootstrap'), false);
  });
});

describe('aplicarRegistroIntento', () => {
  it('incrementa correcto en 0.3', () => {
    const ojo = ojoVacio();
    const r = aplicarRegistroIntento(ojo, 0.3, 'correcta');
    assert.equal(r.aplicado, true);
    assert.equal(ojo.resultadosPorLogmar['0.3'].correcto, 1);
    assert.equal(ojo.aciertosPorLogmar['0.3'], 1);
  });

  it('incrementa incorrecto en 0.1', () => {
    const ojo = ojoVacio();
    ojo.logmarActual = 0.1;
    aplicarRegistroIntento(ojo, 0.1, 'incorrecta');
    assert.equal(ojo.resultadosPorLogmar['0.1'].incorrecto, 1);
    assert.equal(ojo.resultadosPorLogmar['0.1'].correcto, 0);
  });

  it('no resetea correctos previos', () => {
    const ojo = ojoVacio();
    aplicarRegistroIntento(ojo, 0.3, 'correcta');
    ojo.logmarActual = 0.2;
    aplicarRegistroIntento(ojo, 0.2, 'no_ve');
    assert.equal(ojo.resultadosPorLogmar['0.3'].correcto, 1);
    assert.equal(ojo.resultadosPorLogmar['0.2'].incorrecto, 1);
  });
});

describe('buildIntentId', () => {
  it('es estable para mismo input', () => {
    const a = buildIntentId('veo una o', '2026-05-19T18:00:00.000Z');
    const b = buildIntentId('veo una o', '2026-05-19T18:00:00.000Z');
    assert.equal(a, b);
  });
  it('cambia con otro timestamp', () => {
    const a = buildIntentId('veo una o', 't1');
    const b = buildIntentId('veo una o', 't2');
    assert.notEqual(a, b);
  });
});
