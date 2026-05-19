/**
 * Simulador de turnos — sin agente de voz.
 * Uso: BACKEND_URL=http://localhost:3001 node testAgent.js
 *      BACKEND_URL=http://localhost:3001 node testAgent.js bootstrap
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

async function request(endpoint, method = 'GET', body = null) {
  const url = `${BACKEND_URL}${endpoint}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) options.body = JSON.stringify(body);

  console.log(`\n📤 ${method} ${url}`);
  if (body) console.log(JSON.stringify(body, null, 2));

  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  console.log(
    response.ok ? '✅' : '❌',
    response.status,
    JSON.stringify(data, null, 2)
  );
  return { ok: response.ok, status: response.status, data };
}

export async function nuevo() {
  return request('/api/examen/nuevo', 'POST', {});
}

export async function turno(respuestaPaciente = null, confianza = 1, timestamp = null) {
  const body = {};
  if (respuestaPaciente != null) {
    body.respuestaPaciente = respuestaPaciente;
    body.confianza = confianza;
    body.timestamp = timestamp ?? new Date().toISOString();
  }
  return request('/api/examen/turno', 'POST', body);
}

export async function estado() {
  return request('/api/examen/estado');
}

export async function detalle() {
  return request('/api/examen/detalle');
}

function assert(condicion, mensaje) {
  if (!condicion) {
    throw new Error(`Assertion failed: ${mensaje}`);
  }
}

function validarBootstrapTurno(turnoRes, detalleRes, opciones = {}) {
  const { respuestaPacienteEsperada = null } = opciones;
  const turno = turnoRes.data;
  const detalle = detalleRes.data?.detalle ?? detalleRes.data;

  assert(turnoRes.ok, 'turno HTTP ok');
  assert(turno.ok === true, 'turno.ok');
  assert(turno.modoTurno === 'bootstrap', 'modoTurno bootstrap');

  const agR = detalle?.agudeza?.R ?? detalle?.estado?.agudeza?.R;
  assert(agR?.logmarActual === 0.3, 'R.logmarActual 0.3');
  assert(agR?.letraActual === 'H', 'R.letraActual H');
  assert(
    Array.isArray(agR?.letrasUsadas) && agR.letrasUsadas.includes('H'),
    'R.letrasUsadas incluye H'
  );

  const mensaje = turno.pasos?.[0]?.mensaje ?? '';
  assert(
    mensaje.toLowerCase().includes('letra'),
    'mensaje paciente menciona letra'
  );
  assert(turno.contextoVoz === 'inicio', 'contextoVoz inicio');

  const historial = detalle?.historial ?? [];
  assert(historial.length >= 1, 'historial con al menos un turno');
  const t0 = historial[0];
  assert(t0.auditoria?.aprobado === true, 'auditor aprobó bootstrap');

  if (respuestaPacienteEsperada != null) {
    assert(
      t0.respuestaPaciente === respuestaPacienteEsperada,
      `respuestaPaciente logueada: ${respuestaPacienteEsperada}`
    );
  }

  const acciones = t0.acciones ?? [];
  const tieneForoptero = acciones.some((a) => a.dispositivo === 'foroptero');
  const tieneTv = acciones.some(
    (a) => a.dispositivo === 'tv' && a.letra === 'H' && a.logmar === 0.3
  );
  assert(tieneForoptero, 'acciones incluyen foróptero');
  assert(tieneTv, 'acciones incluyen TV H@0.3');
}

/** nuevo() → turno() sin params → estado R inicializado. */
export async function bootstrapLimpio() {
  console.log('\n=== Test bootstrapLimpio ===');
  await nuevo();
  const t = await turno();
  const d = await detalle();
  validarBootstrapTurno(t, d);
  console.log('✅ bootstrapLimpio OK');
}

/** nuevo() → turno("iniciar") → bootstrap + frase en historial. */
export async function bootstrapConFraseSocial() {
  console.log('\n=== Test bootstrapConFraseSocial ===');
  await nuevo();
  const t = await turno('iniciar', 0.9);
  const d = await detalle();
  validarBootstrapTurno(t, d, { respuestaPacienteEsperada: 'iniciar' });
  console.log('✅ bootstrapConFraseSocial OK');
}

/** turno() sin /nuevo previo → auto-init + bootstrap. */
export async function bootstrapSinNuevo() {
  console.log('\n=== Test bootstrapSinNuevo ===');
  const t = await turno();
  const d = await detalle();
  validarBootstrapTurno(t, d);
  console.log('✅ bootstrapSinNuevo OK');
}

export async function runBootstrapTests() {
  await request('/api/health');
  await bootstrapLimpio();
  await bootstrapConFraseSocial();
  await bootstrapSinNuevo();
  console.log('\n=== Todos los tests bootstrap OK ===\n');
}

async function main() {
  const modo = process.argv[2];

  if (modo === 'bootstrap') {
    await runBootstrapTests();
    return;
  }

  console.log('=== Test orquestador — agudeza POC ===\n');
  await request('/api/health');
  await nuevo();
  await turno();
  await turno('creo que es una H', 0.9);
  await estado();
  await detalle();
}

const isMain = process.argv[1]?.endsWith('testAgent.js');
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
