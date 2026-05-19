/**
 * Turno de voz del paciente: transcripción STT + timestamp estable por utterance.
 * Usado por consultarExamen para idempotencia en POST /api/examen/turno (plan tabla logMAR).
 */

export type TurnoPacienteSnapshot = {
  respuestaPaciente: string;
  timestamp: string;
};

const PLACEHOLDERS_OMITIDOS = new Set(['[inaudible]', '[Transcribing...]']);

let turnoStt: TurnoPacienteSnapshot | null = null;
/** Si la tool corre antes que el STT, mismo timestamp en reintentos HTTP. */
let turnoFallback: TurnoPacienteSnapshot | null = null;

export function asignarDesdeTranscripcion(
  texto: string,
  now: () => Date = () => new Date()
): void {
  const t = String(texto ?? '').trim();
  if (!t || PLACEHOLDERS_OMITIDOS.has(t)) return;
  turnoStt = {
    respuestaPaciente: t,
    timestamp: now().toISOString()
  };
}

/**
 * Arma el par respuesta + timestamp para el body HTTP.
 * Prioriza la transcripción STT; si aún no llegó, usa el texto del modelo con timestamp fijo.
 */
export function resolverTurnoParaRequest(
  respuestaDesdeModelo?: string | null,
  now: () => Date = () => new Date()
): TurnoPacienteSnapshot | null {
  if (turnoStt) {
    return { ...turnoStt };
  }

  const fromModel = String(respuestaDesdeModelo ?? '').trim();
  if (!fromModel) return null;

  if (
    !turnoFallback ||
    turnoFallback.respuestaPaciente !== fromModel
  ) {
    turnoFallback = {
      respuestaPaciente: fromModel,
      timestamp: now().toISOString()
    };
  }

  return { ...turnoFallback };
}

export function limpiarTurnoPaciente(): void {
  turnoStt = null;
  turnoFallback = null;
}

/** Solo tests. */
export function resetTurnoPacienteState(): void {
  limpiarTurnoPaciente();
}
