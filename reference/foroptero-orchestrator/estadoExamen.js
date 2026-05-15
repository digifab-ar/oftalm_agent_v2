/**
 * Estado global del examen (memoria, una sesión por instancia).
 */

const RX_DEMO = {
  R: { esfera: 0.75, cilindro: -1.75, angulo: 60 },
  L: { esfera: 2.75, cilindro: 0, angulo: 0 }
};

function ojoAgudezaVacio() {
  return {
    logmarActual: null,
    letraActual: null,
    ultimoLogmarCorrecto: null,
    confirmaciones: 0,
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
  return JSON.parse(JSON.stringify(estadoExamen));
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

export function aplicarEstadoPatch(patch) {
  if (!estadoExamen || !patch || typeof patch !== 'object') return;
  estadoExamen = deepMerge(estadoExamen, patch);
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
