/**
 * Simulador de turnos — sin agente de voz.
 * Uso: BACKEND_URL=http://localhost:3001 node testAgent.js
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
  console.log(response.ok ? '✅' : '❌', response.status, JSON.stringify(data, null, 2));
  return { ok: response.ok, data };
}

export async function nuevo() {
  return request('/api/examen/nuevo', 'POST', {});
}

export async function turno(respuestaPaciente = null, confianza = 1) {
  const body = {};
  if (respuestaPaciente != null) {
    body.respuestaPaciente = respuestaPaciente;
    body.confianza = confianza;
  }
  return request('/api/examen/turno', 'POST', body);
}

export async function estado() {
  return request('/api/examen/estado');
}

export async function detalle() {
  return request('/api/examen/detalle');
}

async function main() {
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
