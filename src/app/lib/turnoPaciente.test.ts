import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  asignarDesdeTranscripcion,
  limpiarTurnoPaciente,
  resetTurnoPacienteState,
  resolverTurnoParaRequest
} from './turnoPaciente.ts';

const T0 = new Date('2026-05-19T18:00:00.000Z');
const T1 = new Date('2026-05-19T19:00:00.000Z');

beforeEach(() => {
  resetTurnoPacienteState();
});

describe('asignarDesdeTranscripcion', () => {
  it('ignora placeholders', () => {
    asignarDesdeTranscripcion('[inaudible]', () => T0);
    assert.equal(resolverTurnoParaRequest(), null);
    assert.equal(resolverTurnoParaRequest(null), null);
  });

  it('asigna texto y timestamp ISO', () => {
    asignarDesdeTranscripcion('veo una hache', () => T0);
    const t = resolverTurnoParaRequest();
    assert.deepEqual(t, {
      respuestaPaciente: 'veo una hache',
      timestamp: '2026-05-19T18:00:00.000Z'
    });
  });
});

describe('resolverTurnoParaRequest', () => {
  it('prioriza STT sobre texto del modelo', () => {
    asignarDesdeTranscripcion('veo una o', () => T0);
    const t = resolverTurnoParaRequest('veo una hache');
    assert.equal(t?.respuestaPaciente, 'veo una o');
    assert.equal(t?.timestamp, '2026-05-19T18:00:00.000Z');
  });

  it('mantiene el mismo timestamp en lecturas sucesivas sin limpiar', () => {
    asignarDesdeTranscripcion('veo una o', () => T0);
    const a = resolverTurnoParaRequest();
    const b = resolverTurnoParaRequest();
    assert.equal(a?.timestamp, b?.timestamp);
  });

  it('fallback estable para reintentos con mismo texto del modelo', () => {
    const a = resolverTurnoParaRequest('veo una e', () => T0);
    const b = resolverTurnoParaRequest('veo una e', () => T1);
    assert.equal(a?.timestamp, b?.timestamp);
    assert.equal(a?.respuestaPaciente, 'veo una e');
  });

  it('nuevo timestamp tras limpiar y nueva asignación', () => {
    asignarDesdeTranscripcion('primera', () => T0);
    limpiarTurnoPaciente();
    asignarDesdeTranscripcion('segunda', () => T1);
    const t = resolverTurnoParaRequest();
    assert.equal(t?.respuestaPaciente, 'segunda');
    assert.equal(t?.timestamp, '2026-05-19T19:00:00.000Z');
  });
});
