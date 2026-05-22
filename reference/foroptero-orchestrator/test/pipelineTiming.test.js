import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crearTimingMs, finalizarTimingMs } from '../pipelineTurno.js';

describe('pipeline timing', () => {
  it('finalizarTimingMs suma agentes en total', () => {
    const timing = crearTimingMs();
    timing.interprete = 0;
    timing.protocolo = 890;
    timing.auditor = 710;
    timing.comunicacion = 540;
    finalizarTimingMs(timing);
    assert.equal(timing.total, 2140);
  });

  it('acumula reintentos protocolo y auditor', () => {
    const timing = crearTimingMs();
    timing.interprete = 620;
    timing.protocolo = 400 + 490;
    timing.auditor = 350 + 360;
    timing.comunicacion = 500;
    finalizarTimingMs(timing);
    assert.equal(timing.protocolo, 890);
    assert.equal(timing.auditor, 710);
    assert.equal(timing.total, 2720);
  });
});
