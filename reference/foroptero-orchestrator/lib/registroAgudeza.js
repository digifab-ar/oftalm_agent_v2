import { createHash } from 'crypto';

export const LOGMAR_NIVELES = ['0.3', '0.2', '0.1', '0.0'];

/** @returns {Record<string, { correcto: number, incorrecto: number }>} */
export function crearResultadosPorLogmarVacio() {
  return Object.fromEntries(
    LOGMAR_NIVELES.map((k) => [k, { correcto: 0, incorrecto: 0 }])
  );
}

/**
 * @param {number | string | null | undefined} logmar
 * @returns {string | null}
 */
export function logmarAClave(logmar) {
  if (logmar == null || logmar === '') return null;
  const n = Number(logmar);
  if (Number.isNaN(n)) return null;
  return n.toFixed(1);
}

/**
 * Mantiene `aciertosPorLogmar` alineado a `resultadosPorLogmar.*.correcto` (legacy / CSV).
 * @param {object} ojo
 */
export function sincronizarAciertosLegacy(ojo) {
  if (!ojo.resultadosPorLogmar || !ojo.aciertosPorLogmar) return;
  for (const k of LOGMAR_NIVELES) {
    ojo.aciertosPorLogmar[k] = ojo.resultadosPorLogmar[k]?.correcto ?? 0;
  }
}

/**
 * @param {object} ojo
 */
export function asegurarResultadosPorLogmarEnOjo(ojo) {
  if (!ojo.resultadosPorLogmar) {
    ojo.resultadosPorLogmar = crearResultadosPorLogmarVacio();
    if (ojo.aciertosPorLogmar) {
      for (const k of LOGMAR_NIVELES) {
        ojo.resultadosPorLogmar[k].correcto = Number(ojo.aciertosPorLogmar[k] ?? 0);
      }
    }
  }
  sincronizarAciertosLegacy(ojo);
}

/**
 * @param {string | null} respuestaPaciente
 * @param {string | null | undefined} timestamp
 */
export function buildIntentId(respuestaPaciente, timestamp) {
  const texto = String(respuestaPaciente ?? '')
    .trim()
    .toLowerCase();
  const ts = String(timestamp ?? '').trim();
  return createHash('sha256').update(`${texto}|${ts}`).digest('hex').slice(0, 32);
}

/**
 * @param {string} clasificacion
 * @param {'bootstrap' | 'respuesta'} modo
 */
export function debeRegistrarIntento(clasificacion, modo) {
  if (modo === 'bootstrap') return false;
  return clasificacion === 'correcta' || clasificacion === 'incorrecta' || clasificacion === 'no_ve';
}

/**
 * Incrementa contadores en el ojo (mutación in-place).
 * @param {object} ojo — `agudeza.R` o `agudeza.L`
 * @param {number | string} logmarEstimulo
 * @param {string} clasificacion
 */
export function aplicarRegistroIntento(ojo, logmarEstimulo, clasificacion) {
  asegurarResultadosPorLogmarEnOjo(ojo);
  const clave = logmarAClave(logmarEstimulo);
  if (!clave || !ojo.resultadosPorLogmar[clave]) {
    return { aplicado: false, motivo: 'logmar_invalido', logmarClave: clave };
  }

  if (clasificacion === 'correcta') {
    ojo.resultadosPorLogmar[clave].correcto += 1;
  } else if (clasificacion === 'incorrecta' || clasificacion === 'no_ve') {
    ojo.resultadosPorLogmar[clave].incorrecto += 1;
  } else {
    return { aplicado: false, motivo: 'clasificacion_no_registrable' };
  }

  sincronizarAciertosLegacy(ojo);
  return { aplicado: true, logmarClave: clave };
}
