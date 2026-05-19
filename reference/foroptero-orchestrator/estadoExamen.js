/**
 * Estado global del examen (memoria, una sesión por instancia).
 */

import {
  aplicarRegistroIntento,
  asegurarResultadosPorLogmarEnOjo,
  buildIntentId,
  crearResultadosPorLogmarVacio,
  debeRegistrarIntento,
  sincronizarAciertosLegacy
} from './lib/registroAgudeza.js';

const RX_DEMO = {
  R: { esfera: 0.75, cilindro: -1.75, angulo: 60 },
  L: { esfera: 2.75, cilindro: 0, angulo: 0 }
};

function ojoAgudezaVacio() {
  const resultadosPorLogmar = crearResultadosPorLogmarVacio();
  return {
    logmarActual: null,
    letraActual: null,
    ultimoLogmarCorrecto: null,
    confirmaciones: 0,
    resultadosPorLogmar,
    aciertosPorLogmar: { '0.3': 0, '0.2': 0, '0.1': 0, '0.0': 0 },
    logmarFinal: null,
    letraFinal: null,
    letrasUsadas: []
  };
}

let estadoExamen = null;

export function inicializarExamen(rxOverride = null) {
  const rx = rxOverride?.R && rxOverride?.L ? rxOverride : RX_DEMO;
  estadoExamen = {
    fase: 'agudeza',
    ojoActual: 'R',
    rx: {
      R: { ...rx.R },
      L: { ...rx.L }
    },
    agudeza: {
      R: ojoAgudezaVacio(),
      L: ojoAgudezaVacio()
    },
    historial: [],
    intentosRegistrados: [],
    iniciado: Date.now(),
    finalizado: null
  };
  return estadoExamen;
}

export function examenIniciado() {
  return estadoExamen !== null;
}

export function obtenerEstadoExamen() {
  if (!estadoExamen) {
    return { ok: false, error: 'Examen no iniciado. Llamá POST /api/examen/nuevo.' };
  }
  const totalOjos = 2;
  let completados = 0;
  if (estadoExamen.agudeza.R.logmarFinal != null) completados++;
  if (estadoExamen.agudeza.L.logmarFinal != null) completados++;
  const progreso =
    estadoExamen.fase === 'finalizado'
      ? 100
      : Math.round((completados / totalOjos) * 100);

  return {
    ok: true,
    estado: {
      fase: estadoExamen.fase,
      ojoActual: estadoExamen.ojoActual,
      logmarActual: estadoExamen.agudeza[estadoExamen.ojoActual]?.logmarActual,
      letraActual: estadoExamen.agudeza[estadoExamen.ojoActual]?.letraActual,
      progreso,
      iniciado: estadoExamen.iniciado,
      finalizado: estadoExamen.finalizado
    }
  };
}

export function obtenerDetalleExamen() {
  if (!estadoExamen) {
    return { ok: false, error: 'Examen no iniciado' };
  }
  return {
    ok: true,
    detalle: { ...estadoExamen, historial: [...estadoExamen.historial] }
  };
}

export function obtenerEstadoParaOrquestador() {
  if (!estadoExamen) return null;
  for (const ojo of ['R', 'L']) {
    asegurarResultadosPorLogmarEnOjo(estadoExamen.agudeza[ojo]);
  }
  return JSON.parse(JSON.stringify(estadoExamen));
}

/**
 * Registra el intento del turno en `resultadosPorLogmar` (determinista, idempotente).
 * Usa logmar/letra de `estadoExamen` en el momento de la llamada (estímulo en pantalla).
 *
 * @param {object} params
 * @param {object} params.interpretacion
 * @param {string | null} params.respuestaPaciente
 * @param {string} params.timestamp
 * @param {'bootstrap' | 'respuesta'} params.modo
 */
export function registrarIntentoAgudeza({
  interpretacion,
  respuestaPaciente,
  timestamp,
  modo
}) {
  if (!estadoExamen) {
    return { registrado: false, motivo: 'sin_examen', duplicado: false };
  }

  const clasificacion = interpretacion?.clasificacion;
  if (!debeRegistrarIntento(clasificacion, modo)) {
    return {
      registrado: false,
      motivo: 'no_aplica',
      duplicado: false,
      clasificacion
    };
  }

  const intentId = buildIntentId(respuestaPaciente, timestamp);
  if (!Array.isArray(estadoExamen.intentosRegistrados)) {
    estadoExamen.intentosRegistrados = [];
  }

  if (estadoExamen.intentosRegistrados.includes(intentId)) {
    const ojo = estadoExamen.ojoActual;
    const ag = estadoExamen.agudeza[ojo];
    asegurarResultadosPorLogmarEnOjo(ag);
    return {
      registrado: true,
      duplicado: true,
      intentId,
      ojo,
      logmarEstimulo: ag.logmarActual,
      letraEstimulo: ag.letraActual,
      resultadosPorLogmar: JSON.parse(JSON.stringify(ag.resultadosPorLogmar))
    };
  }

  const ojo = estadoExamen.ojoActual;
  const ag = estadoExamen.agudeza[ojo];
  asegurarResultadosPorLogmarEnOjo(ag);

  const logmarEstimulo = ag.logmarActual;
  const letraEstimulo = ag.letraActual;
  const resultado = aplicarRegistroIntento(ag, logmarEstimulo, clasificacion);

  if (resultado.aplicado) {
    estadoExamen.intentosRegistrados.push(intentId);
  }

  return {
    registrado: resultado.aplicado,
    duplicado: false,
    intentId,
    ojo,
    logmarEstimulo,
    letraEstimulo,
    clasificacion,
    logmarClave: resultado.logmarClave,
    motivo: resultado.motivo,
    resultadosPorLogmar: JSON.parse(JSON.stringify(ag.resultadosPorLogmar))
  };
}

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

/** El protocolo no debe escribir contadores; solo el registro de intento. */
function sanitizarPatchProtocolo(patch) {
  if (!patch?.agudeza) return patch;
  const out = { ...patch, agudeza: { ...patch.agudeza } };
  for (const ojo of ['R', 'L']) {
    if (!out.agudeza[ojo]) continue;
    const { resultadosPorLogmar, aciertosPorLogmar, ...resto } = out.agudeza[ojo];
    out.agudeza[ojo] = resto;
  }
  return out;
}

export function aplicarEstadoPatch(patch) {
  if (!estadoExamen || !patch || typeof patch !== 'object') return;
  const limpio = sanitizarPatchProtocolo(patch);
  estadoExamen = deepMerge(estadoExamen, limpio);
  for (const ojo of ['R', 'L']) {
    if (estadoExamen.agudeza[ojo]) {
      sincronizarAciertosLegacy(estadoExamen.agudeza[ojo]);
    }
  }
}

export function registrarTurnoHistorial(entrada) {
  if (!estadoExamen) return;
  estadoExamen.historial.push({
    ts: new Date().toISOString(),
    ...entrada
  });
}

export function generarRegistroCsv() {
  if (!estadoExamen) return 'sin_examen\n';
  const lines = ['timestamp,origen,detalle'];
  for (const h of estadoExamen.historial) {
    const detalle = [
      h.respuestaPaciente,
      h.contextoVozEmitido,
      (h.mensajesEmitidos || []).join(' | '),
      h.razonamientoInterno
    ]
      .filter(Boolean)
      .join(' — ');
    lines.push(
      `${csvEscape(h.ts)},turno,${csvEscape(detalle)}`
    );
  }
  lines.push('');
  lines.push('ojo,logmar_final,letra_final');
  for (const ojo of ['R', 'L']) {
    const a = estadoExamen.agudeza[ojo];
    lines.push(
      `${ojo},${a.logmarFinal ?? ''},${csvEscape(a.letraFinal ?? '')}`
    );
  }
  return lines.join('\n');
}

function csvEscape(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
