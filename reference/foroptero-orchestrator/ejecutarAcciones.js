/**
 * Ejecuta acciones de dispositivo vía callbacks inyectados desde server.js
 */

let ejecutarForoptero = null;
let ejecutarTV = null;

export function inicializarEjecutores(foropteroFn, tvFn) {
  ejecutarForoptero = foropteroFn;
  ejecutarTV = tvFn;
}

export async function ejecutarAcciones(acciones = []) {
  const resultados = [];
  for (const accion of acciones) {
    if (accion.dispositivo === 'foroptero') {
      const res = await ejecutarForoptero(accion.config || {});
      resultados.push({ tipo: 'foroptero', ok: res.ok !== false, ...res });
    } else if (accion.dispositivo === 'tv') {
      const res = await ejecutarTV({
        letra: accion.letra,
        logmar: accion.logmar
      });
      resultados.push({
        tipo: 'tv',
        ok: res.ok !== false,
        letra: accion.letra,
        logmar: accion.logmar,
        ...res
      });
    } else {
      resultados.push({
        tipo: accion.dispositivo || 'desconocido',
        ok: false,
        error: 'Dispositivo no soportado'
      });
    }
  }
  return resultados;
}
