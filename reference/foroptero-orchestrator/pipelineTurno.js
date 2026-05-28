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

/** @returns {{ interprete: number, protocolo: number, auditor: number, comunicacion: number, total: number, totalWallClock: number }} */
export function crearTimingMs() {
  return {
    interprete: 0,
    protocolo: 0,
    auditor: 0,
    comunicacion: 0,
    total: 0,
    totalWallClock: 0
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

async function ejecutarUnProtocolo(
  estadoTrasRegistro,
  interpretacion,
  modo,
  feedbackAuditor,
  timing,
  llmPrompts,
  intento
) {
  const vista = armarVistaProtocolo(
    estadoTrasRegistro,
    interpretacion,
    modo,
    feedbackAuditor
  );
  if (llmPrompts) {
    pushIntentoPrompt(
      llmPrompts,
      'protocolo',
      intento,
      construirUserProtocolo(vista),
      vista
    );
  }
  const { result, ms } = await medirMs(() =>
    ejecutarProtocolo(vista, { modo })
  );
  timing.protocolo += ms;
  return result;
}

async function ejecutarUnAuditor(
  estadoTrasRegistro,
  interpretacion,
  propuesta,
  modo,
  registroIntento,
  timing,
  llmPrompts,
  intento
) {
  const vista = armarVistaAuditor(
    estadoTrasRegistro,
    interpretacion,
    propuesta,
    modo,
    registroIntento
  );
  if (llmPrompts) {
    pushIntentoPrompt(
      llmPrompts,
      'auditor',
      intento,
      construirUserAuditor(vista),
      vista
    );
  }
  const { result, ms } = await medirMs(() => ejecutarAuditor(vista, { modo }));
  timing.auditor += ms;
  return result;
}

/**
 * Protocolo → auditor y comunicación en paralelo (intento 0); reintento secuencial si auditor rechaza.
 */
async function protocoloAuditoriaYComunicacion({
  estadoTrasRegistro,
  estadoAntes,
  interpretacion,
  modo,
  registroIntento,
  timing,
  llmPrompts
}) {
  const propuesta0 = await ejecutarUnProtocolo(
    estadoTrasRegistro,
    interpretacion,
    modo,
    null,
    timing,
    llmPrompts,
    0
  );

  const huboCambioDispositivo0 =
    Array.isArray(propuesta0.acciones) && propuesta0.acciones.length > 0;
  const vistaCom0 = armarVistaComunicacion({
    interpretacion,
    propuestaProtocolo: propuesta0,
    estadoTrasRegistro,
    estadoAntes,
    modo,
    huboCambioDispositivo: huboCambioDispositivo0
  });
  if (llmPrompts) {
    setPromptAgente(llmPrompts, 'comunicacion', {
      invocado: true,
      user: construirUserComunicacion(vistaCom0),
      vista: vistaCom0
    });
  }

  const [auditorRes0, commRes0] = await Promise.all([
    ejecutarUnAuditor(
      estadoTrasRegistro,
      interpretacion,
      propuesta0,
      modo,
      registroIntento,
      timing,
      llmPrompts,
      0
    ),
    medirMs(() => ejecutarComunicacion(vistaCom0, { modo }))
  ]);

  if (auditorRes0.aprobado) {
    return {
      propuesta: propuesta0,
      auditoria: auditorRes0,
      comunicacion: commRes0.result,
      comunicacionMs: commRes0.ms,
      huboCambioDispositivo: huboCambioDispositivo0,
      falloAuditor: false
    };
  }

  const feedback = {
    violaciones: auditorRes0.violaciones,
    correccionSugerida: auditorRes0.correccionSugerida
  };
  const propuesta1 = await ejecutarUnProtocolo(
    estadoTrasRegistro,
    interpretacion,
    modo,
    feedback,
    timing,
    llmPrompts,
    1
  );
  const auditorRes1 = await ejecutarUnAuditor(
    estadoTrasRegistro,
    interpretacion,
    propuesta1,
    modo,
    registroIntento,
    timing,
    llmPrompts,
    1
  );

  if (auditorRes1.aprobado) {
    const huboCambioDispositivo1 =
      Array.isArray(propuesta1.acciones) && propuesta1.acciones.length > 0;
    const vistaCom1 = armarVistaComunicacion({
      interpretacion,
      propuestaProtocolo: propuesta1,
      estadoTrasRegistro,
      estadoAntes,
      modo,
      huboCambioDispositivo: huboCambioDispositivo1
    });
    if (llmPrompts) {
      setPromptAgente(llmPrompts, 'comunicacion', {
        invocado: true,
        user: construirUserComunicacion(vistaCom1),
        vista: vistaCom1
      });
    }
    const commRes1 = await medirMs(() =>
      ejecutarComunicacion(vistaCom1, { modo })
    );
    return {
      propuesta: propuesta1,
      auditoria: auditorRes1,
      comunicacion: commRes1.result,
      comunicacionMs: commRes1.ms,
      huboCambioDispositivo: huboCambioDispositivo1,
      falloAuditor: false
    };
  }

  const fb =
    modo === 'bootstrap'
      ? fallbackBootstrap()
      : fallbackAuditoria(interpretacion);
  if (llmPrompts) {
    setPromptAgente(llmPrompts, 'comunicacion', {
      invocado: false,
      motivo: fb.propuestaProtocolo.detalleEvento?.motivo ?? 'fallback_auditoria'
    });
  }
  return {
    propuesta: fb.propuestaProtocolo,
    auditoria: auditorRes1,
    comunicacion: fb.comunicacion,
    comunicacionMs: 0,
    huboCambioDispositivo: false,
    falloAuditor: true
  };
}

/**
 * Pipeline: intérprete → protocolo → (auditor ∥ comunicación) → [patch + MQTT].
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
  const t0Pipeline = performance.now();

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

    const resultado = await protocoloAuditoriaYComunicacion({
      estadoTrasRegistro,
      estadoAntes,
      interpretacion: traza.interpretacion,
      modo,
      registroIntento: traza.registroIntento,
      timing: timingMs,
      llmPrompts
    });

    traza.propuestaProtocolo = resultado.propuesta;
    traza.auditoria = resultado.auditoria;
    traza.falloAuditor = resultado.falloAuditor;
    traza.comunicacion = resultado.comunicacion;
    timingMs.comunicacion = resultado.comunicacionMs;

    const propuestaAplicar = traza.propuestaProtocolo;
    const comunicacion = traza.comunicacion;

    if (traza.falloAuditor) {
      console.warn(
        `⚠️ Pipeline (${modo}): auditor rechazó tras reintentos; fallback ${
          propuestaAplicar.detalleEvento?.motivo ?? 'desconocido'
        }`
      );
    }
    if (llmPrompts) {
      traza.llmPrompts = llmPrompts;
    }

    aplicarEstadoPatch(propuestaAplicar.estadoPatch);
    const accionesEjecutadas = await ejecutarAcciones(propuestaAplicar.acciones);

    const razonamientoInterno = armarRazonamientoInterno(traza, modo);
    timingMs.totalWallClock = Math.round(performance.now() - t0Pipeline);
    finalizarTimingMs(timingMs);
    console.log(
      `⏱ Pipeline (${modo}): wallClock=${timingMs.totalWallClock}ms cpu=${timingMs.total}ms ` +
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
