import {
  aplicarEstadoPatch,
  obtenerEstadoParaOrquestador,
  registrarTurnoHistorial
} from './estadoExamen.js';
import { ejecutarAcciones } from './ejecutarAcciones.js';
import { ejecutarInterprete } from './agents/interprete.js';
import { ejecutarProtocolo } from './agents/protocolo.js';
import { ejecutarAuditor } from './agents/auditor.js';
import { ejecutarComunicacion } from './agents/comunicacion.js';

const MAX_REINTENTOS_PROTOCOLO = 1;

function aPasosHablar(mensajes) {
  return mensajes.map((mensaje, i) => ({
    tipo: 'hablar',
    orden: i + 1,
    mensaje
  }));
}

function armarRazonamientoInterno(traza) {
  const i = traza.interpretacion;
  const p = traza.propuestaProtocolo;
  const a = traza.auditoria;
  const c = traza.comunicacion;
  return [
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

/** Fallback conservador si el pipeline falla tras reintentos. */
function fallbackRepregunta() {
  return {
    propuestaProtocolo: {
      estadoPatch: {},
      acciones: [],
      evento: 'repregunta_sin_cambio',
      detalleEvento: { motivo: 'fallback_pipeline' },
      razonamientoProtocolo: 'fallback: repregunta sin cambio'
    },
    comunicacion: {
      mensajesPaciente: [
        'No llegué a entender bien la letra. ¿Podés repetir el nombre de la letra que ves en la pantalla?'
      ],
      contextoVoz: 'esperar_respuesta',
      razonamientoComunicacion: 'fallback pipeline'
    }
  };
}

async function protocoloConAuditoria(estadoAntes, interpretacion) {
  let feedback = null;

  for (let intento = 0; intento <= MAX_REINTENTOS_PROTOCOLO; intento++) {
    const propuesta = await ejecutarProtocolo(
      estadoAntes,
      interpretacion,
      feedback
    );
    const auditoria = await ejecutarAuditor(
      estadoAntes,
      interpretacion,
      propuesta
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
  confianza = 1
) {
  const estadoAntes = obtenerEstadoParaOrquestador();
  if (!estadoAntes) {
    return { ok: false, error: 'Examen no iniciado' };
  }

  const conf =
    typeof confianza === 'number' && !Number.isNaN(confianza)
      ? Math.min(1, Math.max(0, confianza))
      : 1;

  const traza = {
    interpretacion: null,
    propuestaProtocolo: null,
    auditoria: null,
    comunicacion: null,
    falloAuditor: false
  };

  try {
    traza.interpretacion = await ejecutarInterprete(
      estadoAntes,
      respuestaPaciente,
      conf
    );

    const resultadoProtocolo = await protocoloConAuditoria(
      estadoAntes,
      traza.interpretacion
    );

    if (!resultadoProtocolo) {
      throw new Error('Protocolo sin resultado');
    }

    traza.propuestaProtocolo = resultadoProtocolo.propuesta;
    traza.auditoria = resultadoProtocolo.auditoria;
    traza.falloAuditor = Boolean(resultadoProtocolo.falloAuditor);

    let propuestaAplicar = traza.propuestaProtocolo;
    let comunicacion;

    if (traza.falloAuditor) {
      const fb = fallbackRepregunta();
      propuestaAplicar = fb.propuestaProtocolo;
      comunicacion = fb.comunicacion;
      console.warn(
        '⚠️ Pipeline: auditor rechazó tras reintentos; fallback repregunta'
      );
    } else {
      comunicacion = await ejecutarComunicacion(
        traza.interpretacion,
        propuestaAplicar,
        estadoAntes
      );
    }

    traza.comunicacion = comunicacion;

    aplicarEstadoPatch(propuestaAplicar.estadoPatch);
    const accionesEjecutadas = await ejecutarAcciones(propuestaAplicar.acciones);

    const razonamientoInterno = armarRazonamientoInterno(traza);

    registrarTurnoHistorial({
      respuestaPaciente:
        respuestaPaciente != null ? String(respuestaPaciente).trim() : null,
      confianza: conf,
      contextoVozEmitido: comunicacion.contextoVoz,
      mensajesEmitidos: comunicacion.mensajesPaciente,
      razonamientoInterno,
      interpretacion: traza.interpretacion,
      propuestaProtocolo: propuestaAplicar,
      auditoria: traza.auditoria,
      comunicacion: traza.comunicacion,
      acciones: propuestaAplicar.acciones,
      estadoPatch: propuestaAplicar.estadoPatch,
      pipeline: true
    });

    return {
      ok: true,
      pasos: aPasosHablar(comunicacion.mensajesPaciente),
      contextoVoz: comunicacion.contextoVoz,
      accionesEjecutadas,
      pipeline: traza
    };
  } catch (err) {
    console.error('❌ Pipeline turno:', err.message);
    return {
      ok: false,
      error: `Error del pipeline: ${err.message}`
    };
  }
}
