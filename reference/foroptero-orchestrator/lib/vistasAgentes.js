import { estimuloParaInterprete, resolverFaseDesdeEstado } from './estimulo.js';
import { validarContraSchema } from './validarSchema.js';
import {
  VISTA_INTERPRETE_SCHEMA,
  VISTA_PROTOCOLO_SCHEMA,
  VISTA_AUDITOR_SCHEMA,
  VISTA_COMUNICACION_SCHEMA
} from '../agents/schemas.js';

function deepMerge(target, source) {
  if (source === null || source === undefined) return target;
  if (typeof source !== 'object' || Array.isArray(source)) return source;
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      out[key] = deepMerge(target[key], source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

function logmarAClave(logmar) {
  if (logmar == null) return null;
  return String(Number(logmar));
}

function contadoresLogmarActual(agOjo) {
  if (!agOjo || agOjo.logmarActual == null) return null;
  const clave = logmarAClave(agOjo.logmarActual);
  const bloque = agOjo.resultadosPorLogmar?.[clave];
  if (!bloque) return { correcto: 0, incorrecto: 0 };
  return {
    correcto: bloque.correcto ?? 0,
    incorrecto: bloque.incorrecto ?? 0
  };
}

function proyectarOjoAgudeza(agOjo) {
  return {
    logmarActual: agOjo?.logmarActual ?? null,
    letraActual: agOjo?.letraActual ?? null,
    letrasUsadas: Array.isArray(agOjo?.letrasUsadas)
      ? [...agOjo.letrasUsadas]
      : [],
    logmarFinal: agOjo?.logmarFinal ?? null,
    contadoresLogmarActual: contadoresLogmarActual(agOjo)
  };
}

function interpretacionVista(interpretacion) {
  return {
    clasificacion: interpretacion?.clasificacion ?? 'continuacion',
    letraElegida: interpretacion?.letraElegida ?? null,
    letrasCandidatas: Array.isArray(interpretacion?.letrasCandidatas)
      ? [...interpretacion.letrasCandidatas]
      : [],
    notasInterprete: String(interpretacion?.notasInterprete ?? '')
  };
}

function rxVista(estado) {
  return {
    R: { ...estado.rx.R },
    L: { ...estado.rx.L }
  };
}

function agudezaVista(estado) {
  return {
    R: proyectarOjoAgudeza(estado.agudeza?.R),
    L: proyectarOjoAgudeza(estado.agudeza?.L)
  };
}

function validarVista(schema, vista, nombre) {
  validarContraSchema(schema, vista, nombre);
  return vista;
}

/**
 * @param {object} estado — snapshot del examen
 * @param {string|null} respuestaPaciente
 * @param {number} confianza
 * @param {'respuesta'|'bootstrap'} modo
 */
export function armarVistaInterprete(
  estado,
  respuestaPaciente,
  confianza,
  modo = 'respuesta'
) {
  const estimulo = estimuloParaInterprete(estado);
  const vista = {
    fase: resolverFaseDesdeEstado(estado),
    modo,
    estimulo: {
      tipo: estimulo.tipo ?? 'letra_logmar',
      letraActual: estimulo.letraActual ?? null,
      logmarActual: estimulo.logmarActual ?? null,
      ojo: estimulo.ojo ?? estado.ojoActual
    },
    respuestaPaciente:
      respuestaPaciente != null && String(respuestaPaciente).trim() !== ''
        ? String(respuestaPaciente).trim()
        : null,
    confianza:
      typeof confianza === 'number' && !Number.isNaN(confianza)
        ? Math.min(1, Math.max(0, confianza))
        : 1
  };
  return validarVista(VISTA_INTERPRETE_SCHEMA, vista, 'VistaInterprete');
}

/**
 * @param {object} estadoTrasRegistro
 * @param {object} interpretacion
 * @param {'respuesta'|'bootstrap'} modo
 * @param {{ violaciones: string[], correccionSugerida?: string|null }|string|null} feedbackAuditor
 */
export function armarVistaProtocolo(
  estadoTrasRegistro,
  interpretacion,
  modo = 'respuesta',
  feedbackAuditor = null
) {
  let feedback = null;
  if (feedbackAuditor != null) {
    if (typeof feedbackAuditor === 'string') {
      feedback = {
        violaciones: [feedbackAuditor],
        correccionSugerida: null
      };
    } else if (typeof feedbackAuditor === 'object') {
      feedback = {
        violaciones: Array.isArray(feedbackAuditor.violaciones)
          ? feedbackAuditor.violaciones
          : [],
        correccionSugerida: feedbackAuditor.correccionSugerida ?? null
      };
    }
  }

  const vista = {
    fase: resolverFaseDesdeEstado(estadoTrasRegistro),
    modo,
    ojoActual: estadoTrasRegistro.ojoActual,
    agudeza: agudezaVista(estadoTrasRegistro),
    rx: rxVista(estadoTrasRegistro),
    interpretacion: interpretacionVista(interpretacion),
    feedbackAuditor: feedback
  };
  return validarVista(VISTA_PROTOCOLO_SCHEMA, vista, 'VistaProtocolo');
}

function simularLetrasUsadasResultantes(estado, propuesta) {
  const base = {
    R: [...(estado.agudeza?.R?.letrasUsadas ?? [])],
    L: [...(estado.agudeza?.L?.letrasUsadas ?? [])]
  };
  const merged = deepMerge(
    JSON.parse(JSON.stringify(estado)),
    propuesta.estadoPatch ?? {}
  );
  return {
    R: Array.isArray(merged.agudeza?.R?.letrasUsadas)
      ? [...merged.agudeza.R.letrasUsadas]
      : base.R,
    L: Array.isArray(merged.agudeza?.L?.letrasUsadas)
      ? [...merged.agudeza.L.letrasUsadas]
      : base.L
  };
}

/**
 * @param {object} estadoTrasRegistro
 * @param {object} interpretacion
 * @param {object} propuestaProtocolo
 * @param {'respuesta'|'bootstrap'} modo
 * @param {object|null} registroIntento
 */
export function armarVistaAuditor(
  estadoTrasRegistro,
  interpretacion,
  propuestaProtocolo,
  modo = 'respuesta',
  registroIntento = null
) {
  let intentoRecienRegistrado = null;
  if (modo === 'respuesta' && registroIntento?.registrado) {
    const ojo = registroIntento.ojo ?? estadoTrasRegistro.ojoActual;
    const ag = estadoTrasRegistro.agudeza?.[ojo];
    intentoRecienRegistrado = {
      ojo,
      logmarEstimulo: registroIntento.logmarEstimulo ?? null,
      letraEstimulo: registroIntento.letraEstimulo ?? null,
      clasificacion: registroIntento.clasificacion ?? interpretacion?.clasificacion,
      duplicado: Boolean(registroIntento.duplicado),
      contadoresPostRegistro: contadoresLogmarActual(ag)
    };
  }

  const vista = {
    fase: resolverFaseDesdeEstado(estadoTrasRegistro),
    modo,
    ojoActual: estadoTrasRegistro.ojoActual,
    agudeza: agudezaVista(estadoTrasRegistro),
    rx: rxVista(estadoTrasRegistro),
    interpretacion: interpretacionVista(interpretacion),
    intentoRecienRegistrado,
    propuestaProtocolo: {
      estadoPatch: propuestaProtocolo?.estadoPatch ?? {},
      acciones: Array.isArray(propuestaProtocolo?.acciones)
        ? propuestaProtocolo.acciones
        : [],
      evento: propuestaProtocolo?.evento,
      detalleEvento: propuestaProtocolo?.detalleEvento ?? {},
      razonamientoProtocolo: String(
        propuestaProtocolo?.razonamientoProtocolo ?? ''
      ),
      letrasUsadasResultantes: simularLetrasUsadasResultantes(
        estadoTrasRegistro,
        propuestaProtocolo
      )
    }
  };
  return validarVista(VISTA_AUDITOR_SCHEMA, vista, 'VistaAuditor');
}

/**
 * @param {object} params
 */
export function armarVistaComunicacion({
  interpretacion,
  propuestaProtocolo,
  estadoTrasRegistro,
  estadoAntes,
  modo = 'respuesta',
  huboCambioDispositivo = false
}) {
  const patch = propuestaProtocolo?.estadoPatch ?? {};
  const ojoPostPatch = patch.ojoActual ?? estadoTrasRegistro.ojoActual;

  const esPrimerTurnoExamen =
    !estadoTrasRegistro.historial || estadoTrasRegistro.historial.length === 0;
  const esCambioDeOjo =
    patch.ojoActual != null && estadoAntes?.ojoActual !== patch.ojoActual;
  const esPrimerTurnoOjoActivo =
    estadoAntes?.agudeza?.[ojoPostPatch]?.letraActual == null;
  const esExamenFinalizado =
    patch.fase === 'finalizado' ||
    propuestaProtocolo?.evento === 'examen_finalizado';

  const vista = {
    fase: resolverFaseDesdeEstado(estadoTrasRegistro),
    modo,
    evento: propuestaProtocolo?.evento,
    detalleEvento: propuestaProtocolo?.detalleEvento ?? {},
    huboCambioDispositivo: Boolean(huboCambioDispositivo),
    esPrimerTurnoExamen,
    esPrimerTurnoOjoActivo,
    esCambioDeOjo,
    esExamenFinalizado,
    interpretacion: {
      clasificacion: interpretacion?.clasificacion ?? 'continuacion',
      notasInterprete: String(interpretacion?.notasInterprete ?? '')
    },
    estadoResumido: {
      ojoActual: estadoTrasRegistro.ojoActual,
      R_cerrado: estadoTrasRegistro.agudeza?.R?.logmarFinal != null,
      L_cerrado: estadoTrasRegistro.agudeza?.L?.logmarFinal != null
    }
  };
  return validarVista(VISTA_COMUNICACION_SCHEMA, vista, 'VistaComunicacion');
}

/** Campos prohibidos en vistas (para tests). */
export const CAMPOS_PROHIBIDOS_VISTA = [
  'historial',
  'intentosRegistrados',
  'iniciado',
  'finalizado',
  'resultadosPorLogmar',
  'aciertosPorLogmar',
  'letraFinal',
  'confirmaciones',
  'ultimoLogmarCorrecto'
];

export function vistaContieneCampoProhibido(obj, seen = new Set()) {
  if (obj == null || typeof obj !== 'object') return false;
  if (seen.has(obj)) return false;
  seen.add(obj);
  if (Array.isArray(obj)) {
    return obj.some((v) => vistaContieneCampoProhibido(v, seen));
  }
  for (const key of Object.keys(obj)) {
    if (CAMPOS_PROHIBIDOS_VISTA.includes(key)) return true;
    if (vistaContieneCampoProhibido(obj[key], seen)) return true;
  }
  return false;
}
