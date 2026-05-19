/**
 * Resume el estímulo clínico de referencia para el intérprete según fase del examen.
 * @param {object} estado
 * @returns {object}
 */
export function estimuloParaInterprete(estado) {
  const fase = resolverFaseDesdeEstado(estado);

  if (fase === 'agudeza') {
    const ojo = estado.ojoActual;
    const ag = estado.agudeza?.[ojo] ?? {};
    return {
      tipo: 'letra_logmar',
      fase: 'agudeza',
      ojo,
      letraActual: ag.letraActual ?? null,
      logmarActual: ag.logmarActual ?? null
    };
  }

  return { fase, tipo: 'desconocido' };
}

/**
 * @param {object} estado
 * @returns {string}
 */
export function resolverFaseDesdeEstado(estado) {
  const fase = estado?.fase;
  if (fase === 'finalizado') {
    return 'agudeza';
  }
  return fase || 'agudeza';
}
