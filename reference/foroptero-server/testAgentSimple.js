/**
 * SCRIPT SIMPLE DE TESTING
 * 
 * Uso rápido desde línea de comandos:
 * 
 * node testAgentSimple.js init                    # Inicializar examen
 * node testAgentSimple.js instrucciones           # Obtener instrucciones
 * node testAgentSimple.js instrucciones "texto"   # Con respuesta paciente
 * node testAgentSimple.js estado                  # Consultar estado
 * node testAgentSimple.js reiniciar               # Reiniciar examen
 * node testAgentSimple.js foroptero movimiento    # Comando movimiento
 * node testAgentSimple.js foroptero home          # Comando home
 * node testAgentSimple.js pantalla E 0.0          # Mostrar letra
 */

import { 
  inicializarExamen,
  obtenerInstrucciones,
  consultarEstado,
  reiniciarExamen,
  comandoForoptero,
  consultarEstadoForoptero,
  mostrarPantalla,
  consultarEstadoPantalla
} from './testAgent.js';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

const comando = process.argv[2];
const args = process.argv.slice(3);

async function ejecutar() {
  console.log(`\n📍 Backend: ${BACKEND_URL}\n`);
  
  try {
    switch (comando) {
      case 'init':
      case 'inicializar':
        await inicializarExamen();
        break;
        
      case 'instrucciones':
      case 'inst':
        const respuesta = args[0] || null;
        await obtenerInstrucciones(respuesta);
        break;
        
      case 'estado':
        await consultarEstado();
        break;
        
      case 'reiniciar':
        await reiniciarExamen();
        break;
        
      case 'foroptero':
        const accion = args[0] || 'movimiento';
        const rStr = args[1];
        const lStr = args[2];
        const R = rStr ? JSON.parse(rStr) : null;
        const L = lStr ? JSON.parse(lStr) : null;
        await comandoForoptero(accion, R, L);
        break;
        
      case 'estado-foroptero':
        await consultarEstadoForoptero();
        break;
        
      case 'pantalla':
        const letra = args[0];
        const logmar = parseFloat(args[1] || '0.0');
        await mostrarPantalla(letra, logmar);
        break;
        
      case 'estado-pantalla':
        await consultarEstadoPantalla();
        break;
        
      default:
        console.log(`
Uso: node testAgentSimple.js <comando> [argumentos]

Comandos disponibles:
  init, inicializar              Inicializar examen
  instrucciones [respuesta]      Obtener instrucciones (opcional: respuesta paciente)
  estado                         Consultar estado del examen
  reiniciar                      Reiniciar examen
  foroptero <accion> [R] [L]     Comando foróptero (movimiento|home)
  estado-foroptero               Consultar estado del foróptero
  pantalla <letra> <logmar>      Mostrar letra en pantalla
  estado-pantalla                Consultar estado de la pantalla

Ejemplos:
  node testAgentSimple.js init
  node testAgentSimple.js instrucciones "<R> +0.75 , -1.75 , 60 / <L> +2.75 , 0.00 , 0"
  node testAgentSimple.js foroptero movimiento '{"sphere": 0.75, "cylinder": -1.75, "axis": 60}'
  node testAgentSimple.js pantalla E 0.0

Variables de entorno:
  BACKEND_URL=http://localhost:3000  (por defecto)
  BACKEND_URL=https://foroptero-production.up.railway.app  (producción)
        `);
        process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

ejecutar();


