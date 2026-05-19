import {
  aplicarEstadoPatch,
  obtenerEstadoParaOrquestador,
  registrarIntentoAgudeza,
  registrarTurnoHistorial
} from './estadoExamen.js';
import { ejecutarAcciones } from './ejecutarAcciones.js';
import { ejecutarInterprete } from './agents/interprete.js';
import { ejecutarProtocolo } from './agents/protocolo.js';
import { ejecutarAuditor } from './agents/auditor.js';
import { ejecutarComunicacion } from './agents/comunicacion.js';

const MAX_REINTENTOS_PROTOCOLO = 1;

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

async function protocoloConAuditoria(estadoAntes, interpretacion, modo) {
  let feedback = null;
  const opciones = { modo };

  for (let intento = 0; intento <= MAX_REINTENTOS_PROTOCOLO; intento++) {
    const propuesta = await ejecutarProtocolo(
      estadoAntes,
      interpretacion,
      feedback,
      opciones
    );
    const auditoria = await ejecutarAuditor(
      estadoAntes,
      interpretacion,
      propuesta,
      opciones
    );

    if (auditoria.aprobado) {
      return { propuesta, auditoria, reintentos: intento };
    }

    if (intento >= MAX_REINTENTOS_PROTOCOLO) {
      return { propuesta, auditoria, reintentos: intento, falloAuditor: true };
    }

    feedback = [
      'Violaciones:',
      ...auditoria.violaciones.map((v) => `- ${v}`),
      auditoria.correccionSugerida
        ? `Sugerencia: ${auditoria.correccionSugerida}`
        : ''
    ]
      .filter(Boolean)
      .join('\n');
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
  const estadoAntes = obtenerEstadoParaOrquestador();
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

  try {
    if (modo === 'bootstrap') {
      traza.interpretacion = interpretacionBootstrap();
    } else {
      traza.interpretacion = await ejecutarInterprete(
        estadoAntes,
        respuestaPaciente,
        conf,
        { modo }
      );
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

    const estadoTrasRegistro = obtenerEstadoParaOrquestador();

    const resultadoProtocolo = await protocoloConAuditoria(
      estadoTrasRegistro,
      traza.interpretacion,
      modo
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
      console.warn(
        `⚠️ Pipeline (${modo}): auditor rechazó tras reintentos; fallback ${
          propuestaAplicar.detalleEvento?.motivo ?? 'desconocido'
        }`
      );
    } else {
      huboCambioDispositivo =
        Array.isArray(propuestaAplicar.acciones) &&
        propuestaAplicar.acciones.length > 0;
      comunicacion = await ejecutarComunicacion(
        traza.interpretacion,
        propuestaAplicar,
        estadoTrasRegistro,
        { modo, huboCambioDispositivo }
      );
    }

    traza.comunicacion = comunicacion;

    aplicarEstadoPatch(propuestaAplicar.estadoPatch);
    const accionesEjecutadas = await ejecutarAcciones(propuestaAplicar.acciones);

    const razonamientoInterno = armarRazonamientoInterno(traza, modo);

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
      modoTurno: modo
    });

    return {
      ok: true,
      pasos: aPasosHablar(comunicacion.mensajesPaciente),
      contextoVoz: comunicacion.contextoVoz,
      accionesEjecutadas,
      modoTurno: modo,
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
