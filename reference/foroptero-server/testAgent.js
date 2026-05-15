/**
 * SCRIPT DE TESTING - SIMULADOR DE AGENTE AI
 * 
 * Este script permite simular comandos del agente AI para validar
 * las funciones del backend sin necesidad del agente real.
 * 
 * Uso:
 *   node testAgent.js
 * 
 * O usar las funciones directamente:
 *   const tester = require('./testAgent.js');
 *   await tester.inicializarExamen();
 */

import readline from 'readline';

// Configuración
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
// Para producción: 'https://foroptero-production.up.railway.app'

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Función genérica para hacer requests HTTP
 */
async function request(endpoint, method = 'GET', body = null) {
  const url = `${BACKEND_URL}${endpoint}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    log(`\n📤 ${method} ${url}`, 'cyan');
    if (body) {
      log(`   Body: ${JSON.stringify(body, null, 2)}`, 'yellow');
    }
    
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (response.ok) {
      log(`✅ Status: ${response.status}`, 'green');
      log(`   Response: ${JSON.stringify(data, null, 2)}`, 'green');
    } else {
      log(`❌ Status: ${response.status}`, 'red');
      log(`   Error: ${JSON.stringify(data, null, 2)}`, 'red');
    }
    
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    log(`❌ Error de conexión: ${error.message}`, 'red');
    return { ok: false, error: error.message };
  }
}

/**
 * ============================================================
 * FUNCIONES DEL AGENTE AI (simuladas)
 * ============================================================
 */

/**
 * 1. Inicializar examen
 */
export async function inicializarExamen() {
  log('\n🔵 === INICIALIZAR EXAMEN ===', 'bright');
  return await request('/api/examen/nuevo', 'POST');
}

/**
 * 2. Obtener instrucciones (con o sin respuesta del paciente)
 */
export async function obtenerInstrucciones(respuestaPaciente = null) {
  log('\n🔵 === OBTENER INSTRUCCIONES ===', 'bright');
  const body = respuestaPaciente ? { respuestaPaciente } : {};
  return await request('/api/examen/instrucciones', 'POST', body);
}

/**
 * 3. Consultar estado del examen
 */
export async function consultarEstado() {
  log('\n🔵 === CONSULTAR ESTADO ===', 'bright');
  return await request('/api/examen/estado', 'GET');
}

/**
 * 4. Reiniciar examen
 */
export async function reiniciarExamen() {
  log('\n🔵 === REINICIAR EXAMEN ===', 'bright');
  return await request('/api/examen/reiniciar', 'POST');
}

/**
 * 5. Enviar comando al foróptero
 */
export async function comandoForoptero(accion, R = null, L = null) {
  log('\n🔵 === COMANDO FORÓPTERO ===', 'bright');
  const body = { accion };
  if (R) body.R = R;
  if (L) body.L = L;
  return await request('/api/movimiento', 'POST', body);
}

/**
 * 6. Consultar estado del foróptero
 */
export async function consultarEstadoForoptero() {
  log('\n🔵 === ESTADO FORÓPTERO ===', 'bright');
  return await request('/api/estado', 'GET');
}

/**
 * 7. Mostrar letra en pantalla
 */
export async function mostrarPantalla(letra, logmar) {
  log('\n🔵 === MOSTRAR PANTALLA ===', 'bright');
  const body = {
    dispositivo: 'pantalla',
    accion: 'mostrar',
    letra,
    logmar
  };
  return await request('/api/pantalla', 'POST', body);
}

/**
 * 8. Consultar estado de la pantalla
 */
export async function consultarEstadoPantalla() {
  log('\n🔵 === ESTADO PANTALLA ===', 'bright');
  return await request('/api/pantalla', 'GET');
}

/**
 * ============================================================
 * FLUJOS DE TESTING PREDEFINIDOS
 * ============================================================
 */

/**
 * Flujo completo: Inicio del examen
 */
export async function flujoInicioExamen() {
  log('\n\n' + '='.repeat(60), 'bright');
  log('🚀 FLUJO COMPLETO: INICIO DE EXAMEN', 'bright');
  log('='.repeat(60), 'bright');
  
  // 1. Inicializar
  const init = await inicializarExamen();
  if (!init.ok) return;
  
  // 2. Obtener primeras instrucciones
  await obtenerInstrucciones();
  
  // 3. Consultar estado
  await consultarEstado();
}

/**
 * Flujo completo: Procesar valores iniciales
 */
export async function flujoValoresIniciales(valoresTexto) {
  log('\n\n' + '='.repeat(60), 'bright');
  log('🚀 FLUJO COMPLETO: VALORES INICIALES', 'bright');
  log('='.repeat(60), 'bright');
  
  // 1. Inicializar si no está iniciado
  await inicializarExamen();
  
  // 2. Enviar valores del autorefractómetro
  const ejemplo = valoresTexto || '<R> +0.75 , -1.75 , 60 / <L> +2.75 , 0.00 , 0';
  log(`\n📝 Enviando valores: ${ejemplo}`, 'yellow');
  await obtenerInstrucciones(ejemplo);
  
  // 3. Obtener siguientes instrucciones (debería generar pasos de ETAPA_3)
  await obtenerInstrucciones();
  
  // 4. Consultar estado
  await consultarEstado();
}

/**
 * Flujo completo: Configurar foróptero
 */
export async function flujoConfigurarForoptero() {
  log('\n\n' + '='.repeat(60), 'bright');
  log('🚀 FLUJO COMPLETO: CONFIGURAR FORÓPTERO', 'bright');
  log('='.repeat(60), 'bright');
  
  // 1. Primero obtener valores iniciales
  await flujoValoresIniciales();
  
  // 2. Las instrucciones deberían incluir un paso de foróptero
  // (esto se hace automáticamente en obtenerInstrucciones)
  
  // 3. Simular comando de movimiento (si las instrucciones lo requieren)
  await comandoForoptero('movimiento', 
    { sphere: 0.75, cylinder: -1.75, axis: 60 },
    { occlusion: 'close' }
  );
  
  // 4. Consultar estado del foróptero
  await consultarEstadoForoptero();
}

/**
 * Flujo completo: Test de agudeza visual
 */
export async function flujoTestAgudeza() {
  log('\n\n' + '='.repeat(60), 'bright');
  log('🚀 FLUJO COMPLETO: TEST DE AGUDEZA VISUAL', 'bright');
  log('='.repeat(60), 'bright');
  
  // 1. Configurar foróptero primero
  await flujoConfigurarForoptero();
  
  // 2. Mostrar letra en pantalla
  await mostrarPantalla('E', 0.0);
  
  // 3. Simular respuesta del paciente
  await obtenerInstrucciones('E');
  
  // 4. Consultar estado
  await consultarEstado();
}

/**
 * ============================================================
 * MENÚ INTERACTIVO
 * ============================================================
 */

function mostrarMenu() {
  log('\n' + '='.repeat(60), 'bright');
  log('🤖 SIMULADOR DE AGENTE AI - MENÚ PRINCIPAL', 'bright');
  log('='.repeat(60), 'bright');
  log('\nOpciones disponibles:', 'cyan');
  log('  1. Inicializar examen');
  log('  2. Obtener instrucciones');
  log('  3. Obtener instrucciones (con respuesta paciente)');
  log('  4. Consultar estado del examen');
  log('  5. Reiniciar examen');
  log('  6. Comando foróptero (movimiento)');
  log('  7. Comando foróptero (home)');
  log('  8. Consultar estado foróptero');
  log('  9. Mostrar letra en pantalla');
  log('  10. Consultar estado pantalla');
  log('\n  Flujos completos:');
  log('  11. Flujo: Inicio de examen');
  log('  12. Flujo: Valores iniciales');
  log('  13. Flujo: Configurar foróptero');
  log('  14. Flujo: Test de agudeza');
  log('\n  0. Salir');
  log('\n' + '='.repeat(60), 'bright');
}

async function procesarOpcion(opcion, rl) {
  switch (opcion.trim()) {
    case '1':
      await inicializarExamen();
      break;
      
    case '2':
      await obtenerInstrucciones();
      break;
      
    case '3':
      rl.question('\n📝 Ingresa la respuesta del paciente: ', async (respuesta) => {
        await obtenerInstrucciones(respuesta);
        mostrarMenu();
        pedirOpcion(rl);
      });
      return;
      
    case '4':
      await consultarEstado();
      break;
      
    case '5':
      await reiniciarExamen();
      break;
      
    case '6':
      rl.question('\n📝 Ingresa valores R (ej: {"sphere": 0.75, "cylinder": -1.75, "axis": 60}) o Enter para omitir: ', async (rStr) => {
        rl.question('📝 Ingresa valores L (ej: {"sphere": 2.75, "cylinder": 0, "axis": 0}) o Enter para omitir: ', async (lStr) => {
          const R = rStr.trim() ? JSON.parse(rStr) : null;
          const L = lStr.trim() ? JSON.parse(lStr) : null;
          await comandoForoptero('movimiento', R, L);
          mostrarMenu();
          pedirOpcion(rl);
        });
      });
      return;
      
    case '7':
      rl.question('\n📝 Ingresa valores R (ej: {"sphere": 0, "cylinder": 0, "axis": 0}) o Enter para omitir: ', async (rStr) => {
        rl.question('📝 Ingresa valores L (ej: {"sphere": 0, "cylinder": 0, "axis": 0}) o Enter para omitir: ', async (lStr) => {
          const R = rStr.trim() ? JSON.parse(rStr) : null;
          const L = lStr.trim() ? JSON.parse(lStr) : null;
          await comandoForoptero('home', R, L);
          mostrarMenu();
          pedirOpcion(rl);
        });
      });
      return;
      
    case '8':
      await consultarEstadoForoptero();
      break;
      
    case '9':
      rl.question('\n📝 Ingresa la letra (ej: E): ', async (letra) => {
        rl.question('📝 Ingresa el logMAR (ej: 0.0): ', async (logmarStr) => {
          await mostrarPantalla(letra.trim(), parseFloat(logmarStr));
          mostrarMenu();
          pedirOpcion(rl);
        });
      });
      return;
      
    case '10':
      await consultarEstadoPantalla();
      break;
      
    case '11':
      await flujoInicioExamen();
      break;
      
    case '12':
      rl.question('\n📝 Ingresa valores iniciales (o Enter para usar ejemplo): ', async (valores) => {
        await flujoValoresIniciales(valores.trim() || null);
        mostrarMenu();
        pedirOpcion(rl);
      });
      return;
      
    case '13':
      await flujoConfigurarForoptero();
      break;
      
    case '14':
      await flujoTestAgudeza();
      break;
      
    case '0':
      log('\n👋 ¡Hasta luego!', 'green');
      rl.close();
      process.exit(0);
      break;
      
    default:
      log('\n❌ Opción inválida. Intenta de nuevo.', 'red');
  }
  
  mostrarMenu();
  pedirOpcion(rl);
}

function pedirOpcion(rl) {
  rl.question('\n👉 Selecciona una opción: ', (opcion) => {
    procesarOpcion(opcion, rl);
  });
}

/**
 * Iniciar modo interactivo
 */
export function iniciarModoInteractivo() {
  log('\n🚀 Iniciando simulador de agente AI...', 'bright');
  log(`📍 Backend URL: ${BACKEND_URL}`, 'cyan');
  log('💡 Tip: Puedes cambiar BACKEND_URL con la variable de entorno', 'yellow');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  mostrarMenu();
  pedirOpcion(rl);
}

/**
 * ============================================================
 * EJECUCIÓN
 * ============================================================
 */

// Si se ejecuta directamente, iniciar modo interactivo
// Verificar si el script se ejecuta directamente
if (process.argv[1] && process.argv[1].endsWith('testAgent.js')) {
  iniciarModoInteractivo();
}

