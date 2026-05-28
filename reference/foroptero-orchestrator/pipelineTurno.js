import {
  aplicarEstadoPatch,
  snapshotEstadoExamen,
  registrarIntentoAgudeza,
  registrarTurnoHistorial
} from './estadoExamen.js';
import { ejecutarAcciones } from './ejecutarAcciones.js';
import {
  armarVistaInterprete,
  armarVistaProtocolo,
  armarVistaAuditor,
  armarVistaComunicacion
} from './lib/vistasAgentes.js';
import { ejecutarInterprete, construirUser as construirUserInterprete } from './agents/interprete.js';
import { ejecutarProtocolo, construirUser as construirUserProtocolo } from './agents/protocolo.js';
import { ejecutarAuditor, construirUser as construirUserAuditor } from './agents/auditor.js';
import { ejecutarComunicacion, construirUser as construirUserComunicacion } from './agents/comunicacion.js';
import {
  guardarPromptsEnHistorial,
  crearLlmPromptsTurno,
  pushIntentoPrompt,
  setPromptAgente
} from './lib/llmPrompts.js';

const MAX_REINTENTOS_PROTOCOLO = 1;

/** @returns {{ interprete: number, protocolo: number, auditor: number, comunicacion: number, total: number }} */
export function crearTimingMs() {
  return {
    interprete: 0,
    protocolo: 0,
    auditor: 0,
    comunicacion: 0,
    total: 0
  };
}

/** Suma agentes LLM (sin MQTT). */
export function finalizarTimingMs(timing) {
  timing.total =
    timing.interprete +
    timing.protocolo +
    timing.auditor +
    timing.comunicacion;
  return timing;
}

async function medirMs(fn) {
  const t0 = performance.now();
  const result = await fn();
  return { result, ms: Math.round(performance.now() - t0) };
}

const CLASIFICACIONES_CLINICAS_CLARAS = new Set([
  'correcta',
  'incorrecta',
  'no_ve'
]);

/**
 * Detecta si el ojo activo aún no fue inicializado clínicamente (bootstrap).
 * @param {object} estado
 * @returns {'bootstrap' | 'respuesta'}
 */
export function detectarModoTurno(estado) {
  const ojo = estado.ojoActual;
  const agudeza = estado.agudeza?.[ojo];
  if (!agudeza) {
    return 'respuesta';
  }
  if (
    agudeza.letraActual == null &&
    agudeza.logmarActual == null &&
    agudeza.logmarFinal == null
  ) {
    return 'bootstrap';
  }
  return 'respuesta';
}

/** Interpretación fija para turno bootstrap (sin LLM). */
export function interpretacionBootstrap() {
  return {
    clasificacion: 'continuacion',
    letrasCandidatas: [],
    letraElegida: null,
    notasInterprete: 'turno bootstrap'
  };
}

function aPasosHablar(mensajes) {
  return mensajes.map((mensaje, i) => ({
    tipo: 'hablar',
    orden: i + 1,
    mensaje
  }));
}

function armarRazonamientoInterno(traza, modo) {
  const i = traza.interpretacion;
  const p = traza.propuestaProtocolo;
  const a = traza.auditoria;
  const c = traza.comunicacion;
  return [
    `modo: ${modo}`,
    `interpretacion: ${i?.clasificacion ?? '?'}`,
    i?.notasInterprete ? `notas: ${i.notasInterprete}` : null,
    `protocolo evento: ${p?.evento ?? '?'}`,
    p?.razonamientoProtocolo ?? null,
    `auditor: ${a?.aprobado ? 'aprobado' : 'rechazado'}`,
    a?.violaciones?.length ? `violaciones: ${a.violaciones.join('; ')}` : null,
    c?.razonamientoComunicacion ?? null
  ]
    .filter(Boolean)
    .join('\n');
}

/** Fallback fonético / pipeline genérico. */
function fallbackRepregunta() {
  return {
    propuestaProtocolo: {
      estadoPatch: {},
      acciones: [],
      evento: 'repregunta_sin_cambio',
      detalleEvento: { motivo: 'fallback_repregunta' },
      razonamientoProtocolo: 'fallback: repregunta sin cambio'
    },
    comunicacion: {
      mensajesPaciente: [
        'No llegué a entender bien la letra. ¿Podés repetir el nombre de la letra que ves en la pantalla?'
      ],
      contextoVoz: 'esperar_respuesta',
      razonamientoComunicacion: 'fallback repregunta'
    }
  };
}

/** Fallback cuando el auditor rechaza tras reintentos (no confundir con ambigua fonética). */
function fallbackAuditoria(interpretacion) {
  const clas = interpretacion?.clasificacion;
  const clinicaClara = CLASIFICACIONES_CLINICAS_CLARAS.has(clas);

  return {
    propuestaProtocolo: {
      estadoPatch: {},
      acciones: [],
      evento: 'repregunta_sin_cambio',
      detalleEvento: { motivo: 'fallback_auditoria' },
      razonamientoProtocolo: 'fallback: auditoría rechazó propuesta de protocolo'
    },
    comunicacion: {
      mensajesPaciente: clinicaClara
        ? [
            'Un momento, estoy ajustando el examen. Mirá la pantalla y decime qué letra ves.'
          ]
        : [
            'No llegué a entender bien la letra. ¿Podés repetir el nombre de la letra que ves en la pantalla?'
          ],
      contextoVoz: 'esperar_respuesta',
      razonamientoComunicacion: clinicaClara
        ? 'fallback auditoría (respuesta clínica entendida)'
        : 'fallback auditoría (repregunta fonética)'
    }
  };
}

/** Fallback neutro cuando falla el bootstrap (sin asumir letra en pantalla). */
function fallbackBootstrap() {
  return {
    propuestaProtocolo: {
      estadoPatch: {},
      acciones: [],
      evento: 'error_bootstrap',
      detalleEvento: { motivo: 'fallback_bootstrap' },
      razonamientoProtocolo: 'fallback: error al iniciar examen'
    },
    comunicacion: {
      mensajesPaciente: [
        'Hubo un problema al iniciar el examen. Por favor, esperá un momento e intentá de nuevo.'
      ],
      contextoVoz: 'esperar_respuesta',
      razonamientoComunicacion: 'fallback bootstrap'
    }
  };
}

async function protocoloConAuditoria(
  estadoTrasRegistro,
  interpretacion,
  modo,
  registroIntento,
  timing,
  llmPrompts
) {
  let feedbackAuditor = null;
  const opciones = { modo };
  const guardarPrompts = llmPrompts != null;

  for (let intento = 0; intento <= MAX_REINTENTOS_PROTOCOLO; intento++) {
    const vistaProtocolo = armarVistaProtocolo(
      estadoTrasRegistro,
      interpretacion,
      modo,
      feedbackAuditor
    );
    if (guardarPrompts) {
      pushIntentoPrompt(
        llmPrompts,
        'protocolo',
        intento,
        construirUserProtocolo(vistaProtocolo),
        vistaProtocolo
      );
    }
    const protocolo = await medirMs(() =>
      ejecutarProtocolo(vistaProtocolo, opciones)
    );
    timing.protocolo += protocolo.ms;
    const propuesta = protocolo.result;

    const vistaAuditor = armarVistaAuditor(
      estadoTrasRegistro,
      interpretacion,
      propuesta,
      modo,
      registroIntento
    );
    if (guardarPrompts) {
      pushIntentoPrompt(
        llmPrompts,
        'auditor',
        intento,
        construirUserAuditor(vistaAuditor),
        vistaAuditor
      );
    }
    const auditor = await medirMs(() =>
      ejecutarAuditor(vistaAuditor, opciones)
    );
    timing.auditor += auditor.ms;
    const auditoria = auditor.result;

    if (auditoria.aprobado) {
      return { propuesta, auditoria, reintentos: intento };
    }

    if (intento >= MAX_REINTENTOS_PROTOCOLO) {
      return { propuesta, auditoria, reintentos: intento, falloAuditor: true };
    }

    feedbackAuditor = {
      violaciones: auditoria.violaciones,
      correccionSugerida: auditoria.correccionSugerida
    };
  }

  return null;
}

/**
 * Pipeline: intérprete → protocolo → auditor → [patch + MQTT] → comunicación.
 */
export async function procesarTurnoPipeline(
  respuestaPaciente = null,
  confianza = 1,
  options = {}
) {
  const estadoAntes = snapshotEstadoExamen();
  if (!estadoAntes) {
    return { ok: false, error: 'Examen no iniciado' };
  }

  const modo = detectarModoTurno(estadoAntes);
  console.log(`📋 Pipeline modo turno: ${modo} (fase: ${estadoAntes.fase})`);

  const conf =
    typeof confianza === 'number' && !Number.isNaN(confianza)
      ? Math.min(1, Math.max(0, confianza))
      : 1;

  const turnoTimestamp =
    options.timestamp != null && String(options.timestamp).trim() !== ''
      ? String(options.timestamp).trim()
      : new Date().toISOString();

  const traza = {
    modo,
    interpretacion: null,
    registroIntento: null,
    propuestaProtocolo: null,
    auditoria: null,
    comunicacion: null,
    falloAuditor: false
  };

  const timingMs = crearTimingMs();
  const llmPrompts = guardarPromptsEnHistorial() ? crearLlmPromptsTurno() : null;

  try {
    if (modo === 'bootstrap') {
      traza.interpretacion = interpretacionBootstrap();
      timingMs.interprete = 0;
      if (llmPrompts) {
        setPromptAgente(llmPrompts, 'interprete', {
          invocado: false,
          motivo: 'bootstrap'
        });
      }
    } else {
      const vistaInterprete = armarVistaInterprete(
        estadoAntes,
        respuestaPaciente,
        conf,
        modo
      );
      if (llmPrompts) {
        setPromptAgente(llmPrompts, 'interprete', {
          invocado: true,
          user: construirUserInterprete(vistaInterprete),
          vista: vistaInterprete
        });
      }
      const interprete = await medirMs(() =>
        ejecutarInterprete(vistaInterprete, { modo })
      );
      traza.interpretacion = interprete.result;
      timingMs.interprete = interprete.ms;
    }

    if (modo === 'respuesta') {
      traza.registroIntento = registrarIntentoAgudeza({
        interpretacion: traza.interpretacion,
        respuestaPaciente:
          respuestaPaciente != null ? String(respuestaPaciente).trim() : null,
        timestamp: turnoTimestamp,
        modo
      });
      if (traza.registroIntento.registrado) {
        console.log(
          `📊 Registro intento: ojo ${traza.registroIntento.ojo} @ logmar ${traza.registroIntento.logmarEstimulo} (${traza.registroIntento.clasificacion})` +
            (traza.registroIntento.duplicado ? ' [duplicado]' : '')
        );
      }
    }

    const estadoTrasRegistro = snapshotEstadoExamen();

    const resultadoProtocolo = await protocoloConAuditoria(
      estadoTrasRegistro,
      traza.interpretacion,
      modo,
      traza.registroIntento,
      timingMs,
      llmPrompts
    );

    if (!resultadoProtocolo) {
      throw new Error('Protocolo sin resultado');
    }

    traza.propuestaProtocolo = resultadoProtocolo.propuesta;
    traza.auditoria = resultadoProtocolo.auditoria;
    traza.falloAuditor = Boolean(resultadoProtocolo.falloAuditor);

    let propuestaAplicar = traza.propuestaProtocolo;
    let comunicacion;
    let huboCambioDispositivo = false;

    if (traza.falloAuditor) {
      let fb;
      if (modo === 'bootstrap') {
        fb = fallbackBootstrap();
      } else {
        fb = fallbackAuditoria(traza.interpretacion);
      }
      propuestaAplicar = fb.propuestaProtocolo;
      comunicacion = fb.comunicacion;
      timingMs.comunicacion = 0;
      if (llmPrompts) {
        setPromptAgente(llmPrompts, 'comunicacion', {
          invocado: false,
          motivo: propuestaAplicar.detalleEvento?.motivo ?? 'fallback_auditoria'
        });
      }
      console.warn(
        `⚠️ Pipeline (${modo}): auditor rechazó tras reintentos; fallback ${
          propuestaAplicar.detalleEvento?.motivo ?? 'desconocido'
        }`
      );
    } else {
      huboCambioDispositivo =
        Array.isArray(propuestaAplicar.acciones) &&
        propuestaAplicar.acciones.length > 0;
      const vistaComunicacion = armarVistaComunicacion({
        interpretacion: traza.interpretacion,
        propuestaProtocolo: propuestaAplicar,
        estadoTrasRegistro,
        estadoAntes,
        modo,
        huboCambioDispositivo
      });
      if (llmPrompts) {
        setPromptAgente(llmPrompts, 'comunicacion', {
          invocado: true,
          user: construirUserComunicacion(vistaComunicacion),
          vista: vistaComunicacion
        });
      }
      const comm = await medirMs(() =>
        ejecutarComunicacion(vistaComunicacion, { modo })
      );
      comunicacion = comm.result;
      timingMs.comunicacion = comm.ms;
    }

    traza.comunicacion = comunicacion;
    if (llmPrompts) {
      traza.llmPrompts = llmPrompts;
    }

    aplicarEstadoPatch(propuestaAplicar.estadoPatch);
    const accionesEjecutadas = await ejecutarAcciones(propuestaAplicar.acciones);

    const razonamientoInterno = armarRazonamientoInterno(traza, modo);
    finalizarTimingMs(timingMs);
    console.log(
      `⏱ Pipeline (${modo}): total ${timingMs.total} ms ` +
        `(i=${timingMs.interprete} p=${timingMs.protocolo} ` +
        `a=${timingMs.auditor} c=${timingMs.comunicacion})`
    );

    registrarTurnoHistorial({
      respuestaPaciente:
        respuestaPaciente != null ? String(respuestaPaciente).trim() : null,
      confianza: conf,
      timestampTurno: turnoTimestamp,
      contextoVozEmitido: comunicacion.contextoVoz,
      mensajesEmitidos: comunicacion.mensajesPaciente,
      razonamientoInterno,
      interpretacion: traza.interpretacion,
      registroIntento: traza.registroIntento,
      propuestaProtocolo: propuestaAplicar,
      auditoria: traza.auditoria,
      comunicacion: traza.comunicacion,
      acciones: propuestaAplicar.acciones,
      estadoPatch: propuestaAplicar.estadoPatch,
      pipeline: true,
      modoTurno: modo,
      timingMs,
      ...(llmPrompts ? { llmPrompts } : {})
    });

    return {
      ok: true,
      pasos: aPasosHablar(comunicacion.mensajesPaciente),
      contextoVoz: comunicacion.contextoVoz,
      accionesEjecutadas,
      modoTurno: modo,
      timingMs,
      pipeline: traza
    };
  } catch (err) {
    console.error(`❌ Pipeline turno (${modo}):`, err.message);
    const mensajeError =
      modo === 'bootstrap'
        ? 'No se pudo iniciar el examen en este momento. Por favor, intentá de nuevo en unos segundos.'
        : `Error del pipeline: ${err.message}`;
    return {
      ok: false,
      error: mensajeError,
      modoTurno: modo
    };
  }
}
