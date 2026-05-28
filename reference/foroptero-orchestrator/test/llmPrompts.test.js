import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  guardarPromptsEnHistorial,
  crearLlmPromptsTurno,
  pushIntentoPrompt,
  setPromptAgente
} from '../lib/llmPrompts.js';
import { construirUser as construirUserProtocolo } from '../agents/protocolo.js';

describe('llmPrompts', () => {
  const prev = process.env.PIPELINE_GUARDAR_PROMPTS;

  afterEach(() => {
    if (prev === undefined) delete process.env.PIPELINE_GUARDAR_PROMPTS;
    else process.env.PIPELINE_GUARDAR_PROMPTS = prev;
  });

  it('guardarPromptsEnHistorial default true', () => {
    delete process.env.PIPELINE_GUARDAR_PROMPTS;
    assert.equal(guardarPromptsEnHistorial(), true);
  });

  it('guardarPromptsEnHistorial respeta false', () => {
    process.env.PIPELINE_GUARDAR_PROMPTS = 'false';
    assert.equal(guardarPromptsEnHistorial(), false);
  });

  it('crearLlmPromptsTurno acumula intentos protocolo y auditor', () => {
    const p = crearLlmPromptsTurno();
    pushIntentoPrompt(p, 'protocolo', 0, 'user-0', { ojoActual: 'R' });
    pushIntentoPrompt(p, 'auditor', 0, 'audit-0', { aprobado: null });
    assert.equal(p.protocolo.intentos.length, 1);
    assert.equal(p.protocolo.intentos[0].user, 'user-0');
    assert.equal(p.auditor.intentos[0].intento, 0);
    assert.notEqual(p.protocolo.intentos[0].vista, { ojoActual: 'R' });
  });

  it('setPromptAgente interprete bootstrap', () => {
    const p = crearLlmPromptsTurno();
    setPromptAgente(p, 'interprete', { invocado: false, motivo: 'bootstrap' });
    assert.equal(p.interprete.invocado, false);
    assert.equal(p.interprete.motivo, 'bootstrap');
    assert.equal(p.interprete.user, undefined);
  });
});

describe('construirUserProtocolo', () => {
  it('incluye VistaProtocolo y reglas inline', () => {
    const vista = {
      fase: 'agudeza',
      modo: 'respuesta',
      ojoActual: 'L',
      agudeza: {
        R: { logmarFinal: 0.2, contadoresLogmarActual: null },
        L: {
          logmarActual: 0,
          contadoresLogmarActual: { correcto: 2, incorrecto: 0 }
        }
      },
      rx: { R: {}, L: {} },
      interpretacion: { clasificacion: 'correcta' },
      feedbackAuditor: null
    };
    const user = construirUserProtocolo(vista);
    assert.match(user, /VistaProtocolo/);
    assert.match(user, /"correcto": 2/);
    assert.match(user, /Aplicá el protocolo/);
  });
});
