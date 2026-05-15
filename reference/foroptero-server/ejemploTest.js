/**
 * EJEMPLO DE USO DEL SIMULADOR DE AGENTE AI
 * 
 * Este script muestra cómo usar las funciones del simulador
 * de manera programática para crear tests automatizados.
 * 
 * Ejecutar:
 *   node ejemploTest.js
 */

import {
  inicializarExamen,
  obtenerInstrucciones,
  consultarEstado,
  flujoValoresIniciales
} from './testAgent.js';

async function ejemploBasico() {
  console.log('\n📋 === EJEMPLO BÁSICO ===\n');
  
  // 1. Inicializar examen
  console.log('1️⃣ Inicializando examen...');
  const init = await inicializarExamen();
  if (!init.ok) {
    console.error('❌ Error al inicializar');
    return;
  }
  
  // 2. Obtener primeras instrucciones
  console.log('\n2️⃣ Obteniendo primeras instrucciones...');
  const instrucciones1 = await obtenerInstrucciones();
  
  // 3. Enviar valores del autorefractómetro
  console.log('\n3️⃣ Enviando valores del autorefractómetro...');
  const valores = "<R> +0.75 , -1.75 , 60 / <L> +2.75 , 0.00 , 0";
  const instrucciones2 = await obtenerInstrucciones(valores);
  
  // 4. Obtener siguientes pasos (debería generar pasos de configuración)
  console.log('\n4️⃣ Obteniendo siguientes pasos...');
  const instrucciones3 = await obtenerInstrucciones();
  
  // 5. Consultar estado final
  console.log('\n5️⃣ Consultando estado final...');
  await consultarEstado();
  
  console.log('\n✅ Ejemplo básico completado\n');
}

async function ejemploFlujoCompleto() {
  console.log('\n📋 === EJEMPLO FLUJO COMPLETO ===\n');
  
  // Usar el flujo predefinido
  await flujoValoresIniciales("<R> +0.75 , -1.75 , 60 / <L> +2.75 , 0.00 , 0");
  
  console.log('\n✅ Flujo completo completado\n');
}

async function ejemploValidacion() {
  console.log('\n📋 === EJEMPLO VALIDACIÓN ===\n');
  
  // Test: Validar que los valores se procesan correctamente
  await inicializarExamen();
  
  // Enviar valores válidos
  const resultado1 = await obtenerInstrucciones("<R> +0.75 , -1.75 , 60 / <L> +2.75 , 0.00 , 0");
  
  if (resultado1.ok) {
    console.log('✅ Valores válidos procesados correctamente');
  } else {
    console.log('❌ Error procesando valores válidos');
  }
  
  // Enviar valores inválidos
  const resultado2 = await obtenerInstrucciones("valores inválidos");
  
  if (resultado2.ok && resultado2.data.pasos) {
    console.log('✅ Valores inválidos detectados correctamente');
    console.log('   Mensaje de error:', resultado2.data.pasos[0]?.mensaje);
  } else {
    console.log('❌ Error en validación de valores inválidos');
  }
  
  // Consultar estado
  const estado = await consultarEstado();
  if (estado.ok) {
    console.log('\n📊 Estado del examen:');
    console.log('   Etapa:', estado.data.estado?.etapa);
    console.log('   Progreso:', estado.data.estado?.progreso + '%');
  }
  
  console.log('\n✅ Validación completada\n');
}

// Ejecutar ejemplos
async function main() {
  try {
    await ejemploBasico();
    
    // Descomentar para ejecutar otros ejemplos:
    // await ejemploFlujoCompleto();
    // await ejemploValidacion();
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();


