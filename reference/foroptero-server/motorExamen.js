/**
 * MOTOR DE EXAMEN VISUAL
 * 
 * State Machine que maneja toda la lógica del examen visual.
 * El agente solo ejecuta pasos, el backend decide TODO.
 * 
 * FASE 1: El backend ejecuta comandos automáticamente (foróptero, TV)
 * y solo retorna pasos de tipo "hablar" al agente.
 */

// Importar funciones de ejecución interna desde server.js
// Nota: Estas funciones se importarán dinámicamente para evitar dependencia circular
let ejecutarComandoForopteroInterno = null;
let ejecutarComandoTVInterno = null;
let obtenerEstadoForoptero = null;

/**
 * Inicializa las funciones de ejecución interna
 * Se debe llamar desde server.js después de crear las funciones
 */
export function inicializarEjecutores(foropteroFn, tvFn, estadoForopteroFn) {
  ejecutarComandoForopteroInterno = foropteroFn;
  ejecutarComandoTVInterno = tvFn;
  obtenerEstadoForoptero = estadoForopteroFn;
  console.log('✅ Ejecutores internos inicializados');
}

// Estado global del examen (en memoria para MVP)
let estadoExamen = {
  // Modo de examen: 'normal' (por defecto) o tests de prueba ('testesf', 'testcil', 'testbin')
  modo: 'normal',
  // Identificación
  sessionId: null,
  
  // Etapa actual
  etapa: 'INICIO', // 'INICIO' | 'ETAPA_1' | 'ETAPA_2' | 'ETAPA_3' | 'ETAPA_4' | 'ETAPA_5' | 'FINALIZADO'
  subEtapa: null,
  
  // Datos del examen
  valoresIniciales: {
    R: { esfera: null, cilindro: null, angulo: null },
    L: { esfera: null, cilindro: null, angulo: null }
  },
  valoresRecalculados: {
    R: { esfera: null, cilindro: null, angulo: null },
    L: { esfera: null, cilindro: null, angulo: null }
  },
  
  // Progreso por ojo
  ojoActual: 'R',
  
  // Agudeza visual
  agudezaVisual: {
    R: { logmar: null, letra: null, confirmado: false },
    L: { logmar: null, letra: null, confirmado: false }
  },
  
  // Tests de lentes
  lentes: {
    R: {
      esfericoGrueso: { valor: null, confirmado: false },
      esfericoFino: { valor: null, confirmado: false },
      cilindrico: { valor: null, confirmado: false }
    },
    L: {
      esfericoGrueso: { valor: null, confirmado: false },
      esfericoFino: { valor: null, confirmado: false },
      cilindrico: { valor: null, confirmado: false }
    }
  },
  
  // Estado de comparación (para tests de lentes) - Estrategia de 3 valores
  comparacionActual: {
    tipo: null,              // 'esferico_grueso', 'esferico_fino', etc.
    ojo: null,              // 'R' | 'L'
    valorBase: null,        // Valor base del test (ej: +0.75)
    
    // Navegación adaptativa
    valorActual: null,      // Valor que está mostrándose actualmente (ej: +1.25)
    valorAnterior: null,    // Último valor mostrado antes del actual (ej: +0.75)
    valorConfirmado: null,  // Valor que se está confirmando (ej: +0.75)
    confirmaciones: 0,      // Número de confirmaciones (0, 1, 2)
    direccion: null,        // 'subiendo' | 'bajando' | null
    
    // Estado de la secuencia
    faseComparacion: null,  // 'iniciando' | 'mostrando_alternativo' | 'preguntando' | 'confirmando' | 'navegando'
    letraActual: null,      // Letra que se está mostrando en la TV
    logmarActual: null,     // LogMAR de la letra actual
    
    // Saltos y valores pre-calculados (para estrategia de 3 valores)
    saltoActual: null,      // Salto actual (ej: 0.50 para esférico grueso, 0.25 para fino)
    valorMas: null,         // Valor base + salto (ej: +1.25 si base es +0.75)
    valorMenos: null,       // Valor base - salto (ej: +0.25 si base es +0.75)
    valoresProbados: {      // Rastrear qué valores ya probamos
      mas: false,           // ¿Ya probamos +salto?
      menos: false,         // ¿Ya probamos -salto?
      base: false          // ¿Ya confirmamos base?
    }
  },
  
  // Estado de agudeza (para navegación logMAR)
  agudezaEstado: {
    ojo: null,
    logmarActual: null,
    letraActual: null,
    mejorLogmar: null,
    ultimoLogmarCorrecto: null,
    letrasUsadas: [],
    intentos: 0,
    confirmaciones: 0
  },
  
  // Estado de binocular — ver DEFINICIONES_EXAMEN_BINOCULAR.md
  binocularEstado: {
    rxInicial: null,      // { R, L } entrada ETAPA_6
    rxActiva: null,       // { R, L } tras cada decisión
    rxBasePaso: null,     // base de la comparación actual (anterior)
    rxVariante: null,     // variante 0,50 hacia el cero
    paso: null,           // 'esfera' | 'cilindro' | null
    faseBinocular: null,  // ver constantes FB_* en motor
    omitirCilindro: false
  },
  
  // Respuesta pendiente del paciente (para procesamiento)
  respuestaPendiente: null,

  /**
   * Obsoleto: antes se usaba espera de "listo" tras cambio de ojo (Etapa 2 = pre-grueso visual).
   * Se mantiene la clave en null por compatibilidad.
   */
  esperaListoCambioOjo: null,

  /**
   * Antes del primer esferico_grueso de un ojo: "¿ves bien?" + ajuste logMAR (TV H).
   * null | { activa: true, ojo: 'R'|'L', logmarEnPantalla: number, faseDialogo: string }
   */
  preGruesoVisual: null,

  /** Índice de secuencia para el que ya se emitió el bundle de adaptación + pre-grueso (cambio de ojo). */
  adaptacionPreGruesoEmitidaParaIndice: null,
  
  // Secuencia del examen
  secuenciaExamen: {
    testsActivos: [], // Array de { tipo, ojo }
    indiceActual: 0,
    testActual: null, // { tipo: 'esferico_grueso', ojo: 'R' } | …
    resultados: {
        R: {
          agudezaInicial: null,
          esfericoGrueso: null,
          esfericoFino: null,
          cilindrico: null,
          cilindricoAngulo: null,
          agudezaAlcanzada: null,
          binocular: null
        },
        L: {
          agudezaInicial: null,
          esfericoGrueso: null,
          esfericoFino: null,
          cilindrico: null,
          cilindricoAngulo: null,
          agudezaAlcanzada: null,
          binocular: null
        }
    }
  },
  
  // Timestamps
  iniciado: null,
  finalizado: null,

  deferredPostComparacion: null,

  /**
   * Tras confirmar un test de lentes: si el siguiente es otro test de lentes mismo ojo (grueso→fino, …),
   * se programa ritual reanclaje + 3s + Sigamos antes de iniciar la comparación (§4.4 P3–P4). null si no aplica.
   */
  ritualInterTestsPendiente: null
};

/** Registro POC exportable a CSV (misma vida útil que estadoExamen) */
let registroExamenEventos = [];
/** Texto autorefractor tal como lo envió el paciente (ETAPA_1 válida) */
let registroTextoValoresInicialesPaciente = null;

/**
 * Inicializa el examen (resetea todo el estado)
 */
export function inicializarExamen(modo = 'normal') {
  const modosPermitidos = ['normal', 'testesf', 'testcil', 'testbin'];
  const modoInicial = modosPermitidos.includes(modo) ? modo : 'normal';

  estadoExamen = {
    modo: modoInicial,
    sessionId: null,
    etapa: 'INICIO',
    subEtapa: null,
    valoresIniciales: {
      R: { esfera: null, cilindro: null, angulo: null },
      L: { esfera: null, cilindro: null, angulo: null }
    },
    valoresRecalculados: {
      R: { esfera: null, cilindro: null, angulo: null },
      L: { esfera: null, cilindro: null, angulo: null }
    },
    ojoActual: 'R',
    agudezaVisual: {
      R: { logmar: null, letra: null, confirmado: false },
      L: { logmar: null, letra: null, confirmado: false }
    },
    lentes: {
      R: {
        esfericoGrueso: { valor: null, confirmado: false },
        esfericoFino: { valor: null, confirmado: false },
        cilindrico: { valor: null, confirmado: false }
      },
      L: {
        esfericoGrueso: { valor: null, confirmado: false },
        esfericoFino: { valor: null, confirmado: false },
        cilindrico: { valor: null, confirmado: false }
      }
    },
    comparacionActual: {
      tipo: null,
      ojo: null,
      valorBase: null,
      valorActual: null,
      valorAnterior: null,
      valorConfirmado: null,
      confirmaciones: 0,
      direccion: null,
      faseComparacion: null,
      letraActual: null,
      logmarActual: null,
      saltoActual: null,
      valorMas: null,
      valorMenos: null,
      valoresProbados: {
        mas: false,
        menos: false,
        base: false
      }
    },
    agudezaEstado: {
      ojo: null,
      logmarActual: null,
      letraActual: null,
      mejorLogmar: null,
      ultimoLogmarCorrecto: null,
      letrasUsadas: [],
      intentos: 0,
      confirmaciones: 0
    },
    binocularEstado: {
      rxInicial: null,
      rxActiva: null,
      rxBasePaso: null,
      rxVariante: null,
      paso: null,
      faseBinocular: null,
      omitirCilindro: false
    },
    respuestaPendiente: null,
    esperaListoCambioOjo: null,
    preGruesoVisual: null,
    adaptacionPreGruesoEmitidaParaIndice: null,
    /** Tras "Sigamos con este.", siguiente llamada sin respuesta ejecuta pasos automáticos pendientes */
    deferredPostComparacion: null,
    ritualInterTestsPendiente: null,
    secuenciaExamen: {
      testsActivos: [],
      indiceActual: 0,
      testActual: null,
      resultados: {
        R: {
          agudezaInicial: null,
          esfericoGrueso: null,
          esfericoFino: null,
          cilindrico: null,
          cilindricoAngulo: null,
          agudezaAlcanzada: null,
          binocular: null
        },
        L: {
          agudezaInicial: null,
          esfericoGrueso: null,
          esfericoFino: null,
          cilindrico: null,
          cilindricoAngulo: null,
          agudezaAlcanzada: null,
          binocular: null
        }
      }
    },
    iniciado: Date.now(),
    finalizado: null
  };

  registroExamenLimpiar();
  
  console.log(`✅ Examen inicializado (modo: ${modoInicial})`);
  return estadoExamen;
}

/**
 * Valida y parsea los valores iniciales del autorefractómetro
 * Formato esperado: "<R> +0.75 , -1.75 , 60 / <L> +2.75 , 0.00 , 0"
 */
export function validarValoresIniciales(texto) {
  if (!texto || typeof texto !== 'string') {
    return { valido: false, error: 'El texto está vacío o no es válido' };
  }
  
  // Limpiar el texto
  const textoLimpio = texto.trim();
  
  // Patrón regex para validar formato
  // Formato: <R> esfera, cilindro, angulo / <L> esfera, cilindro, angulo
  const patron = /<R>\s*([+-]?\d+\.?\d*)\s*,\s*([+-]?\d+\.?\d*)\s*,\s*(\d+)\s*\/\s*<L>\s*([+-]?\d+\.?\d*)\s*,\s*([+-]?\d+\.?\d*)\s*,\s*(\d+)/i;
  
  const match = textoLimpio.match(patron);
  
  if (!match) {
    return { 
      valido: false, 
      error: 'Formato incorrecto. Ejemplo: <R> +0.75 , -1.75 , 60 / <L> +2.75 , 0.00 , 0' 
    };
  }
  
  // Extraer valores
  const valores = {
    R: {
      esfera: parseFloat(match[1]),
      cilindro: parseFloat(match[2]),
      angulo: parseInt(match[3])
    },
    L: {
      esfera: parseFloat(match[4]),
      cilindro: parseFloat(match[5]),
      angulo: parseInt(match[6])
    }
  };
  
  // Validar rangos
  if (valores.R.angulo < 0 || valores.R.angulo > 180) {
    return { valido: false, error: 'El ángulo del ojo derecho debe estar entre 0 y 180' };
  }
  
  if (valores.L.angulo < 0 || valores.L.angulo > 180) {
    return { valido: false, error: 'El ángulo del ojo izquierdo debe estar entre 0 y 180' };
  }
  
  return { valido: true, valores };
}

/**
 * Procesa una respuesta del paciente según la etapa actual
 */
export function procesarRespuesta(respuestaPaciente) {
  if (!respuestaPaciente || typeof respuestaPaciente !== 'string') {
    return { ok: false, error: 'Respuesta inválida' };
  }
  
  console.log(`📥 Procesando respuesta en etapa ${estadoExamen.etapa}:`, respuestaPaciente);
  
  switch (estadoExamen.etapa) {
    case 'ETAPA_1':
      return procesarRespuestaEtapa1(respuestaPaciente);
    
    case 'ETAPA_2':
      // Etapa 2 es silenciosa, no procesa respuestas del paciente
      // El recálculo se hace automáticamente en generarPasos()
      return { ok: true };
    
    case 'ETAPA_3':
      // Etapa 3: después de configurar el foróptero, cualquier respuesta del paciente
      // significa que está listo, pasar a ETAPA_4
      if (estadoExamen.subEtapa === 'FOROPTERO_CONFIGURADO') {
        estadoExamen.etapa = 'ETAPA_4';
        estadoExamen.ojoActual = estadoExamen.secuenciaExamen.testActual?.ojo || 'R';
        estadoExamen.subEtapa = null;
        console.log('✅ Foróptero configurado, pasando a ETAPA_4');
      }
      return { ok: true };
    
    case 'ETAPA_4':
      // ETAPA_4 se procesa directamente en obtenerInstrucciones() con interpretacionAgudeza
      // Este case no se debería ejecutar, pero por seguridad retornamos ok
      return { ok: true };
    
    case 'ETAPA_5':
      // ETAPA_5 se procesa directamente en obtenerInstrucciones() con interpretacionComparacion
      // Este case no se debería ejecutar, pero por seguridad retornamos ok
      return { ok: true };
    
    default:
      return { ok: false, error: `Etapa ${estadoExamen.etapa} no implementada aún` };
  }
}

/**
 * Procesa respuesta de la Etapa 1 (recolección de valores)
 */
function procesarRespuestaEtapa1(respuestaPaciente) {
  const validacion = validarValoresIniciales(respuestaPaciente);
  
  if (!validacion.valido) {
    // Generar pasos de error de formato
    return {
      ok: true,
      pasos: [
        {
          tipo: 'hablar',
          orden: 1,
          mensaje: `Los valores no están completos o no tienen el formato correcto. Revisalos por favor. Ejemplo: <R> +0.75 , -1.75 , 60 / <L> +2.75 , 0.00 , 0`
        }
      ]
    };
  }
  
  // Guardar valores
  estadoExamen.valoresIniciales = validacion.valores;
  registroTextoValoresInicialesPaciente = respuestaPaciente.trim();
  estadoExamen.etapa = 'ETAPA_2';
  
  console.log('✅ Valores iniciales guardados:', validacion.valores);
  
  // La Etapa 2 se procesa automáticamente en generarPasos()
  return { ok: true };
}

/**
 * Genera pasos atómicos según la etapa actual
 */
export function generarPasos() {
  console.log(`🔧 Generando pasos para etapa: ${estadoExamen.etapa}`);
  
  switch (estadoExamen.etapa) {
    case 'INICIO':
      return generarPasosInicio();
    
    case 'ETAPA_1':
      return generarPasosEtapa1();
    
    case 'ETAPA_2':
      return generarPasosEtapa2();
    
    case 'ETAPA_3':
      return generarPasosEtapa3();
    
    case 'ETAPA_4':
      return generarPasosEtapa4();
    
    case 'ETAPA_5':
      return generarPasosEtapa5();
    
    case 'ETAPA_6':
      return generarPasosEtapa6();
    
    default:
      return {
        ok: false,
        error: `Etapa ${estadoExamen.etapa} no implementada aún`
      };
  }
}

/**
 * Genera pasos para INICIO
 */
function generarPasosInicio() {
  estadoExamen.etapa = 'ETAPA_1';
  
  return {
    ok: true,
    pasos: [
      {
        tipo: 'hablar',
        orden: 1,
        mensaje: 'Hola, escribí los valores del autorefractómetro antes de iniciar el test. Ejemplo de formato: <R> +0.75 , -1.75 , 60 / <L> +2.75 , 0.00 , 0'
      }
    ],
    contexto: {
      etapa: 'ETAPA_1',
      subEtapa: null
    }
  };
}

/**
 * Genera pasos para ETAPA_1
 */
function generarPasosEtapa1() {
  // Si ya hay valores guardados, significa que se validaron correctamente
  // y ya se pasó a ETAPA_2, así que no deberíamos estar aquí
  if (estadoExamen.valoresIniciales.R.esfera !== null) {
    // Ya se procesaron los valores, generar pasos de confirmación breve
    return {
      ok: true,
      pasos: [
        {
          tipo: 'hablar',
          orden: 1,
          mensaje: 'Perfecto, los valores son correctos. Vamos a comenzar.'
        }
      ]
    };
  }
  
  // Si no hay valores, pedirlos de nuevo
  return {
    ok: true,
    pasos: [
      {
        tipo: 'hablar',
        orden: 1,
        mensaje: 'Escribí los valores del autorefractómetro. Ejemplo: <R> +0.75 , -1.75 , 60 / <L> +2.75 , 0.00 , 0'
      }
    ]
  };
}

/**
 * Aplica las reglas de recálculo cilíndrico según protocolo clínico
 * @param {number} cilindro - Valor cilíndrico original
 * @returns {number} - Valor cilíndrico recalculado
 */
export function aplicarRecalculoCilindrico(cilindro) {
  // Reglas de ajuste:
  // - Cilindro entre -0.50 y -2.00 (inclusive) → sumar +0.50 (menos negativo)
  // - Entre -2.25 y -4.00 (inclusive) → sumar +0.75
  // - Entre -4.25 y -6.00 (inclusive) → sumar +1.50
  // - Si es 0 o -0.25 → mantener igual
  // - Si es menor a -6.00 → no modificar
  
  // NOTA: Para números negativos, "entre X y Y" significa:
  // cilindro <= X (más negativo) && cilindro >= Y (menos negativo)
  // Los valores entre rangos (ej: entre -2.00 y -2.25) se tratan con la regla más cercana
  
  if (cilindro === 0 || cilindro === -0.25) {
    return cilindro; // Mantener igual
  }
  
  if (cilindro < -6.00) {
    return cilindro; // No modificar
  }
  
  // Entre -0.50 y -2.00 (inclusive): cilindro <= -0.50 && cilindro >= -2.00
  if (cilindro <= -0.50 && cilindro >= -2.00) {
    return cilindro + 0.50; // Sumar +0.50
  }
  
  // Entre -2.00 y -2.25 (gap): aplicar regla de -2.25 a -4.00 (más cercana)
  // O mejor: extender el rango -0.50 a -2.00 hasta -2.24 para cubrir el gap
  if (cilindro < -2.00 && cilindro > -2.25) {
    // Valores entre -2.00 y -2.25: aplicar regla de -2.25 (sumar +0.75)
    return cilindro + 0.75;
  }
  
  // Entre -2.25 y -4.00 (inclusive): cilindro <= -2.25 && cilindro >= -4.00
  if (cilindro <= -2.25 && cilindro >= -4.00) {
    return cilindro + 0.75; // Sumar +0.75
  }
  
  // Entre -4.00 y -4.25 (gap): aplicar regla de -4.25 a -6.00 (más cercana)
  if (cilindro < -4.00 && cilindro > -4.25) {
    // Valores entre -4.00 y -4.25: aplicar regla de -4.25 (sumar +1.50)
    return cilindro + 1.50;
  }
  
  // Entre -4.25 y -6.00 (inclusive): cilindro <= -4.25 && cilindro >= -6.00
  if (cilindro <= -4.25 && cilindro >= -6.00) {
    return cilindro + 1.50; // Sumar +1.50
  }
  
  // Para valores fuera de los rangos definidos (ej: entre -0.25 y -0.50), mantener igual
  return cilindro;
}

/**
 * Aplica las reglas de recálculo esférico según protocolo clínico
 * @param {number} esfera - Valor esférico original
 * @returns {number} - Valor esférico recalculado
 */
export function aplicarRecalculoEsferico(esfera) {
  // Reglas de recálculo esférico (valores en saltos de 0.25, sin gaps):
  // Valores negativos: mantener igual (no se aplican reglas)
  // Valores positivos:
  // 1. Hasta +1.25 inclusive → mantener igual
  // 2. Entre +1.50 a +3.00 inclusive → restar 0.50
  // 3. Entre +3.25 a +4.50 inclusive → restar 0.75
  // 4. Desde +4.75 en adelante → restar 1.00
  
  // Valores negativos: mantener igual (no se aplican reglas de recálculo)
  if (esfera < 0) {
    return esfera;
  }
  
  // Regla 1: Hasta +1.25 inclusive → mantener igual
  if (esfera <= 1.25) {
    return esfera;
  }
  
  // Regla 2: Entre +1.50 a +3.00 inclusive → restar 0.50
  if (esfera >= 1.50 && esfera <= 3.00) {
    return esfera - 0.50;
  }
  
  // Regla 3: Entre +3.25 a +4.50 inclusive → restar 0.75
  if (esfera >= 3.25 && esfera <= 4.50) {
    return esfera - 0.75;
  }
  
  // Regla 4: Desde +4.75 en adelante → restar 1.00
  if (esfera >= 4.75) {
    return esfera - 1.00;
  }
  
  // Por seguridad, retornar valor original si no aplica ninguna regla
  // (esto no debería pasar con valores en saltos de 0.25)
  return esfera;
}

/**
 * Determina qué tests de cilindro incluir según el valor del cilindro recalculado
 * @param {number} cilindro - Valor cilíndrico recalculado
 * @returns {object} - Configuración de tests activos
 */
function determinarTestsActivos(cilindro) {
  const tests = {
    cilindrico: false,
    cilindricoAngulo: false
  };
  
  if (cilindro === 0 || cilindro === -0.25) {
    // No incluir tests de cilindro
    tests.cilindrico = false;
    tests.cilindricoAngulo = false;
  } else if (cilindro <= -0.50 && cilindro >= -1.75) {
    // Incluir test de cilindro, pero NO de ángulo
    // Rango: -1.75 a -0.50 (inclusive)
    // Para números negativos: <= -0.50 significa más negativo, >= -1.75 significa menos negativo
    tests.cilindrico = true;
    tests.cilindricoAngulo = false;
  } else if (cilindro <= -2.00 && cilindro >= -6.00) {
    // Incluir ambos tests
    // Rango: -6.00 a -2.00 (inclusive)
    // Para números negativos: <= -2.00 significa más negativo, >= -6.00 significa menos negativo
    tests.cilindrico = true;
    tests.cilindricoAngulo = true;
  }
  
  return tests;
}

/**
 * Genera la secuencia completa del examen basada en valores recalculados
 * @returns {array} - Array de tests activos en orden de ejecución
 */
function generarSecuenciaExamen() {
  const valoresR = estadoExamen.valoresRecalculados.R;
  const valoresL = estadoExamen.valoresRecalculados.L;
  
  // Determinar tests activos para cada ojo
  const testsR = determinarTestsActivos(valoresR.cilindro);
  const testsL = determinarTestsActivos(valoresL.cilindro);
  
  // Construir secuencia de tests activos
  const secuencia = [];
  
  // OJO DERECHO (R) — baseline logMAR en resultados/agudezaVisual al iniciar esferico_grueso
  secuencia.push({ tipo: 'esferico_grueso', ojo: 'R' });
  secuencia.push({ tipo: 'esferico_fino', ojo: 'R' });
  
  if (testsR.cilindrico) {
    secuencia.push({ tipo: 'cilindrico', ojo: 'R' });
  }
  
  if (testsR.cilindricoAngulo) {
    secuencia.push({ tipo: 'cilindrico_angulo', ojo: 'R' });
  }
  
  secuencia.push({ tipo: 'agudeza_alcanzada', ojo: 'R' });
  
  // OJO IZQUIERDO (L)
  secuencia.push({ tipo: 'esferico_grueso', ojo: 'L' });
  secuencia.push({ tipo: 'esferico_fino', ojo: 'L' });
  
  if (testsL.cilindrico) {
    secuencia.push({ tipo: 'cilindrico', ojo: 'L' });
  }
  
  if (testsL.cilindricoAngulo) {
    secuencia.push({ tipo: 'cilindrico_angulo', ojo: 'L' });
  }
  
  secuencia.push({ tipo: 'agudeza_alcanzada', ojo: 'L' });
  
  // Binocular (último test antes de finalizar)
  secuencia.push({ tipo: 'binocular', ojo: 'B' });
  
  return secuencia;
}

/**
 * Obtiene el test actual que se está ejecutando
 * @returns {object|null} - Test actual o null si no hay
 */
export function obtenerTestActual() {
  return estadoExamen.secuenciaExamen.testActual;
}

/**
 * Mapea el tipo de test a su etapa correspondiente
 * @param {string} tipo - Tipo de test
 * @returns {string} - Etapa correspondiente
 */
function mapearTipoTestAEtapa(tipo) {
  const mapa = {
    'esferico_grueso': 'ETAPA_5',
    'esferico_fino': 'ETAPA_5',
    'cilindrico': 'ETAPA_5',
    'cilindrico_angulo': 'ETAPA_5',
    'agudeza_alcanzada': 'ETAPA_4',
    'binocular': 'ETAPA_6'
  };
  return mapa[tipo] || 'ETAPA_4'; // Default a ETAPA_4 por seguridad
}

/**
 * Genera la secuencia de tests para modo de examen de prueba
 * @param {string} modo - 'testesf' | 'testcil' | 'testbin'
 * @returns {array} - Array de tests activos en orden de ejecución
 */
function generarSecuenciaPrueba(modo) {
  const secuencia = [];
  const valoresR = estadoExamen.valoresRecalculados.R;
  const valoresL = estadoExamen.valoresRecalculados.L;

  if (modo === 'testesf') {
    // Esférico grueso y fino en ambos ojos
    secuencia.push({ tipo: 'esferico_grueso', ojo: 'R' });
    secuencia.push({ tipo: 'esferico_fino', ojo: 'R' });
    secuencia.push({ tipo: 'esferico_grueso', ojo: 'L' });
    secuencia.push({ tipo: 'esferico_fino', ojo: 'L' });
    return secuencia;
  }

  if (modo === 'testcil') {
    // Tests cilíndricos según lógica actual (determinarTestsActivos), por ojo
    const testsActivosR = determinarTestsActivos(valoresR.cilindro);
    const testsActivosL = determinarTestsActivos(valoresL.cilindro);

    if (testsActivosR.cilindrico) {
      secuencia.push({ tipo: 'cilindrico', ojo: 'R' });
    }
    if (testsActivosR.cilindricoAngulo) {
      secuencia.push({ tipo: 'cilindrico_angulo', ojo: 'R' });
    }

    if (testsActivosL.cilindrico) {
      secuencia.push({ tipo: 'cilindrico', ojo: 'L' });
    }
    if (testsActivosL.cilindricoAngulo) {
      secuencia.push({ tipo: 'cilindrico_angulo', ojo: 'L' });
    }

    return secuencia;
  }

  if (modo === 'testbin') {
    // Solo test binocular
    secuencia.push({ tipo: 'binocular', ojo: 'B' });
    return secuencia;
  }

  // Fallback de seguridad: usar secuencia normal
  return generarSecuenciaExamen();
}

/**
 * Avanza al siguiente test en la secuencia
 * @returns {object|null} - Nuevo test actual o null si se completó el examen
 */
export function avanzarTest() {
  const secuencia = estadoExamen.secuenciaExamen;
  
  console.log('➡️ [AVANZAR_TEST] Estado ANTES de avanzar:', {
    indiceActual: secuencia.indiceActual,
    totalTests: secuencia.testsActivos.length,
    testActual: secuencia.testActual,
    etapa: estadoExamen.etapa
  });
  
  if (secuencia.indiceActual >= secuencia.testsActivos.length - 1) {
    // Se completó el examen
    estadoExamen.etapa = 'FINALIZADO';
    estadoExamen.finalizado = Date.now();
    secuencia.testActual = null;
    console.log('➡️ [AVANZAR_TEST] Examen completado');
    return null;
  }
  
  // Avanzar al siguiente test
  const testAnterior = secuencia.testActual;
  secuencia.indiceActual += 1;
  secuencia.testActual = secuencia.testsActivos[secuencia.indiceActual];
  
  // Actualizar etapa según el tipo de test siguiente
  if (secuencia.testActual) {
    estadoExamen.etapa = mapearTipoTestAEtapa(secuencia.testActual.tipo);
    console.log(`➡️ [AVANZAR_TEST] Avanzando a test: ${secuencia.testActual.tipo} (${secuencia.testActual.ojo}) → Etapa: ${estadoExamen.etapa}`);
    console.log('➡️ [AVANZAR_TEST] Cambio de ojo:', {
      testAnterior: testAnterior ? `${testAnterior.tipo} (${testAnterior.ojo})` : 'null',
      testActual: `${secuencia.testActual.tipo} (${secuencia.testActual.ojo})`,
      cambioOjo: testAnterior && testAnterior.ojo !== secuencia.testActual.ojo
    });
  }
  
  return secuencia.testActual;
}

/**
 * Funciones auxiliares para agudeza visual
 */

/**
 * Baja el valor logMAR al siguiente más pequeño
 */
function bajarLogMAR(logmar) {
  const secuencia = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.5, 2.0];
  const indice = secuencia.indexOf(logmar);
  if (indice > 0) {
    return secuencia[indice - 1];
  }
  return logmar; // Ya está en el mínimo
}

/**
 * Sube el valor logMAR al siguiente más grande
 */
function subirLogMAR(logmar) {
  const secuencia = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.5, 2.0];
  const indice = secuencia.indexOf(logmar);
  if (indice < secuencia.length - 1) {
    return secuencia[indice + 1];
  }
  return logmar; // Ya está en el máximo
}

/**
 * Genera una letra Sloan diferente a las usadas
 */
function generarLetraSloan(letrasUsadas) {
  const letrasSloan = ['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z'];
  const disponibles = letrasSloan.filter(l => !letrasUsadas.includes(l));
  
  if (disponibles.length === 0) {
    // Si se usaron todas, resetear y elegir una diferente a la última
    const ultima = letrasUsadas[letrasUsadas.length - 1];
    const sinUltima = letrasSloan.filter(l => l !== ultima);
    return sinUltima[Math.floor(Math.random() * sinUltima.length)];
  }
  
  return disponibles[Math.floor(Math.random() * disponibles.length)];
}

/**
 * Calcula los valores finales del foróptero para agudeza_alcanzada
 * Combina valores recalculados con resultados de tests de lentes
 * @param {string} ojo - 'R' o 'L'
 * @returns {object} - { esfera, cilindro, angulo }
 */
function calcularValoresFinalesForoptero(ojo) {
  const resultados = estadoExamen.secuenciaExamen.resultados[ojo];
  const valoresRecalculados = estadoExamen.valoresRecalculados[ojo];
  
  // Esfera: Prioridad: esfericoFino > esfericoGrueso > valoresRecalculados
  const esfera = resultados.esfericoFino !== null && resultados.esfericoFino !== undefined
    ? resultados.esfericoFino
    : (resultados.esfericoGrueso !== null && resultados.esfericoGrueso !== undefined
      ? resultados.esfericoGrueso
      : valoresRecalculados.esfera);
  
  // Cilindro: Prioridad: cilindrico > valoresRecalculados
  const cilindro = resultados.cilindrico !== null && resultados.cilindrico !== undefined
    ? resultados.cilindrico
    : valoresRecalculados.cilindro;
  
  // Ángulo: Prioridad: cilindricoAngulo > valoresRecalculados
  const angulo = resultados.cilindricoAngulo !== null && resultados.cilindricoAngulo !== undefined
    ? resultados.cilindricoAngulo
    : valoresRecalculados.angulo;
  
  console.log(`🔧 Valores finales foróptero para ${ojo}:`, { esfera, cilindro, angulo });
  
  return { esfera, cilindro, angulo };
}

/** logMAR por defecto antes de lentes y en agudeza_alcanzada (baseline operativa, no medición). */
const LOGMAR_ARRANQUE_LENTES = 0.3;

/** Textos literales — PLAN_IMPLEMENTACION_ETAPA2_LOGMAR_GRUESO §3.4 */
const MSG_PRE_GRUESO_OD =
  'Vamos a empezar con el ojo derecho, esperemos a que se termine de mover los lentes y luego decime si ves bien.';
const MSG_PRE_GRUESO_OI =
  'Ahora vamos con el ojo izquierdo. Esperemos a que se terminen de ajustar los lentes y decime si ves bien.';
const MSG_REPREGUNTA_AJUSTE = '¿Ahora ves bien o necesitás un ajuste más?';
const MSG_LOGMAR_MAX_PRE_GRUESO =
  'Ya estamos en la fila más grande disponible. Seguimos con esta y pasamos a la comparación de lentes.';

/**
 * Tras agudeza alcanzada en un ojo, el primer esferico_grueso del otro ojo requiere adaptación + pre-grueso visual.
 */
function necesitaAdaptacionTrasAgudezaOtroOjo(testActual) {
  if (!testActual || testActual.tipo !== 'esferico_grueso') return false;
  const idx = estadoExamen.secuenciaExamen.indiceActual;
  if (idx < 1) return false;
  const prev = estadoExamen.secuenciaExamen.testsActivos[idx - 1];
  if (!prev || prev.tipo !== 'agudeza_alcanzada') return false;
  return prev.ojo !== testActual.ojo;
}

/**
 * Fija baseline de agudeza por ojo antes del primer esferico_grueso.
 * Si ya hubo confirmación en pre-grueso visual (logMAR fijado), la respeta.
 * @param {'R'|'L'} ojo
 */
function asegurarBaselineAgudezaLentes(ojo) {
  const av = estadoExamen.agudezaVisual[ojo];
  const base =
    av && av.logmar != null && av.confirmado ? av.logmar : LOGMAR_ARRANQUE_LENTES;
  estadoExamen.secuenciaExamen.resultados[ojo].agudezaInicial = base;
  estadoExamen.agudezaVisual[ojo] = {
    logmar: base,
    letra: 'H',
    confirmado: true
  };
}

/**
 * Procesa respuesta del paciente en test de agudeza visual
 * @param {string} respuestaPaciente - Respuesta del paciente (texto crudo)
 * @param {object} interpretacionAgudeza - Interpretación estructurada del agente
 * @returns {object} - Resultado del procesamiento
 */
function procesarRespuestaAgudeza(respuestaPaciente, interpretacionAgudeza) {
  const estado = estadoExamen.agudezaEstado;
  const testActual = estadoExamen.secuenciaExamen.testActual;
  
  // Validar que estamos en agudeza alcanzada (único test de agudeza en ETAPA_4)
  if (!testActual || testActual.tipo !== 'agudeza_alcanzada') {
    return { ok: false, error: 'No estamos en test de agudeza visual' };
  }

  return procesarRespuestaAgudezaAlcanzada(respuestaPaciente, interpretacionAgudeza, estado, testActual.ojo);
}

/**
 * Procesa respuesta del paciente en test de agudeza_alcanzada
 * Misma lógica que agudeza_inicial, pero iniciando desde agudeza_inicial del ojo
 * @param {string} respuestaPaciente - Respuesta del paciente
 * @param {object} interpretacionAgudeza - Interpretación estructurada
 * @param {object} estado - Estado de agudeza
 * @param {string} ojo - 'R' o 'L'
 * @returns {object} - Resultado del procesamiento
 */
function procesarRespuestaAgudezaAlcanzada(respuestaPaciente, interpretacionAgudeza, estado, ojo) {
  const resultado = interpretacionAgudeza?.resultado || 'no_se';
  const agudezaInicial = estado.agudezaInicialReferencia;
  
  console.log(`📊 Procesando agudeza_alcanzada (${ojo}):`, {
    agudezaInicial,
    logmarActual: estado.logmarActual,
    ultimoLogmarCorrecto: estado.ultimoLogmarCorrecto,
    confirmaciones: estado.confirmaciones,
    resultado
  });
  
  if (resultado === 'correcta') {
    // Paciente ve correctamente
    const esMismoLogMAR = estado.logmarActual === estado.ultimoLogmarCorrecto;
    
    // Actualizar último logMAR correcto
    estado.ultimoLogmarCorrecto = estado.logmarActual;
    estado.mejorLogmar = estado.mejorLogmar === null 
      ? estado.logmarActual 
      : Math.min(estado.mejorLogmar, estado.logmarActual);
    
    if (esMismoLogMAR && estado.ultimoLogmarCorrecto !== null) {
      estado.confirmaciones += 1;
      
      console.log(`✅ Confirmación ${estado.confirmaciones}/2 en logMAR ${estado.logmarActual}`);
      
      if (estado.confirmaciones >= 2) {
        // Guardar resultado con 2 confirmaciones (misma regla que agudeza_inicial)
        const logmarFinal = estado.logmarActual;
        
        const campoResultado = mapearTipoTestAResultado('agudeza_alcanzada');
        if (campoResultado) {
          estadoExamen.secuenciaExamen.resultados[ojo][campoResultado] = logmarFinal;
        }
        
        estadoExamen.agudezaVisual[ojo] = {
          logmar: logmarFinal,
          letra: interpretacionAgudeza.letraIdentificada || estado.letraActual,
          confirmado: true
        };
        
        console.log(`✅ Agudeza alcanzada confirmada para ${ojo}: logMAR ${logmarFinal} (${agudezaInicial > logmarFinal ? 'mejoró desde' : agudezaInicial === logmarFinal ? 'igual que' : 'empeoró desde'} ${agudezaInicial})`);
        
        resetearEstadoAgudeza(estado);
        
        const siguienteTest = avanzarTest();
        
        return {
          ok: true,
          resultadoConfirmado: true,
          logmarFinal,
          mejorado: agudezaInicial > logmarFinal,
          agudezaInicial,
          siguienteTest
        };
      }
      
      // Aún no hay 2 confirmaciones, mostrar otra letra en el mismo logMAR
      const nuevaLetra = generarLetraSloan(estado.letrasUsadas);
      estado.letraActual = nuevaLetra;
      estado.letrasUsadas.push(nuevaLetra);
      
      return { ok: true, necesitaNuevaLetra: true };
      
    } else {
      // Nuevo logMAR o primera respuesta correcta
      estado.confirmaciones = 1;
      
      // Bajar logMAR (si no está en 0.0)
      if (estado.logmarActual > 0.0) {
        estado.logmarActual = bajarLogMAR(estado.logmarActual);
      }
      
      // Generar nueva letra
      const nuevaLetra = generarLetraSloan(estado.letrasUsadas);
      estado.letraActual = nuevaLetra;
      estado.letrasUsadas.push(nuevaLetra);
      
      return { ok: true, necesitaNuevaLetra: true };
    }
    
  } else {
    // Paciente NO ve correctamente
    
    if (estado.ultimoLogmarCorrecto !== null) {
      // Volver al último correcto (misma regla que agudeza_inicial)
      estado.logmarActual = estado.ultimoLogmarCorrecto;
      estado.confirmaciones = 0;
      
      const nuevaLetra = generarLetraSloan(estado.letrasUsadas);
      estado.letraActual = nuevaLetra;
      estado.letrasUsadas.push(nuevaLetra);
      
      console.log(`⬇️ No ve en logMAR actual, volviendo a ${estado.logmarActual} para confirmar`);
      
      return { ok: true, necesitaNuevaLetra: true };
      
    } else {
      // Primera respuesta incorrecta sin logMAR correcto previo: subir (misma regla que agudeza_inicial)
      estado.logmarActual = subirLogMAR(estado.logmarActual);
      estado.confirmaciones = 0;
      
      const nuevaLetra = generarLetraSloan(estado.letrasUsadas);
      estado.letraActual = nuevaLetra;
      estado.letrasUsadas.push(nuevaLetra);
      
      console.log(`⬆️ Primera respuesta incorrecta sin logMAR correcto previo, subiendo a ${estado.logmarActual}`);
      
      return { ok: true, necesitaNuevaLetra: true };
    }
  }
}

/**
 * Resetea el estado de agudeza para el siguiente test
 * @param {object} estado - Estado de agudeza a resetear
 */
function resetearEstadoAgudeza(estado) {
  console.log('🔄 [RESET AGUDEZA] Estado ANTES de resetear:', {
    ojo: estado.ojo,
    logmarActual: estado.logmarActual,
    letraActual: estado.letraActual,
    esAgudezaAlcanzada: estado.esAgudezaAlcanzada
  });
  
  estado.ojo = null;
  estado.logmarActual = null;
  estado.letraActual = null;
  estado.mejorLogmar = null;
  estado.ultimoLogmarCorrecto = null;
  estado.letrasUsadas = [];
  estado.intentos = 0;
  estado.confirmaciones = 0;
  estado.esAgudezaAlcanzada = false;
  estado.agudezaInicialReferencia = null;
  
  console.log('🔄 [RESET AGUDEZA] Estado DESPUÉS de resetear:', {
    ojo: estado.ojo,
    logmarActual: estado.logmarActual,
    letraActual: estado.letraActual,
    esAgudezaAlcanzada: estado.esAgudezaAlcanzada
  });
}

/**
 * Genera pasos para ETAPA_2 (cálculo silencioso)
 * Esta etapa no genera pasos visibles, solo procesa internamente
 */
function generarPasosEtapa2() {
  // Aplicar recálculo esférico y cilíndrico a ambos ojos
  const valoresR = { ...estadoExamen.valoresIniciales.R };
  const valoresL = { ...estadoExamen.valoresIniciales.L };
  
  // Aplicar recálculo esférico
  valoresR.esfera = aplicarRecalculoEsferico(valoresR.esfera);
  valoresL.esfera = aplicarRecalculoEsferico(valoresL.esfera);
  
  // Aplicar recálculo cilíndrico
  valoresR.cilindro = aplicarRecalculoCilindrico(valoresR.cilindro);
  valoresL.cilindro = aplicarRecalculoCilindrico(valoresL.cilindro);
  
  // Guardar valores recalculados
  estadoExamen.valoresRecalculados = {
    R: valoresR,
    L: valoresL
  };
  
  // Pasar a ETAPA_3
  estadoExamen.etapa = 'ETAPA_3';
  
  console.log('✅ Valores recalculados:');
  console.log('  Iniciales R:', estadoExamen.valoresIniciales.R);
  console.log('  Recalculados R:', estadoExamen.valoresRecalculados.R);
  console.log('  Iniciales L:', estadoExamen.valoresIniciales.L);
  console.log('  Recalculados L:', estadoExamen.valoresRecalculados.L);
  
  // Esta etapa es silenciosa, no genera pasos visibles
  // La transición a ETAPA_3 se hace automáticamente
  // Generar pasos de ETAPA_3 inmediatamente
  return generarPasosEtapa3();
}

/**
 * Genera pasos para ETAPA_4 (solo agudeza alcanzada tras lentes)
 */
function generarPasosEtapa4() {
  const testActual = estadoExamen.secuenciaExamen.testActual;

  console.log('🔧 [GENERAR_PASOS_ETAPA4] INICIO:', {
    testActual: testActual ? `${testActual.tipo} (${testActual.ojo})` : 'null',
    etapa: estadoExamen.etapa,
    indiceActual: estadoExamen.secuenciaExamen.indiceActual
  });

  if (!testActual || testActual.tipo !== 'agudeza_alcanzada') {
    return {
      ok: false,
      error: 'No estamos en test de agudeza visual'
    };
  }

  const ojo = testActual.ojo;
  const estado = estadoExamen.agudezaEstado;

  console.log('🔧 [GENERAR_PASOS_ETAPA4] Estado de agudeza:', {
    ojoTest: ojo,
    estadoOjo: estado.ojo,
    logmarActual: estado.logmarActual,
    letraActual: estado.letraActual,
    estadoEsAgudezaAlcanzada: estado.esAgudezaAlcanzada
  });

  const necesitaInicializacion =
    estado.ojo !== ojo ||
    estado.logmarActual === null ||
    !estado.esAgudezaAlcanzada;

  const indiceAnterior = estadoExamen.secuenciaExamen.indiceActual - 1;
  const testAnterior = indiceAnterior >= 0
    ? estadoExamen.secuenciaExamen.testsActivos[indiceAnterior]
    : null;

  const cambioDeTipoTest = testAnterior !== null &&
    testAnterior.tipo !== testActual.tipo &&
    (testAnterior.tipo === 'esferico_grueso' ||
      testAnterior.tipo === 'esferico_fino' ||
      testAnterior.tipo === 'cilindrico' ||
      testAnterior.tipo === 'cilindrico_angulo') &&
    testAnterior.ojo === ojo;

  console.log('🔧 [GENERAR_PASOS_ETAPA4] Evaluación de condiciones:', {
    necesitaInicializacion,
    cambioDeTipoTest,
    testAnterior: testAnterior ? `${testAnterior.tipo} (${testAnterior.ojo})` : null,
    estadoOjo: estado.ojo,
    ojoTest: ojo
  });

  if (necesitaInicializacion) {
    estado.ojo = ojo;

    const agudezaInicial = estadoExamen.secuenciaExamen.resultados[ojo].agudezaInicial;

    if (agudezaInicial === null || agudezaInicial === undefined) {
      return {
        ok: false,
        error: `No se encontró agudezaInicial (baseline) para ${ojo}. No se puede ejecutar agudeza_alcanzada.`
      };
    }

    estado.logmarActual = agudezaInicial;
    estado.agudezaInicialReferencia = agudezaInicial;
    estado.letraActual = 'H';
    estado.mejorLogmar = null;
    estado.ultimoLogmarCorrecto = null;
    estado.letrasUsadas = ['H'];
    estado.intentos = 0;
    estado.confirmaciones = 0;
    estado.esAgudezaAlcanzada = true;

    console.log(`🔍 Iniciando test de agudeza alcanzada para ${ojo}`);
    console.log(`   Baseline agudezaInicial: ${agudezaInicial}, empezando desde: ${agudezaInicial}`);

    const valoresFinales = calcularValoresFinalesForoptero(ojo);

    const pasos = [
      {
        tipo: 'foroptero',
        orden: 1,
        foroptero: {
          [ojo]: {
            esfera: valoresFinales.esfera,
            cilindro: valoresFinales.cilindro,
            angulo: valoresFinales.angulo,
            occlusion: 'open'
          },
          [ojo === 'R' ? 'L' : 'R']: {
            occlusion: 'close'
          }
        }
      },
      {
        tipo: 'esperar_foroptero',
        orden: 2
      },
      {
        tipo: 'tv',
        orden: 3,
        letra: estado.letraActual,
        logmar: estado.logmarActual
      },
      {
        tipo: 'hablar',
        orden: 4,
        mensaje: 'Mirá la pantalla. Decime qué letra ves.'
      }
    ];

    return {
      ok: true,
      pasos,
      contexto: {
        etapa: 'ETAPA_4',
        testActual,
        agudezaEstado: {
          logmarActual: estado.logmarActual,
          letraActual: estado.letraActual,
          agudezaInicialReferencia: estado.agudezaInicialReferencia
        }
      }
    };
  }

  if (!necesitaInicializacion && cambioDeTipoTest) {
    const valoresFinales = calcularValoresFinalesForoptero(ojo);

    console.log(`🔄 Cambio de tipo de test detectado (lentes → agudeza_alcanzada): configurando foróptero para ${ojo}`);
    console.log(`   Valores finales:`, valoresFinales);

    const pasos = [
      {
        tipo: 'foroptero',
        orden: 1,
        foroptero: {
          [ojo]: {
            esfera: valoresFinales.esfera,
            cilindro: valoresFinales.cilindro,
            angulo: valoresFinales.angulo,
            occlusion: 'open'
          },
          [ojo === 'R' ? 'L' : 'R']: {
            occlusion: 'close'
          }
        }
      },
      {
        tipo: 'esperar_foroptero',
        orden: 2
      },
      {
        tipo: 'tv',
        orden: 3,
        letra: estado.letraActual,
        logmar: estado.logmarActual
      },
      {
        tipo: 'hablar',
        orden: 4,
        mensaje: 'Mirá la pantalla. Decime qué letra ves.'
      }
    ];

    return {
      ok: true,
      pasos,
      contexto: {
        etapa: 'ETAPA_4',
        testActual,
        agudezaEstado: {
          logmarActual: estado.logmarActual,
          letraActual: estado.letraActual,
          mejorLogmar: estado.mejorLogmar,
          ultimoLogmarCorrecto: estado.ultimoLogmarCorrecto,
          confirmaciones: estado.confirmaciones
        }
      }
    };
  }

  console.log('🔧 [GENERAR_PASOS_ETAPA4] Generando pasos normales (continuación agudeza_alcanzada):', {
    estadoOjo: estadoExamen.agudezaEstado.ojo,
    ojoTest: testActual.ojo,
    logmarActual: estadoExamen.agudezaEstado.logmarActual,
    letraActual: estadoExamen.agudezaEstado.letraActual
  });

  const campoResultado = mapearTipoTestAResultado(testActual.tipo);
  const resultadoConfirmado = campoResultado
    ? estadoExamen.secuenciaExamen.resultados[ojo][campoResultado] !== null
    : false;

  if (resultadoConfirmado) {
    const siguienteTest = avanzarTest();
    if (siguienteTest) {
      return generarPasos();
    }
    return {
      ok: true,
      pasos: [
        {
          tipo: 'hablar',
          orden: 1,
          mensaje: 'Perfecto, hemos completado el examen visual.'
        }
      ]
    };
  }

  const pasos = [
    {
      tipo: 'tv',
      orden: 1,
      letra: estado.letraActual,
      logmar: estado.logmarActual
    },
    {
      tipo: 'hablar',
      orden: 2,
      mensaje: 'Mirá la pantalla. Decime qué letra ves.'
    }
  ];

  return {
    ok: true,
    pasos,
    contexto: {
      etapa: 'ETAPA_4',
      testActual,
      agudezaEstado: {
        logmarActual: estado.logmarActual,
        letraActual: estado.letraActual,
        mejorLogmar: estado.mejorLogmar,
        ultimoLogmarCorrecto: estado.ultimoLogmarCorrecto,
        confirmaciones: estado.confirmaciones
      }
    }
  };
}

/**
 * Genera pasos para ETAPA_3 (preparación del foróptero y definición de secuencia)
 */
function generarPasosEtapa3() {
  // Verificar si ya se generaron los pasos de ETAPA_3
  // Si ya se generaron, no volver a generarlos (evitar loop)
  if (estadoExamen.subEtapa === 'FOROPTERO_CONFIGURADO') {
    // Ya se configuró el foróptero, pasar a la etapa que corresponda al test actual
    const etapaSiguiente = estadoExamen.secuenciaExamen.testActual
      ? mapearTipoTestAEtapa(estadoExamen.secuenciaExamen.testActual.tipo)
      : 'ETAPA_4';
    estadoExamen.etapa = etapaSiguiente;
    estadoExamen.ojoActual = estadoExamen.secuenciaExamen.testActual?.ojo || 'R';
    
    // Retornar pasos vacíos para que el agente espere respuesta
    // (ETAPA_4 se implementará en Fase 3)
    return {
      ok: true,
      pasos: [],
      contexto: {
        etapa: estadoExamen.etapa,
        testActual: estadoExamen.secuenciaExamen.testActual
      }
    };
  }
  
  // 1. Generar secuencia del examen según modo
  const secuencia = estadoExamen.modo === 'normal'
    ? generarSecuenciaExamen()
    : generarSecuenciaPrueba(estadoExamen.modo);
  
  // 2. Guardar secuencia en el estado
  estadoExamen.secuenciaExamen.testsActivos = secuencia;
  estadoExamen.secuenciaExamen.indiceActual = 0;
  estadoExamen.secuenciaExamen.testActual = secuencia[0] || null;
  const primerTest = secuencia[0];
  const primerEsGruesoR =
    primerTest?.tipo === 'esferico_grueso' && primerTest?.ojo === 'R';

  console.log('✅ Secuencia del examen generada:');
  console.log('  Total de tests:', secuencia.length);
  console.log('  Tests activos:', secuencia.map(t => `${t.tipo}(${t.ojo})`).join(', '));
  console.log('  Test actual:', estadoExamen.secuenciaExamen.testActual);
  
  // 3. Usar valores recalculados para configurar el foróptero
  const valoresR = estadoExamen.valoresRecalculados.R;
  const valoresL = estadoExamen.valoresRecalculados.L;
  
  // Configuración inicial:
  // - Ojo derecho (R): valores recalculados, oclusión: "open"
  // - Ojo izquierdo (L): oclusión: "close"
  
  // 4. Marcar que se generaron los pasos (para evitar regenerarlos)
  estadoExamen.subEtapa = 'FOROPTERO_CONFIGURADO';
  
  // 5. Establecer ojo actual según el primer test
  estadoExamen.ojoActual = estadoExamen.secuenciaExamen.testActual?.ojo || 'R';
  
  // 6. Pasar a la etapa correspondiente al primer test
  const etapaSiguiente = estadoExamen.secuenciaExamen.testActual
    ? mapearTipoTestAEtapa(estadoExamen.secuenciaExamen.testActual.tipo)
    : 'ETAPA_4';
  estadoExamen.etapa = etapaSiguiente;

  const pasosEt3 = [
    {
      tipo: 'foroptero',
      orden: 1,
      foroptero: {
        R: {
          esfera: valoresR.esfera,
          cilindro: valoresR.cilindro,
          angulo: valoresR.angulo,
          occlusion: 'open'
        },
        L: {
          occlusion: 'close'
        }
      }
    },
    {
      tipo: 'esperar',
      orden: 2,
      esperarSegundos: 2
    }
  ];

  if (primerEsGruesoR) {
    pasosEt3.push(
      { tipo: 'esperar_foroptero', orden: 3 },
      {
        tipo: 'tv',
        orden: 4,
        letra: 'H',
        logmar: LOGMAR_ARRANQUE_LENTES
      },
      {
        tipo: 'hablar',
        orden: 5,
        mensaje: MSG_PRE_GRUESO_OD
      }
    );
    estadoExamen.preGruesoVisual = {
      activa: true,
      ojo: 'R',
      logmarEnPantalla: LOGMAR_ARRANQUE_LENTES,
      faseDialogo: 'inicial_od'
    };
  } else {
    pasosEt3.push({
      tipo: 'hablar',
      orden: 3,
      mensaje:
        'Vamos a empezar con el ojo derecho, esperemos a que se termine de mover los lentes.'
    });
  }

  return {
    ok: true,
    pasos: pasosEt3,
    contexto: {
      etapa: estadoExamen.etapa,
      testActual: estadoExamen.secuenciaExamen.testActual,
      totalTests: secuencia.length,
      indiceActual: 0,
      ...(primerEsGruesoR
        ? {
            ajusteLogmarPreGrueso: true,
            logmarPreGrueso: LOGMAR_ARRANQUE_LENTES
          }
        : {})
    }
  };
}

/**
 * Ejecuta pasos automáticamente (foróptero, TV, esperar)
 * Solo ejecuta pasos que no son de tipo "hablar"
 * @param {Array} pasos - Array de pasos a ejecutar
 * @returns {Promise<object>} - Resultado de la ejecución
 */
async function ejecutarPasosAutomaticamente(pasos) {
  if (!pasos || pasos.length === 0) {
    return { ok: true, ejecutados: [] };
  }
  
  const pasosAEjecutar = pasos.filter(p => 
    p.tipo === 'foroptero' || p.tipo === 'tv' || p.tipo === 'esperar' || p.tipo === 'esperar_foroptero'
  );
  
  if (pasosAEjecutar.length === 0) {
    return { ok: true, ejecutados: [] };
  }
  
  const ejecutados = [];
  const errores = [];
  
  console.log(`🔧 Ejecutando ${pasosAEjecutar.length} pasos automáticamente...`);
  
  for (const paso of pasosAEjecutar) {
    try {
      if (paso.tipo === 'foroptero') {
        if (!ejecutarComandoForopteroInterno) {
          console.warn('⚠️ ejecutarComandoForopteroInterno no inicializado');
          continue;
        }
        const resultado = await ejecutarComandoForopteroInterno(paso.foroptero);
        ejecutados.push({ tipo: 'foroptero', resultado });
        console.log('✅ Comando foróptero ejecutado:', resultado);
        registroExamenAppendEvento('Foroptero-TV', registroDescribirComandoForoptero(paso.foroptero));
        
        // Esperar un momento después de ejecutar foróptero (para que el dispositivo procese)
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } else if (paso.tipo === 'tv') {
        // Antes de mostrar TV, verificar que el foróptero esté ready
        if (obtenerEstadoForoptero) {
          const estadoForoptero = obtenerEstadoForoptero();
          if (estadoForoptero.status !== 'ready') {
            console.log('⏳ Foróptero no está ready, esperando...');
            await esperarForopteroReady(10000, 200);
          }
        }
        
        if (!ejecutarComandoTVInterno) {
          console.warn('⚠️ ejecutarComandoTVInterno no inicializado');
          continue;
        }
        const resultado = await ejecutarComandoTVInterno({
          letra: paso.letra,
          logmar: paso.logmar
        });
        ejecutados.push({ tipo: 'tv', resultado });
        console.log('✅ Comando TV ejecutado:', resultado);
        registroExamenAppendEvento(
          'Foroptero-TV',
          `TV: letra ${paso.letra ?? '—'} @ logMAR ${paso.logmar ?? '—'}`
        );
        
        // Esperar un momento después de ejecutar TV
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } else if (paso.tipo === 'esperar') {
        const segundos = paso.esperarSegundos || 0;
        console.log(`⏳ Esperando ${segundos} segundos...`);
        await new Promise(resolve => setTimeout(resolve, segundos * 1000));
        ejecutados.push({ tipo: 'esperar', segundos });
      } else if (paso.tipo === 'esperar_foroptero') {
        // Esperar a que el foróptero esté "ready"
        console.log('⏳ Esperando a que el foróptero esté ready...');
        const resultado = await esperarForopteroReady(10000, 200);
        ejecutados.push({ tipo: 'esperar_foroptero', resultado });
        console.log('✅ Estado del foróptero:', resultado);
      }
    } catch (error) {
      console.error(`❌ Error ejecutando paso ${paso.tipo}:`, error);
      errores.push({ tipo: paso.tipo, error: error.message });
      // Continuar con el siguiente paso aunque haya error
    }
  }
  
  return {
    ok: errores.length === 0,
    ejecutados,
    errores: errores.length > 0 ? errores : undefined
  };
}

/**
 * Ajuste logMAR antes del primer esferico_grueso (plan etapa 2): interpretacionAgudeza + TV H.
 */
async function procesarRespuestaPreGruesoVisual(respuestaPaciente, interpretacionAgudeza) {
  const pg = estadoExamen.preGruesoVisual;
  if (!pg?.activa) {
    return { ok: false, error: 'Estado interno: preGruesoVisual inactivo' };
  }
  const ojo = pg.ojo;
  const resultado = interpretacionAgudeza?.resultado;

  if (resultado === 'correcta') {
    estadoExamen.agudezaVisual[ojo] = {
      logmar: pg.logmarEnPantalla,
      letra: 'H',
      confirmado: true
    };
    estadoExamen.secuenciaExamen.resultados[ojo].agudezaInicial = pg.logmarEnPantalla;
    estadoExamen.preGruesoVisual = null;
    estadoExamen.esperaListoCambioOjo = null;

    const pasos = generarPasosEtapa5();
    await ejecutarPasosAutomaticamente(pasos.pasos || []);
    const pasosParaAgente = (pasos.pasos || []).filter((p) => p.tipo === 'hablar');
    return {
      ok: true,
      pasos: pasosParaAgente,
      contexto:
        pasos.contexto || {
          etapa: estadoExamen.etapa,
          testActual: estadoExamen.secuenciaExamen.testActual
        }
    };
  }

  const lmActual = pg.logmarEnPantalla;
  const siguiente = subirLogMAR(lmActual);

  if (siguiente === lmActual) {
    console.warn('[preGruesoVisual] Saturación logMAR', {
      ojo,
      logmar: lmActual,
      respuestaPaciente,
      resultado
    });
    estadoExamen.agudezaVisual[ojo] = {
      logmar: lmActual,
      letra: 'H',
      confirmado: true
    };
    estadoExamen.secuenciaExamen.resultados[ojo].agudezaInicial = lmActual;
    estadoExamen.preGruesoVisual = null;
    estadoExamen.esperaListoCambioOjo = null;

    const pasos = generarPasosEtapa5();
    await ejecutarPasosAutomaticamente(pasos.pasos || []);
    let pasosParaAgente = (pasos.pasos || []).filter((p) => p.tipo === 'hablar');
    if (pasosParaAgente.length > 0) {
      pasosParaAgente = [
        { tipo: 'hablar', orden: 1, mensaje: MSG_LOGMAR_MAX_PRE_GRUESO },
        ...pasosParaAgente.map((p, i) => ({ ...p, orden: i + 2 }))
      ];
    } else {
      pasosParaAgente = [{ tipo: 'hablar', orden: 1, mensaje: MSG_LOGMAR_MAX_PRE_GRUESO }];
    }
    return {
      ok: true,
      pasos: pasosParaAgente,
      contexto:
        pasos.contexto || {
          etapa: estadoExamen.etapa,
          testActual: estadoExamen.secuenciaExamen.testActual
        }
    };
  }

  pg.logmarEnPantalla = siguiente;
  pg.faseDialogo = 'repregunta_ajuste';

  const pasosIter = [
    { tipo: 'tv', orden: 1, letra: 'H', logmar: siguiente },
    { tipo: 'hablar', orden: 2, mensaje: MSG_REPREGUNTA_AJUSTE }
  ];
  await ejecutarPasosAutomaticamente(pasosIter);
  return {
    ok: true,
    pasos: [{ tipo: 'hablar', orden: 1, mensaje: MSG_REPREGUNTA_AJUSTE }],
    contexto: {
      etapa: estadoExamen.etapa,
      testActual: estadoExamen.secuenciaExamen.testActual,
      ajusteLogmarPreGrueso: true,
      logmarPreGrueso: siguiente
    }
  };
}

/** Tras una comparación de lentes: el agente repite este texto literal (única versión). */
const MSG_POST_COMPARACION_LENTES = 'Sigamos con este.';
const POST_COMPARACION_ESPERA_SEG = 3;

function lensValorCerca(a, b) {
  if (a == null || b == null) return a === b;
  return Math.abs(Number(a) - Number(b)) < 0.009;
}

/** §4.4 P2: el siguiente valor a mostrar es el mismo parámetro que ya está en cara (sin movimiento útil). */
function comparacionParametroEsNoOp(tipoTest, valorEnCara, valorSiguiente) {
  if (valorSiguiente == null || valorEnCara == null) return false;
  if (tipoTest === 'cilindrico_angulo') {
    return Math.abs(Number(valorSiguiente) - Number(valorEnCara)) < 0.51;
  }
  return lensValorCerca(valorEnCara, valorSiguiente);
}

/**
 * §4.4: pausa 3s + Sigamos + deferred solo si aplica (p. ej. hubo reanclaje, anterior/igual con cambio; no en P1 actual+cambio ni P2 no-op).
 */
function necesitaRitualSigamosPostComparacionLentes({
  pasosReanchorLen,
  preferencia,
  noOpSiguiente
}) {
  if (noOpSiguiente) return false;
  if (preferencia === 'actual') return false;
  return pasosReanchorLen > 0 || preferencia === 'anterior' || preferencia === 'igual';
}

/** P3–P4: mismo ojo, transiciones que llevan ritual como entre comparativas intra-test. P5: distinto ojo → false. */
function debeProgramarRitualEntreTestsLentes(tipoAnterior, ojoAnterior, siguienteTest) {
  if (!siguienteTest || siguienteTest.ojo !== ojoAnterior) return false;
  const t2 = siguienteTest.tipo;
  const pairs = [
    ['esferico_grueso', 'esferico_fino'],
    ['esferico_fino', 'cilindrico'],
    ['cilindrico', 'cilindrico_angulo']
  ];
  return pairs.some(([a, b]) => tipoAnterior === a && t2 === b);
}

/**
 * @param {string} tipoAnterior — test recién confirmado
 * @param {number} valorFinal — valor confirmado del test anterior (esfera o cilindro según tipo)
 */
function construirRitualEntreTestsLentes(tipoAnterior, ojo, valorFinal) {
  if (tipoAnterior === 'esferico_grueso') {
    return { ojo, tipoSoloForoptero: 'esferico_fino', valorParam: valorFinal };
  }
  if (tipoAnterior === 'esferico_fino') {
    return { ojo, tipoSoloForoptero: 'esferico_fino', valorParam: valorFinal };
  }
  if (tipoAnterior === 'cilindrico') {
    return { ojo, tipoSoloForoptero: 'cilindrico', valorParam: valorFinal };
  }
  return null;
}

/**
 * Solo foróptero + esperar_foroptero (sin TV). ETAPA_5 — reanclaje al valor elegido.
 */
function generarPasosSoloForopteroComparacion(ojo, tipoTest, valorParametro) {
  const otro = ojo === 'R' ? 'L' : 'R';
  let configForoptero;
  if (tipoTest === 'esferico_grueso' || tipoTest === 'esferico_fino') {
    configForoptero = {
      [ojo]: {
        esfera: valorParametro,
        cilindro: estadoExamen.valoresRecalculados[ojo].cilindro,
        angulo: estadoExamen.valoresRecalculados[ojo].angulo,
        occlusion: 'open'
      },
      [otro]: { occlusion: 'close' }
    };
  } else if (tipoTest === 'cilindrico') {
    const esferaFinal =
      estadoExamen.secuenciaExamen.resultados[ojo].esfericoFino ||
      estadoExamen.secuenciaExamen.resultados[ojo].esfericoGrueso ||
      estadoExamen.valoresRecalculados[ojo].esfera;
    configForoptero = {
      [ojo]: {
        esfera: esferaFinal,
        cilindro: valorParametro,
        angulo: estadoExamen.valoresRecalculados[ojo].angulo,
        occlusion: 'open'
      },
      [otro]: { occlusion: 'close' }
    };
  } else if (tipoTest === 'cilindrico_angulo') {
    const esferaFinal =
      estadoExamen.secuenciaExamen.resultados[ojo].esfericoFino ||
      estadoExamen.secuenciaExamen.resultados[ojo].esfericoGrueso ||
      estadoExamen.valoresRecalculados[ojo].esfera;
    const cilindroFinal =
      estadoExamen.secuenciaExamen.resultados[ojo].cilindrico ||
      estadoExamen.valoresRecalculados[ojo].cilindro;
    configForoptero = {
      [ojo]: {
        esfera: esferaFinal,
        cilindro: cilindroFinal,
        angulo: valorParametro,
        occlusion: 'open'
      },
      [otro]: { occlusion: 'close' }
    };
  } else {
    return [];
  }
  return [
    { tipo: 'foroptero', orden: 1, foroptero: configForoptero },
    { tipo: 'esperar_foroptero', orden: 2 }
  ];
}

/**
 * Tras "Sigamos con este.", la siguiente llamada sin respuesta ejecuta lentes + pregunta pendientes.
 */
async function ejecutarDeferredPostComparacionSiHay() {
  const def = estadoExamen.deferredPostComparacion;
  if (!def) return null;
  estadoExamen.deferredPostComparacion = null;

  if (def.kind === 'ETAPA_5_MOSTRAR_SIGUIENTE') {
    await ejecutarPasosAutomaticamente(def.pasosMostrar);
    const pasos = generarPasosEtapa5();
    if (!pasos.ok) return pasos;
    await ejecutarPasosAutomaticamente(pasos.pasos || []);
    const pasosParaAgente = (pasos.pasos || []).filter((p) => p.tipo === 'hablar');
    return {
      ok: true,
      pasos: pasosParaAgente,
      contexto: {
        ...(pasos.contexto || {}),
        etapa: estadoExamen.etapa,
        testActual: estadoExamen.secuenciaExamen.testActual
      }
    };
  }

  if (def.kind === 'ETAPA_5_RITUAL_INTER_TEST_COMPLETAR') {
    const pasos = generarPasosEtapa5();
    if (!pasos.ok) return pasos;
    await ejecutarPasosAutomaticamente(pasos.pasos || []);
    const pasosParaAgente = (pasos.pasos || []).filter((p) => p.tipo === 'hablar');
    return {
      ok: true,
      pasos: pasosParaAgente,
      contexto: {
        ...(pasos.contexto || {}),
        etapa: estadoExamen.etapa,
        testActual: estadoExamen.secuenciaExamen.testActual
      }
    };
  }

  if (def.kind === 'ETAPA_6_GENERAR') {
    const pasos = generarPasosEtapa6();
    if (!pasos.ok) return pasos;
    await ejecutarPasosAutomaticamente(pasos.pasos || []);
    const pasosParaAgente = (pasos.pasos || []).filter((p) => p.tipo === 'hablar');
    return {
      ok: true,
      pasos: pasosParaAgente,
      contexto: {
        ...(pasos.contexto || {}),
        etapa: 'ETAPA_6',
        testActual: estadoExamen.secuenciaExamen.testActual,
        binocularEstado: contextoBinocularResumido(estadoExamen.binocularEstado)
      }
    };
  }

  return null;
}

/**
 * Obtiene instrucciones (pasos) para el agente
 * Si hay respuestaPaciente, la procesa primero
 * Ejecuta automáticamente los comandos de dispositivos (foróptero, TV)
 * y solo retorna pasos de tipo "hablar" al agente
 * @param {string|null} respuestaPaciente - Respuesta del paciente
 * @param {object|null} interpretacionAgudeza - Interpretación estructurada del agente (ETAPA_4 y pre-grueso visual)
 */
export async function obtenerInstrucciones(respuestaPaciente = null, interpretacionAgudeza = null, interpretacionComparacion = null) {
  if (respuestaPaciente != null && String(respuestaPaciente).trim() !== '') {
    registroExamenRegistrarPacienteEInterpretacion(
      String(respuestaPaciente).trim(),
      interpretacionAgudeza,
      interpretacionComparacion
    );
  }

  const sinRespuestaPaciente =
    respuestaPaciente == null ||
    (typeof respuestaPaciente === 'string' && respuestaPaciente.trim() === '');

  if (sinRespuestaPaciente && estadoExamen.deferredPostComparacion) {
    const salidaDeferred = await ejecutarDeferredPostComparacionSiHay();
    if (salidaDeferred) return salidaDeferred;
  }

  // Si hay respuesta del paciente, procesarla primero
  if (respuestaPaciente) {
    if (estadoExamen.preGruesoVisual?.activa) {
      if (!interpretacionAgudeza) {
        return {
          ok: false,
          error:
            'Se requiere interpretacionAgudeza (calidad visual / ¿ves bien?) antes del esférico grueso.'
        };
      }
      const preRes = await procesarRespuestaPreGruesoVisual(
        respuestaPaciente,
        interpretacionAgudeza
      );
      if (!preRes.ok) {
        return preRes;
      }
      return preRes;
    }

    // Si estamos en ETAPA_5 y hay interpretación de comparación, procesarla
    if (estadoExamen.etapa === 'ETAPA_5' && interpretacionComparacion) {
      const resultado = procesarRespuestaComparacionLentes(respuestaPaciente, interpretacionComparacion);
      
      if (!resultado.ok) {
        return {
          ok: false,
          error: resultado.error || 'Error procesando respuesta de comparación'
        };
      }
      
      // Si se confirmó el resultado, generar pasos del siguiente test
      if (resultado.resultadoConfirmado) {
        const ritualEntre = estadoExamen.ritualInterTestsPendiente;
        if (ritualEntre) {
          estadoExamen.ritualInterTestsPendiente = null;
          const pasosSolo = generarPasosSoloForopteroComparacion(
            ritualEntre.ojo,
            ritualEntre.tipoSoloForoptero,
            ritualEntre.valorParam
          );
          await ejecutarPasosAutomaticamente(pasosSolo);
          await ejecutarPasosAutomaticamente([
            { tipo: 'esperar', esperarSegundos: POST_COMPARACION_ESPERA_SEG, orden: 1 }
          ]);
          estadoExamen.deferredPostComparacion = { kind: 'ETAPA_5_RITUAL_INTER_TEST_COMPLETAR' };
          return {
            ok: true,
            pasos: [{ tipo: 'hablar', orden: 1, mensaje: MSG_POST_COMPARACION_LENTES }],
            contexto: {
              etapa: estadoExamen.etapa,
              testActual: estadoExamen.secuenciaExamen.testActual,
              postComparacionContinuar: true
            }
          };
        }

        const pasos = generarPasos();

        await ejecutarPasosAutomaticamente(pasos.pasos || []);

        const pasosParaAgente = (pasos.pasos || []).filter((p) => p.tipo === 'hablar');

        return {
          ok: true,
          pasos: pasosParaAgente,
          contexto: pasos.contexto || {
            etapa: estadoExamen.etapa,
            testActual: estadoExamen.secuenciaExamen.testActual
          }
        };
      }
      
      // Si necesita mostrar otro lente, generar pasos
      if (resultado.necesitaMostrarLente) {
        const estado = estadoExamen.comparacionActual;
        const testActual = estadoExamen.secuenciaExamen.testActual;

        const caraAntesUpdate = estado.valorActual;
        estado.valorAnterior = estado.valorActual;
        estado.valorActual = resultado.valorAMostrar;
        estado.faseComparacion = 'mostrando_alternativo';

        let pasosMostrar;
        if (testActual?.tipo === 'cilindrico') {
          pasosMostrar = generarPasosMostrarLenteCilindrico(
            estado.ojo,
            resultado.valorAMostrar,
            estado.letraActual,
            estado.logmarActual
          );
        } else if (testActual?.tipo === 'cilindrico_angulo') {
          pasosMostrar = generarPasosMostrarLenteCilindricoAngulo(
            estado.ojo,
            resultado.valorAMostrar,
            estado.letraActual,
            estado.logmarActual
          );
        } else {
          pasosMostrar = generarPasosMostrarLente(
            estado.ojo,
            resultado.valorAMostrar,
            estado.letraActual,
            estado.logmarActual
          );
        }

        const eleg = resultado.valorElegidoReanclaje;
        const pasosReanchor = [];
        if (eleg != null && !lensValorCerca(eleg, caraAntesUpdate)) {
          pasosReanchor.push(
            ...generarPasosSoloForopteroComparacion(estado.ojo, testActual.tipo, eleg)
          );
        }

        await ejecutarPasosAutomaticamente(pasosReanchor);

        const pref = resultado.preferenciaAplicada ?? 'actual';
        const noOpSiguiente = comparacionParametroEsNoOp(
          testActual.tipo,
          caraAntesUpdate,
          resultado.valorAMostrar
        );
        const necesitaRitualPost = necesitaRitualSigamosPostComparacionLentes({
          pasosReanchorLen: pasosReanchor.length,
          preferencia: pref,
          noOpSiguiente
        });

        if (necesitaRitualPost) {
          await ejecutarPasosAutomaticamente([
            { tipo: 'esperar', esperarSegundos: POST_COMPARACION_ESPERA_SEG, orden: 1 }
          ]);

          estadoExamen.deferredPostComparacion = {
            kind: 'ETAPA_5_MOSTRAR_SIGUIENTE',
            pasosMostrar
          };

          return {
            ok: true,
            pasos: [{ tipo: 'hablar', orden: 1, mensaje: MSG_POST_COMPARACION_LENTES }],
            contexto: {
              etapa: estadoExamen.etapa,
              testActual,
              postComparacionContinuar: true
            }
          };
        }

        if (!noOpSiguiente) {
          await ejecutarPasosAutomaticamente(pasosMostrar);
        }

        const pasosSig = generarPasosEtapa5();
        if (!pasosSig.ok) {
          return { ok: false, error: pasosSig.error || 'Error generando pasos ETAPA_5' };
        }
        await ejecutarPasosAutomaticamente(pasosSig.pasos || []);
        const pasosParaAgenteSig = (pasosSig.pasos || []).filter((p) => p.tipo === 'hablar');
        return {
          ok: true,
          pasos: pasosParaAgenteSig,
          contexto: {
            ...(pasosSig.contexto || {}),
            etapa: estadoExamen.etapa,
            testActual
          }
        };
      }
    }
    
    // Si estamos en ETAPA_6, procesar respuesta binocular
    // Nota: en la transición inicial ("avisame cuando estés listo") no requiere interpretacionComparacion.
    if (estadoExamen.etapa === 'ETAPA_6') {
      const resultado = procesarRespuestaBinocular(respuestaPaciente, interpretacionComparacion);
      
      if (!resultado.ok) {
        return {
          ok: false,
          error: resultado.error || 'Error procesando respuesta binocular'
        };
      }
      
      // Si se confirmó el resultado, generar pasos del siguiente test (FINALIZADO)
      if (resultado.resultadoConfirmado) {
        const pasos = generarPasos();
        
        await ejecutarPasosAutomaticamente(pasos.pasos || []);
        
        const pasosParaAgente = (pasos.pasos || []).filter(p => p.tipo === 'hablar');
        
        return {
          ok: true,
          pasos: pasosParaAgente,
          contexto: pasos.contexto || {
            etapa: estadoExamen.etapa,
            testActual: estadoExamen.secuenciaExamen.testActual
          }
        };
      }

      // Si devolvió pasos directos (ej: repregunta de transición), retornarlos
      if (resultado.pasos) {
        await ejecutarPasosAutomaticamente(resultado.pasos || []);

        const pasosParaAgente = (resultado.pasos || []).filter(p => p.tipo === 'hablar');

        return {
          ok: true,
          pasos: pasosParaAgente,
          contexto: {
            etapa: estadoExamen.etapa,
            testActual: estadoExamen.secuenciaExamen.testActual,
            binocularEstado: contextoBinocularResumido(estadoExamen.binocularEstado)
          }
        };
      }
      
      // Si necesita mostrar otro lente, generar pasos
      if (resultado.necesitaMostrarLente) {
        if (resultado.postComparacionTrasEsfera) {
          if (resultado.reanclajeRxBinocularIntermedio) {
            const pasosReanchor = [
              {
                tipo: 'foroptero',
                orden: 1,
                foroptero: foropteroDesdeRx(copiarRxPar(estadoExamen.binocularEstado.rxActiva))
              },
              { tipo: 'esperar_foroptero', orden: 2 }
            ];
            await ejecutarPasosAutomaticamente(pasosReanchor);
            await ejecutarPasosAutomaticamente([
              { tipo: 'esperar', esperarSegundos: POST_COMPARACION_ESPERA_SEG, orden: 1 }
            ]);
            estadoExamen.deferredPostComparacion = { kind: 'ETAPA_6_GENERAR' };
            return {
              ok: true,
              pasos: [{ tipo: 'hablar', orden: 1, mensaje: MSG_POST_COMPARACION_LENTES }],
              contexto: {
                etapa: 'ETAPA_6',
                testActual: estadoExamen.secuenciaExamen.testActual,
                binocularEstado: contextoBinocularResumido(estadoExamen.binocularEstado),
                postComparacionContinuar: true
              }
            };
          }

          const pasosCil = generarPasosEtapa6();
          if (!pasosCil.ok) {
            return { ok: false, error: pasosCil.error || 'Error generando pasos ETAPA_6' };
          }
          await ejecutarPasosAutomaticamente(pasosCil.pasos || []);
          const pasosParaAgenteCil = (pasosCil.pasos || []).filter((p) => p.tipo === 'hablar');
          return {
            ok: true,
            pasos: pasosParaAgenteCil,
            contexto: {
              ...(pasosCil.contexto || {}),
              etapa: 'ETAPA_6',
              testActual: estadoExamen.secuenciaExamen.testActual,
              binocularEstado: contextoBinocularResumido(estadoExamen.binocularEstado)
            }
          };
        }

        const pasos = generarPasosEtapa6();

        await ejecutarPasosAutomaticamente(pasos.pasos || []);

        const pasosParaAgente = (pasos.pasos || []).filter(p => p.tipo === 'hablar');

        return {
          ok: true,
          pasos: pasosParaAgente,
          contexto: pasos.contexto || {
            etapa: estadoExamen.etapa,
            testActual: estadoExamen.secuenciaExamen.testActual
          }
        };
      }
    }
    
    // Si estamos en ETAPA_4 y hay interpretación, usar procesarRespuestaAgudeza directamente
    if (estadoExamen.etapa === 'ETAPA_4' && interpretacionAgudeza) {
      const resultado = procesarRespuestaAgudeza(respuestaPaciente, interpretacionAgudeza);
      
      if (!resultado.ok) {
        return {
          ok: false,
          error: resultado.error || 'Error procesando respuesta de agudeza'
        };
      }
      
      // Si se confirmó el resultado, generar pasos del siguiente test
      if (resultado.resultadoConfirmado) {
        // Generar pasos del siguiente test
        const pasos = generarPasos();
        
        // Ejecutar pasos automáticamente
        await ejecutarPasosAutomaticamente(pasos.pasos || []);
        
        // Filtrar: solo retornar pasos de tipo "hablar"
        const pasosParaAgente = (pasos.pasos || []).filter(p => p.tipo === 'hablar');
        
        return {
          ok: true,
          pasos: pasosParaAgente,
          contexto: pasos.contexto || {
            etapa: estadoExamen.etapa,
            testActual: estadoExamen.secuenciaExamen.testActual
          }
        };
      }
      
      // Si necesita nueva letra, generar pasos
      if (resultado.necesitaNuevaLetra) {
        const pasos = generarPasosEtapa4();
        
        // Ejecutar pasos automáticamente
        await ejecutarPasosAutomaticamente(pasos.pasos || []);
        
        // Filtrar: solo retornar pasos de tipo "hablar"
        const pasosParaAgente = (pasos.pasos || []).filter(p => p.tipo === 'hablar');
        
        return {
          ok: true,
          pasos: pasosParaAgente,
          contexto: pasos.contexto || {
            etapa: estadoExamen.etapa,
            testActual: estadoExamen.secuenciaExamen.testActual
          }
        };
      }
    }
    
    // Procesamiento normal para otras etapas
    const resultado = procesarRespuesta(respuestaPaciente);
    
    if (!resultado.ok) {
      return {
        ok: false,
        error: resultado.error || 'Error procesando respuesta'
      };
    }
    
    // Si el procesamiento generó pasos (ej: error de validación), retornarlos
    if (resultado.pasos) {
      // Ejecutar pasos automáticamente (aunque en este caso solo deberían ser "hablar")
      await ejecutarPasosAutomaticamente(resultado.pasos);
      
      // Filtrar: solo retornar pasos de tipo "hablar"
      const pasosParaAgente = resultado.pasos.filter(p => p.tipo === 'hablar');
      
      return {
        ok: true,
        pasos: pasosParaAgente,
        contexto: {
          etapa: estadoExamen.etapa,
          subEtapa: estadoExamen.subEtapa
        }
      };
    }
  }
  
  // Generar pasos según la etapa actual
  const pasos = generarPasos();
  
  if (!pasos.ok) {
    return pasos;
  }
  
  // Si la etapa generó pasos vacíos (como ETAPA_2 silenciosa),
  // generar pasos de la siguiente etapa automáticamente
  if (pasos.pasos && pasos.pasos.length === 0) {
    // La etapa cambió internamente, generar pasos de la nueva etapa
    const nuevosPasos = generarPasos();
    if (nuevosPasos.ok) {
      // Ejecutar pasos automáticamente antes de retornar
      await ejecutarPasosAutomaticamente(nuevosPasos.pasos || []);
      
      // Filtrar: solo retornar pasos de tipo "hablar" al agente
      const pasosParaAgente = (nuevosPasos.pasos || []).filter(p => p.tipo === 'hablar');
      
      return {
        ok: true,
        pasos: pasosParaAgente,
        contexto: nuevosPasos.contexto || {
          etapa: estadoExamen.etapa,
          subEtapa: estadoExamen.subEtapa
        }
      };
    }
  }
  
  // Ejecutar pasos automáticamente (foróptero, TV, esperar)
  await ejecutarPasosAutomaticamente(pasos.pasos || []);
  
  // Filtrar: solo retornar pasos de tipo "hablar" al agente
  const pasosParaAgente = (pasos.pasos || []).filter(p => p.tipo === 'hablar');
  
  return {
    ok: true,
    pasos: pasosParaAgente,
    contexto: pasos.contexto || {
      etapa: estadoExamen.etapa,
      subEtapa: estadoExamen.subEtapa
    }
  };
}

/**
 * Obtiene el estado actual del examen
 */
export function obtenerEstado() {
  return {
    ok: true,
    estado: {
      etapa: estadoExamen.etapa,
      ojoActual: estadoExamen.ojoActual,
      testActual: estadoExamen.secuenciaExamen.testActual,
      totalTests: estadoExamen.secuenciaExamen.testsActivos.length,
      indiceActual: estadoExamen.secuenciaExamen.indiceActual,
      progreso: calcularProgreso(),
      ultimaAccion: obtenerUltimaAccion()
    }
  };
}

/**
 * Calcula el progreso del examen (0-100%)
 */
function calcularProgreso() {
  // Placeholder - se implementará cuando todas las etapas estén listas
  const etapas = ['INICIO', 'ETAPA_1', 'ETAPA_2', 'ETAPA_3', 'ETAPA_4', 'ETAPA_5', 'FINALIZADO'];
  const etapaActual = etapas.indexOf(estadoExamen.etapa);
  return Math.round((etapaActual / (etapas.length - 1)) * 100);
}

/**
 * Obtiene descripción de la última acción
 */
function obtenerUltimaAccion() {
  switch (estadoExamen.etapa) {
    case 'INICIO':
      return 'Iniciando examen';
    case 'ETAPA_1':
      return 'Esperando valores del autorefractómetro';
    case 'ETAPA_2':
      return 'Calculando valores iniciales (silencioso)';
    case 'ETAPA_3':
      return 'Preparando examen visual - ajustando foróptero';
    case 'ETAPA_4':
      return 'Test de agudeza visual';
    case 'ETAPA_5':
      return 'Test de comparación de lentes';
    case 'ETAPA_6':
      return 'Test binocular';
    default:
      return `En etapa ${estadoExamen.etapa}`;
  }
}

/**
 * Mapea el tipo de test a su campo correspondiente en resultados
 */
function mapearTipoTestAResultado(tipo) {
  const mapa = {
    'esferico_grueso': 'esfericoGrueso',
    'esferico_fino': 'esfericoFino',
    'cilindrico': 'cilindrico',
    'cilindrico_angulo': 'cilindricoAngulo',
    'agudeza_alcanzada': 'agudezaAlcanzada'
  };
  return mapa[tipo] || null;
}

/**
 * Obtiene el estado de un test (pendiente, en_curso, completado)
 */
function obtenerEstadoTest(indice, tipo, ojo) {
  const indiceActual = estadoExamen.secuenciaExamen.indiceActual;
  
  // Manejo especial para binocular (resultado = { esfera, cilindro, angulo } por ojo)
  if (tipo === 'binocular') {
    const resultados = estadoExamen.secuenciaExamen.resultados;
    const resultadoR = resultados.R?.binocular;
    const resultadoL = resultados.L?.binocular;
    const binocCompleto = (b) =>
      b != null && typeof b === 'object' && b.esfera !== null && b.esfera !== undefined;
    
    if (binocCompleto(resultadoR) && binocCompleto(resultadoL)) {
      return 'completado';
    } else if (indice === indiceActual) {
      return 'en_curso';
    } else {
      return 'pendiente';
    }
  }
  
  // Lógica normal para otros tests
  const campoResultado = mapearTipoTestAResultado(tipo);
  const resultado = campoResultado ? estadoExamen.secuenciaExamen.resultados[ojo]?.[campoResultado] : null;
  
  if (resultado !== null && resultado !== undefined) {
    return 'completado';
  } else if (indice === indiceActual) {
    return 'en_curso';
  } else {
    return 'pendiente';
  }
}

/**
 * Obtiene el resultado de un test específico
 */
function obtenerResultadoTest(tipo, ojo) {
  // Manejo especial para binocular
  if (tipo === 'binocular') {
    const resultados = estadoExamen.secuenciaExamen.resultados;
    return {
      resultadoR: resultados.R?.binocular ?? null,
      resultadoL: resultados.L?.binocular ?? null
    };
  }
  
  // Lógica normal para otros tests
  const campoResultado = mapearTipoTestAResultado(tipo);
  if (!campoResultado) return null;
  
  return estadoExamen.secuenciaExamen.resultados[ojo]?.[campoResultado] ?? null;
}

/**
 * Espera a que el foróptero esté en estado "ready"
 * @param {number} timeoutMs - Tiempo máximo de espera en ms (default: 10000)
 * @param {number} intervaloMs - Intervalo de verificación en ms (default: 200)
 * @returns {Promise<object>} - { ok: boolean, status: string, tiempoEsperado: number }
 */
async function esperarForopteroReady(timeoutMs = 10000, intervaloMs = 200) {
  if (!obtenerEstadoForoptero) {
    console.warn('⚠️ obtenerEstadoForoptero no inicializado, continuando...');
    return { ok: true, status: 'unknown', tiempoEsperado: 0 };
  }
  
  const inicio = Date.now();
  const timeout = inicio + timeoutMs;
  
  while (Date.now() < timeout) {
    const estado = obtenerEstadoForoptero();
    
    if (estado.status === 'ready') {
      const tiempoEsperado = Date.now() - inicio;
      console.log(`✅ Foróptero ready después de ${tiempoEsperado}ms`);
      return { ok: true, status: 'ready', tiempoEsperado };
    }
    
    // Esperar antes de verificar de nuevo
    await new Promise(resolve => setTimeout(resolve, intervaloMs));
  }
  
  // Timeout alcanzado
  const tiempoEsperado = Date.now() - inicio;
  const estadoFinal = obtenerEstadoForoptero();
  console.warn(`⚠️ Timeout esperando foróptero (${tiempoEsperado}ms), estado actual: ${estadoFinal.status}, continuando...`);
  return { ok: false, status: estadoFinal.status || 'timeout', tiempoEsperado };
}

/**
 * Inicializa el estado de comparación de lentes para un test específico
 * @param {string} tipo - Tipo de test: 'esferico_grueso', 'esferico_fino', etc.
 * @param {string} ojo - Ojo a testear: 'R' | 'L'
 * @param {number} valorBase - Valor base del test (ej: +0.75)
 * @returns {object} - Resultado de la inicialización
 */
function iniciarComparacionLentes(tipo, ojo, valorBase) {
  // Validar tipo
  if (tipo !== 'esferico_grueso' && tipo !== 'esferico_fino' && tipo !== 'cilindrico' && tipo !== 'cilindrico_angulo') {
    return { ok: false, error: `Tipo de test ${tipo} no implementado aún` };
  }
  
  // Validar límites según tipo
  if (tipo === 'cilindrico') {
    // Cilindro típicamente -6.00 a 0 (solo valores negativos o cero)
    if (valorBase < -6.00 || valorBase > 0) {
      return { ok: false, error: `Valor base de cilindro ${valorBase} fuera de rango válido (-6.00 a 0)` };
    }
  } else if (tipo === 'cilindrico_angulo') {
    // Ángulo típicamente 0 a 180 grados
    if (valorBase < 0 || valorBase > 180) {
      return { ok: false, error: `Valor base de ángulo ${valorBase} fuera de rango válido (0 a 180 grados)` };
    }
  } else {
    // Esfera típicamente -6.00 a +6.00
    if (valorBase < -6.00 || valorBase > 6.00) {
      return { ok: false, error: `Valor base ${valorBase} fuera de rango válido (-6.00 a +6.00)` };
    }
  }
  
  // Calcular valores pre-calculados según tipo
  let saltoActual;
  if (tipo === 'esferico_grueso') {
    saltoActual = 0.50; // Para esférico grueso
  } else if (tipo === 'esferico_fino') {
    saltoActual = 0.25; // Para esférico fino (más preciso)
  } else if (tipo === 'cilindrico') {
    saltoActual = 0.50; // Para cilíndrico
  } else if (tipo === 'cilindrico_angulo') {
    saltoActual = 15; // Para cilíndrico ángulo (en grados)
  }
  
  let valorMas = valorBase + saltoActual;
  let valorMenos = valorBase - saltoActual;
  
  // Validar que los valores calculados no excedan límites según tipo
  if (tipo === 'cilindrico') {
    // Cilindro: -6.00 a 0 (solo negativos o cero)
    if (valorMas > 0) {
      valorMas = 0;
      saltoActual = valorMas - valorBase;
    }
    if (valorMenos < -6.00) {
      valorMenos = -6.00;
      saltoActual = valorBase - valorMenos;
    }
  } else if (tipo === 'cilindrico_angulo') {
    // Ángulo: 0 a 180 grados (circular - wraparound)
    if (valorMas > 180) {
      valorMas = valorMas - 180; // Wraparound: 195° → 15°
    }
    if (valorMenos < 0) {
      valorMenos = valorMenos + 180; // Wraparound: -15° → 165°
    }
  } else {
    // Esfera: -6.00 a +6.00
    if (valorMas > 6.00) {
      valorMas = 6.00;
      saltoActual = valorMas - valorBase;
    }
    if (valorMenos < -6.00) {
      valorMenos = -6.00;
      saltoActual = valorBase - valorMenos;
    }
  }
  
  // Obtener letra y logMAR actuales (del test de agudeza)
  const agudeza = estadoExamen.agudezaVisual[ojo];
  const letraActual = agudeza?.letra || 'H';
  const logmarActual = agudeza?.logmar ?? LOGMAR_ARRANQUE_LENTES;
  
  // Inicializar estado de comparación
  estadoExamen.comparacionActual = {
    tipo,
    ojo,
    valorBase,
    valorActual: valorBase, // Inicialmente el valor base
    valorAnterior: null,
    valorConfirmado: null,
    confirmaciones: 0,
    direccion: null,
    faseComparacion: 'iniciando',
    letraActual,
    logmarActual,
    saltoActual,
    valorMas,
    valorMenos,
    valoresProbados: {
      mas: false,
      menos: false,
      base: false
    }
  };
  
  console.log(`🔍 Iniciando comparación de lentes (${tipo}, ${ojo}):`, {
    valorBase,
    valorMas,
    valorMenos,
    saltoActual
  });
  
  return { ok: true, comparacionIniciada: true };
}

/**
 * Genera pasos para mostrar un lente específico en el foróptero
 * @param {string} ojo - Ojo a configurar: 'R' | 'L'
 * @param {number} valorEsfera - Valor de esfera a mostrar
 * @param {string} letra - Letra a mostrar en TV
 * @param {number} logmar - LogMAR de la letra
 * @returns {Array} - Array de pasos
 */
function generarPasosMostrarLente(ojo, valorEsfera, letra, logmar) {
  const pasos = [];
  
  // 1. Configurar foróptero con el nuevo valor
  const configForoptero = {
    [ojo]: {
      esfera: valorEsfera,
      // Mantener cilindro y ángulo del valor recalculado
      cilindro: estadoExamen.valoresRecalculados[ojo].cilindro,
      angulo: estadoExamen.valoresRecalculados[ojo].angulo,
      occlusion: 'open'
    },
    // Ojo opuesto cerrado
    [ojo === 'R' ? 'L' : 'R']: {
      occlusion: 'close'
    }
  };
  
  pasos.push({
    tipo: 'foroptero',
    orden: 1,
    foroptero: configForoptero
  });
  
  // 2. Esperar a que el foróptero esté ready
  pasos.push({
    tipo: 'esperar_foroptero',
    orden: 2
  });
  
  // 3. Mostrar letra en TV
  pasos.push({
    tipo: 'tv',
    orden: 3,
    letra,
    logmar
  });
  
  return pasos;
}

/**
 * Genera pasos para mostrar un lente con cilindro específico en el foróptero
 * @param {string} ojo - Ojo a configurar: 'R' | 'L'
 * @param {number} valorCilindro - Valor de cilindro a mostrar
 * @param {string} letra - Letra a mostrar en TV
 * @param {number} logmar - LogMAR de la letra
 * @returns {Array} - Array de pasos
 */
function generarPasosMostrarLenteCilindrico(ojo, valorCilindro, letra, logmar) {
  const pasos = [];
  
  // Obtener valores actuales del foróptero (usar resultados de tests anteriores si existen)
  const esferaFinal = estadoExamen.secuenciaExamen.resultados[ojo].esfericoFino 
    || estadoExamen.secuenciaExamen.resultados[ojo].esfericoGrueso 
    || estadoExamen.valoresRecalculados[ojo].esfera;
  
  // 1. Configurar foróptero con el nuevo valor de cilindro
  const configForoptero = {
    [ojo]: {
      esfera: esferaFinal,
      cilindro: valorCilindro,
      // Mantener ángulo del valor recalculado
      angulo: estadoExamen.valoresRecalculados[ojo].angulo,
      occlusion: 'open'
    },
    // Ojo opuesto cerrado
    [ojo === 'R' ? 'L' : 'R']: {
      occlusion: 'close'
    }
  };
  
  pasos.push({
    tipo: 'foroptero',
    orden: 1,
    foroptero: configForoptero
  });
  
  // 2. Esperar a que el foróptero esté ready
  pasos.push({
    tipo: 'esperar_foroptero',
    orden: 2
  });
  
  // 3. Mostrar letra en TV
  pasos.push({
    tipo: 'tv',
    orden: 3,
    letra,
    logmar
  });
  
  return pasos;
}

/**
 * Genera pasos para mostrar un lente con ángulo cilíndrico específico en el foróptero
 * @param {string} ojo - Ojo a configurar: 'R' | 'L'
 * @param {number} valorAngulo - Valor de ángulo a mostrar (0-180 grados)
 * @param {string} letra - Letra a mostrar en TV
 * @param {number} logmar - LogMAR de la letra
 * @returns {Array} - Array de pasos
 */
function generarPasosMostrarLenteCilindricoAngulo(ojo, valorAngulo, letra, logmar) {
  const pasos = [];
  
  // Obtener valores actuales del foróptero (usar resultados de tests anteriores si existen)
  const esferaFinal = estadoExamen.secuenciaExamen.resultados[ojo].esfericoFino 
    || estadoExamen.secuenciaExamen.resultados[ojo].esfericoGrueso 
    || estadoExamen.valoresRecalculados[ojo].esfera;
  
  // Usar el resultado del test de cilindro si existe, sino el valor recalculado
  const cilindroFinal = estadoExamen.secuenciaExamen.resultados[ojo].cilindrico 
    || estadoExamen.valoresRecalculados[ojo].cilindro;
  
  // 1. Configurar foróptero con el nuevo valor de ángulo
  const configForoptero = {
    [ojo]: {
      esfera: esferaFinal,
      cilindro: cilindroFinal,
      angulo: valorAngulo, // Actualizar ángulo
      occlusion: 'open'
    },
    // Ojo opuesto cerrado
    [ojo === 'R' ? 'L' : 'R']: {
      occlusion: 'close'
    }
  };
  
  pasos.push({
    tipo: 'foroptero',
    orden: 1,
    foroptero: configForoptero
  });
  
  // 2. Esperar a que el foróptero esté ready
  pasos.push({
    tipo: 'esperar_foroptero',
    orden: 2
  });
  
  // 3. Mostrar letra en TV
  pasos.push({
    tipo: 'tv',
    orden: 3,
    letra,
    logmar
  });
  
  return pasos;
}

/**
 * Genera pasos para ETAPA_5 (tests de lentes - esférico grueso, esférico fino, etc.)
 */
function generarPasosEtapa5() {
  const testActual = estadoExamen.secuenciaExamen.testActual;
  const mensajePreguntaComparacion = 'Ves mejor con este o con el anterior?';
  
  // Validar que estamos en test de lentes
  if (!testActual || (testActual.tipo !== 'esferico_grueso' && testActual.tipo !== 'esferico_fino' && testActual.tipo !== 'cilindrico' && testActual.tipo !== 'cilindrico_angulo')) {
    return {
      ok: false,
      error: `No estamos en test de lentes válido. Tipo actual: ${testActual?.tipo}`
    };
  }
  
  const ojo = testActual.ojo;
  const tipo = testActual.tipo;
  const comparacion = estadoExamen.comparacionActual;
  const adaptNecesaria = necesitaAdaptacionTrasAgudezaOtroOjo(testActual);
  const pg = estadoExamen.preGruesoVisual;

  if (!adaptNecesaria) {
    estadoExamen.esperaListoCambioOjo = null;
  }

  if (pg?.activa) {
    const msg =
      pg.faseDialogo === 'repregunta_ajuste'
        ? MSG_REPREGUNTA_AJUSTE
        : pg.faseDialogo === 'inicial_oi'
          ? MSG_PRE_GRUESO_OI
          : MSG_PRE_GRUESO_OD;
    return {
      ok: true,
      pasos: [
        {
          tipo: 'hablar',
          orden: 1,
          mensaje: msg
        }
      ],
      contexto: {
        etapa: 'ETAPA_5',
        testActual,
        ajusteLogmarPreGrueso: true,
        logmarPreGrueso: pg.logmarEnPantalla,
        adaptacionCambioOjo: adaptNecesaria
      }
    };
  }

  const idxActual = estadoExamen.secuenciaExamen.indiceActual;
  const debeEmitirBundleAdaptacion =
    adaptNecesaria &&
    !pg &&
    estadoExamen.adaptacionPreGruesoEmitidaParaIndice !== idxActual;

  if (debeEmitirBundleAdaptacion) {
    const vr = estadoExamen.valoresRecalculados[ojo];
    const otro = ojo === 'R' ? 'L' : 'R';
    estadoExamen.adaptacionPreGruesoEmitidaParaIndice = idxActual;
    estadoExamen.preGruesoVisual = {
      activa: true,
      ojo,
      logmarEnPantalla: LOGMAR_ARRANQUE_LENTES,
      faseDialogo: ojo === 'L' ? 'inicial_oi' : 'inicial_od'
    };
    const pasosAdaptacion = [
      {
        tipo: 'foroptero',
        orden: 1,
        foroptero: {
          [ojo]: {
            esfera: vr.esfera,
            cilindro: vr.cilindro,
            angulo: vr.angulo,
            occlusion: 'open'
          },
          [otro]: {
            occlusion: 'close'
          }
        }
      },
      { tipo: 'esperar_foroptero', orden: 2 },
      {
        tipo: 'tv',
        orden: 3,
        letra: 'H',
        logmar: LOGMAR_ARRANQUE_LENTES
      },
      {
        tipo: 'hablar',
        orden: 4,
        mensaje: ojo === 'L' ? MSG_PRE_GRUESO_OI : MSG_PRE_GRUESO_OD
      }
    ];
    return {
      ok: true,
      pasos: pasosAdaptacion,
      contexto: {
        etapa: 'ETAPA_5',
        testActual,
        ajusteLogmarPreGrueso: true,
        logmarPreGrueso: LOGMAR_ARRANQUE_LENTES,
        adaptacionCambioOjo: true
      }
    };
  }

  // Si no hay comparación iniciada o es un tipo diferente, inicializarla
  if (!comparacion.tipo || comparacion.ojo !== ojo || comparacion.tipo !== tipo) {
    let valorBase;
    
    if (tipo === 'esferico_grueso') {
      // El valor base es el valor recalculado de esfera para este ojo
      valorBase = estadoExamen.valoresRecalculados[ojo].esfera;
    } else if (tipo === 'esferico_fino') {
      // El valor base es el resultado del test de esférico grueso
      const resultadoGrueso = estadoExamen.secuenciaExamen.resultados[ojo].esfericoGrueso;
      if (resultadoGrueso === null || resultadoGrueso === undefined) {
        return {
          ok: false,
          error: 'Debe completarse el test de esférico grueso antes de esférico fino'
        };
      }
      valorBase = resultadoGrueso;
    } else if (tipo === 'cilindrico') {
      // El valor base es el valor recalculado de cilindro para este ojo
      valorBase = estadoExamen.valoresRecalculados[ojo].cilindro;
      // Validar que el cilindro no sea 0 ni -0.25 (no debería estar en la secuencia si es así)
      if (valorBase === 0 || valorBase === -0.25) {
        return {
          ok: false,
          error: 'El test de cilindro no aplica para este ojo (cilindro = 0 o -0.25)'
        };
      }
    } else if (tipo === 'cilindrico_angulo') {
      // El valor base es el valor inicial de ángulo (NO recalculado) para este ojo
      valorBase = estadoExamen.valoresIniciales[ojo].angulo;
      // Validar que el ángulo sea válido (0-180)
      if (valorBase === null || valorBase === undefined || valorBase < 0 || valorBase > 180) {
        return {
          ok: false,
          error: `El test de cilíndrico ángulo requiere un ángulo inicial válido (0-180 grados). Ángulo actual: ${valorBase}`
        };
      }
    } else {
      return {
        ok: false,
        error: `Tipo de test ${tipo} no soportado aún`
      };
    }

    if (tipo === 'esferico_grueso') {
      asegurarBaselineAgudezaLentes(ojo);
    }

    const resultado = iniciarComparacionLentes(tipo, ojo, valorBase);
    if (!resultado.ok) {
      return resultado;
    }
  }
  
  const estado = estadoExamen.comparacionActual;
  const pasos = [];
  
  // Generar pasos según la fase de comparación
  if (estado.faseComparacion === 'iniciando') {
    // Fase inicial: mensaje introductorio (solo esférico grueso) + mostrar valorMas + pregunta estándar
    let ordenInicial = 1;
    if (tipo === 'esferico_grueso') {
      pasos.push({
        tipo: 'hablar',
        orden: ordenInicial++,
        mensaje: 'Ahora te voy a mostrar otro lente y me vas a decir si ves mejor o peor'
      });
    }
    
    // Generar pasos para mostrar valorMas según el tipo de test
    let pasosMostrar;
    if (tipo === 'cilindrico') {
      pasosMostrar = generarPasosMostrarLenteCilindrico(
        ojo,
        estado.valorMas,
        estado.letraActual,
        estado.logmarActual
      );
    } else if (tipo === 'cilindrico_angulo') {
      pasosMostrar = generarPasosMostrarLenteCilindricoAngulo(
        ojo,
        estado.valorMas,
        estado.letraActual,
        estado.logmarActual
      );
    } else {
      pasosMostrar = generarPasosMostrarLente(
        ojo,
        estado.valorMas,
        estado.letraActual,
        estado.logmarActual
      );
    }
    pasos.push(...pasosMostrar.map((p, i) => ({ ...p, orden: ordenInicial + i })));
    
    // Actualizar estado
    estado.valorActual = estado.valorMas;
    estado.valorAnterior = estado.valorBase;
    estado.valoresProbados.mas = true;
    estado.faseComparacion = 'preguntando';

    pasos.push({
      tipo: 'hablar',
      orden: pasos.length + 1,
      mensaje: mensajePreguntaComparacion
    });
    
  } else if (estado.faseComparacion === 'mostrando_alternativo') {
    // Ya se mostró un alternativo, preguntar preferencia
    pasos.push({
      tipo: 'hablar',
      orden: 1,
      mensaje: mensajePreguntaComparacion
    });
    
    estado.faseComparacion = 'preguntando';
    
  } else if (estado.faseComparacion === 'preguntando') {
    // Mantener contrato conversacional: en ETAPA_5 siempre retornar al menos un mensaje
    return {
      ok: true,
      pasos: [
        {
          tipo: 'hablar',
          orden: 1,
          mensaje: mensajePreguntaComparacion
        }
      ],
      contexto: {
        etapa: 'ETAPA_5',
        testActual,
        comparacionEstado: {
          faseComparacion: estado.faseComparacion,
          valorActual: estado.valorActual,
          valorAnterior: estado.valorAnterior,
          confirmaciones: estado.confirmaciones
        }
      }
    };
  }
  
  return {
    ok: true,
    pasos,
    contexto: {
      etapa: 'ETAPA_5',
      testActual,
      comparacionEstado: {
        faseComparacion: estado.faseComparacion,
        valorActual: estado.valorActual,
        valorAnterior: estado.valorAnterior,
        confirmaciones: estado.confirmaciones
      }
    }
  };
}

/**
 * Interpreta la preferencia del paciente sobre los lentes
 * @param {string} respuestaPaciente - Respuesta del paciente (texto crudo)
 * @param {object} interpretacionComparacion - Interpretación estructurada del agente
 * @returns {string|null} - 'anterior' | 'actual' | 'igual' | null
 */
function interpretarPreferenciaLente(respuestaPaciente, interpretacionComparacion) {
  // Prioridad: usar interpretación estructurada del agente (100% confianza)
  if (interpretacionComparacion?.preferencia) {
    const pref = interpretacionComparacion.preferencia;
    if (['anterior', 'actual', 'igual'].includes(pref)) {
      return pref;
    }
  }
  
  // Fallback: interpretar texto (aunque debería venir estructurado)
  const texto = (respuestaPaciente || '').toLowerCase();
  
  if (texto.includes('anterior') || texto.includes('otro') || texto.includes('otra')) {
    return 'anterior';
  }
  
  if (texto.includes('este') || texto.includes('esta') || texto.includes('con este')) {
    return 'actual';
  }
  
  if (texto.includes('igual') || texto.includes('iguales')) {
    return 'igual';
  }

  if (texto.includes('veo mejor') || /(^|\s)mejor(\s|\.|!)?$/i.test(texto.trim())) {
    return 'actual';
  }
  if (texto.includes('veo peor')) {
    return 'anterior';
  }
  
  return null;
}

/**
 * Procesa la respuesta del paciente en la comparación de lentes
 * @param {string} respuestaPaciente - Respuesta del paciente (texto crudo)
 * @param {object} interpretacionComparacion - Interpretación estructurada del agente
 * @returns {object} - Resultado del procesamiento
 */
function procesarRespuestaComparacionLentes(respuestaPaciente, interpretacionComparacion) {
  const estado = estadoExamen.comparacionActual;
  const testActual = estadoExamen.secuenciaExamen.testActual;
  
  // Validar que estamos en comparación de lentes
  if (!estado.tipo || !testActual) {
    return { ok: false, error: 'No estamos en comparación de lentes' };
  }
  
  // Validar que el tipo de test coincide con el estado de comparación
  if (testActual.tipo !== estado.tipo) {
    return { ok: false, error: `Tipo de test no coincide: esperado ${estado.tipo}, actual ${testActual.tipo}` };
  }
  
  // Validar que el tipo es uno de los soportados
  if (estado.tipo !== 'esferico_grueso' && estado.tipo !== 'esferico_fino' && estado.tipo !== 'cilindrico' && estado.tipo !== 'cilindrico_angulo') {
    return { ok: false, error: `Tipo de test ${estado.tipo} no soportado aún` };
  }
  
  // Interpretar preferencia
  const preferencia = interpretarPreferenciaLente(respuestaPaciente, interpretacionComparacion);
  
  if (!preferencia) {
    return { ok: false, error: 'No se pudo interpretar la preferencia del paciente' };
  }

  const snapCara = estado.valorActual;
  const snapOtro = estado.valorAnterior;
  const valorElegidoReanclajeSnap =
    preferencia === 'actual' ? snapCara : preferencia === 'anterior' ? snapOtro : snapCara;
  
  console.log(`📊 Procesando respuesta comparación (${estado.ojo}):`, {
    respuestaPaciente,
    preferencia,
    valorActual: estado.valorActual,
    valorAnterior: estado.valorAnterior,
    valorBase: estado.valorBase,
    confirmaciones: estado.confirmaciones
  });
  
  // Procesar según preferencia y fase
  if (preferencia === 'anterior') {
    // Eligió el lente anterior
    if (estado.valorActual === estado.valorMas) {
      // Estaba mostrando +salto, eligió base
      estado.valorConfirmado = estado.valorBase;
      estado.confirmaciones = 1;
      estado.valorAnterior = estado.valorBase;
      estado.faseComparacion = 'mostrando_alternativo';
      
      // Generar pasos para mostrar valorMenos
      return { ok: true, necesitaMostrarLente: true, valorAMostrar: estado.valorMenos, valorElegidoReanclaje: valorElegidoReanclajeSnap, preferenciaAplicada: preferencia };
      
    } else if (estado.valorActual === estado.valorMenos) {
      // Estaba mostrando -salto, eligió base (segunda confirmación)
      estado.valorConfirmado = estado.valorBase;
      estado.confirmaciones = 2;
      estado.faseComparacion = 'confirmado';
      
      // Confirmar resultado
      return confirmarResultado(estado.valorBase);
      
    } else if (estado.valorActual === estado.valorBase) {
      // Estaba mostrando base, eligió el anterior (que era el alternativo)
      // Esto significa que el alternativo es mejor
      if (estado.valorAnterior === estado.valorMas) {
        // El anterior era +salto, confirmar +salto
        estado.valorConfirmado = estado.valorMas;
        estado.confirmaciones += 1; // Incrementar en lugar de resetear
        
        // Verificar si ya hay suficientes confirmaciones
        if (estado.confirmaciones >= 2) {
          // Confirmar resultado directamente
          estado.faseComparacion = 'confirmado';
          return confirmarResultado(estado.valorMas);
        }
        
        // Si aún no hay 2 confirmaciones, mostrar base para confirmar
        estado.faseComparacion = 'mostrando_alternativo';
        return { ok: true, necesitaMostrarLente: true, valorAMostrar: estado.valorBase, valorElegidoReanclaje: valorElegidoReanclajeSnap, preferenciaAplicada: preferencia };
      } else if (estado.valorAnterior === estado.valorMenos) {
        // El anterior era -salto, confirmar -salto
        estado.valorConfirmado = estado.valorMenos;
        estado.confirmaciones += 1; // Incrementar en lugar de resetear
        
        // Verificar si ya hay suficientes confirmaciones
        if (estado.confirmaciones >= 2) {
          // Confirmar resultado directamente
          estado.faseComparacion = 'confirmado';
          return confirmarResultado(estado.valorMenos);
        }
        
        // Si aún no hay 2 confirmaciones, mostrar base para confirmar
        estado.faseComparacion = 'mostrando_alternativo';
        return { ok: true, necesitaMostrarLente: true, valorAMostrar: estado.valorBase, valorElegidoReanclaje: valorElegidoReanclajeSnap, preferenciaAplicada: preferencia };
      }
    }
    
  } else if (preferencia === 'actual') {
    // Eligió el lente actual
    if (estado.valorActual === estado.valorMas) {
      // Estaba mostrando +salto, eligió +salto
      estado.valorConfirmado = estado.valorMas;
      estado.confirmaciones = 1;
      estado.valorAnterior = estado.valorMas;
      estado.faseComparacion = 'mostrando_alternativo';
      
      // Generar pasos para mostrar base (confirmar)
      return { ok: true, necesitaMostrarLente: true, valorAMostrar: estado.valorBase, valorElegidoReanclaje: valorElegidoReanclajeSnap, preferenciaAplicada: preferencia };
      
    } else if (estado.valorActual === estado.valorMenos) {
      // Estaba mostrando -salto, eligió -salto
      estado.valorConfirmado = estado.valorMenos;
      estado.confirmaciones = 1;
      estado.valorAnterior = estado.valorMenos;
      estado.faseComparacion = 'mostrando_alternativo';
      
      // Generar pasos para mostrar base (confirmar)
      return { ok: true, necesitaMostrarLente: true, valorAMostrar: estado.valorBase, valorElegidoReanclaje: valorElegidoReanclajeSnap, preferenciaAplicada: preferencia };
      
    } else if (estado.valorActual === estado.valorBase) {
      // Estaba mostrando base, eligió base (confirmación)
      estado.confirmaciones += 1;
      
      if (estado.confirmaciones >= 2) {
        // Confirmado
        estado.faseComparacion = 'confirmado';
        return confirmarResultado(estado.valorBase);
      } else {
        // Aún necesita otra confirmación
        estado.faseComparacion = 'mostrando_alternativo';
        // Mostrar el alternativo que no probamos aún
        if (!estado.valoresProbados.mas) {
          return { ok: true, necesitaMostrarLente: true, valorAMostrar: estado.valorMas, valorElegidoReanclaje: valorElegidoReanclajeSnap, preferenciaAplicada: preferencia };
        } else if (!estado.valoresProbados.menos) {
          return { ok: true, necesitaMostrarLente: true, valorAMostrar: estado.valorMenos, valorElegidoReanclaje: valorElegidoReanclajeSnap, preferenciaAplicada: preferencia };
        } else {
          // Ya probamos ambos, volver a mostrar base
          return { ok: true, necesitaMostrarLente: true, valorAMostrar: estado.valorBase, valorElegidoReanclaje: valorElegidoReanclajeSnap, preferenciaAplicada: preferencia };
        }
      }
    }
    
  } else if (preferencia === 'igual') {
    // Dice que son iguales
    // Probar de nuevo esos lentes
    if (estado.confirmaciones === 0) {
      // Primera vez que dice igual, reintentar
      estado.faseComparacion = 'mostrando_alternativo';
      return { ok: true, necesitaMostrarLente: true, valorAMostrar: estado.valorActual, valorElegidoReanclaje: valorElegidoReanclajeSnap, preferenciaAplicada: preferencia };
    } else {
      // Ya dijo igual antes, usar el valor más pequeño
      const valores = [estado.valorMas, estado.valorBase, estado.valorMenos].filter(v => v !== null);
      const valorMasPequeno = Math.min(...valores);
      
      console.log(`⚠️ Paciente dice "igual" repetidamente, usando valor más pequeño: ${valorMasPequeno}`);
      estado.faseComparacion = 'confirmado';
      return confirmarResultado(valorMasPequeno);
    }
  }
  
  return { ok: true };
}

/**
 * Confirma el resultado final del test de lentes
 * @param {number} valorFinal - Valor final confirmado
 * @returns {object} - Resultado de la confirmación
 */
function confirmarResultado(valorFinal) {
  const estado = estadoExamen.comparacionActual;
  const ojo = estado.ojo;
  const tipo = estado.tipo;
  
  // Guardar resultado según el tipo de test
  if (tipo === 'esferico_grueso') {
    estadoExamen.secuenciaExamen.resultados[ojo].esfericoGrueso = valorFinal;
    console.log(`✅ Resultado confirmado para ${ojo} (esférico grueso): ${valorFinal}`);
  } else if (tipo === 'esferico_fino') {
    estadoExamen.secuenciaExamen.resultados[ojo].esfericoFino = valorFinal;
    console.log(`✅ Resultado confirmado para ${ojo} (esférico fino): ${valorFinal}`);
  } else if (tipo === 'cilindrico') {
    estadoExamen.secuenciaExamen.resultados[ojo].cilindrico = valorFinal;
    console.log(`✅ Resultado confirmado para ${ojo} (cilíndrico): ${valorFinal}`);
    
    // Actualizar el foróptero con el nuevo valor de cilindro
    // Obtener valores actuales del foróptero (usar resultados de tests anteriores si existen)
    const esferaFinal = estadoExamen.secuenciaExamen.resultados[ojo].esfericoFino 
      || estadoExamen.secuenciaExamen.resultados[ojo].esfericoGrueso 
      || estadoExamen.valoresRecalculados[ojo].esfera;
    
    // Actualizar foróptero con el nuevo cilindro confirmado
    if (ejecutarComandoForopteroInterno) {
      const configForoptero = {
        [ojo]: {
          esfera: esferaFinal,
          cilindro: valorFinal,
          angulo: estadoExamen.valoresRecalculados[ojo].angulo,
          occlusion: 'open'
        },
        [ojo === 'R' ? 'L' : 'R']: {
          occlusion: 'close'
        }
      };
      
      // Ejecutar de forma asíncrona (no esperar, continuar con el flujo)
      ejecutarComandoForopteroInterno(configForoptero).catch(err => {
        console.error(`⚠️ Error actualizando foróptero después de confirmar cilíndrico:`, err);
      });
      
      console.log(`🔧 Foróptero actualizado con nuevo cilindro para ${ojo}: ${valorFinal}`);
    }
  } else if (tipo === 'cilindrico_angulo') {
    estadoExamen.secuenciaExamen.resultados[ojo].cilindricoAngulo = valorFinal;
    console.log(`✅ Resultado confirmado para ${ojo} (cilíndrico ángulo): ${valorFinal}°`);
    
    // Actualizar el foróptero con el nuevo valor de ángulo
    // Obtener valores actuales del foróptero (usar resultados de tests anteriores si existen)
    const esferaFinal = estadoExamen.secuenciaExamen.resultados[ojo].esfericoFino 
      || estadoExamen.secuenciaExamen.resultados[ojo].esfericoGrueso 
      || estadoExamen.valoresRecalculados[ojo].esfera;
    
    // Usar el resultado del test de cilindro si existe, sino el valor recalculado
    const cilindroFinal = estadoExamen.secuenciaExamen.resultados[ojo].cilindrico 
      || estadoExamen.valoresRecalculados[ojo].cilindro;
    
    // Actualizar foróptero con el nuevo ángulo confirmado
    if (ejecutarComandoForopteroInterno) {
      const configForoptero = {
        [ojo]: {
          esfera: esferaFinal,
          cilindro: cilindroFinal,
          angulo: valorFinal, // Actualizar ángulo
          occlusion: 'open'
        },
        [ojo === 'R' ? 'L' : 'R']: {
          occlusion: 'close'
        }
      };
      
      // Ejecutar de forma asíncrona (no esperar, continuar con el flujo)
      ejecutarComandoForopteroInterno(configForoptero).catch(err => {
        console.error(`⚠️ Error actualizando foróptero después de confirmar cilíndrico ángulo:`, err);
      });
      
      console.log(`🔧 Foróptero actualizado con nuevo ángulo para ${ojo}: ${valorFinal}°`);
    }
  } else {
    console.error(`❌ Tipo de test desconocido al confirmar resultado: ${tipo}`);
    return { ok: false, error: `Tipo de test ${tipo} no soportado` };
  }
  
  // Resetear estado de comparación
  estadoExamen.comparacionActual = {
    tipo: null,
    ojo: null,
    valorBase: null,
    valorActual: null,
    valorAnterior: null,
    valorConfirmado: null,
    confirmaciones: 0,
    direccion: null,
    faseComparacion: null,
    letraActual: null,
    logmarActual: null,
    saltoActual: null,
    valorMas: null,
    valorMenos: null,
    valoresProbados: {
      mas: false,
      menos: false,
      base: false
    }
  };
  
  // Avanzar al siguiente test
  const siguienteTest = avanzarTest();

  estadoExamen.ritualInterTestsPendiente = null;
  if (
    siguienteTest &&
    estadoExamen.etapa === 'ETAPA_5' &&
    debeProgramarRitualEntreTestsLentes(tipo, ojo, siguienteTest)
  ) {
    estadoExamen.ritualInterTestsPendiente = construirRitualEntreTestsLentes(tipo, siguienteTest.ojo, valorFinal);
  }

  // Si el siguiente test es agudeza_alcanzada, resetear estado de agudeza
  // Esto asegura que el estado esté limpio para agudeza_alcanzada
  // y evita problemas de inicialización cuando cambia de lentes a agudeza
  if (siguienteTest && siguienteTest.tipo === 'agudeza_alcanzada') {
    resetearEstadoAgudeza(estadoExamen.agudezaEstado);
  }
  
  return {
    ok: true,
    resultadoConfirmado: true,
    valorFinal,
    siguienteTest
  };
}

// --- Binocular (ETAPA_6): definiciones en DEFINICIONES_EXAMEN_BINOCULAR.md

const BINOC_LOGMAR = 0.3;
const BINOC_LETRA = 'H';
const PASO_BINOC_D = 0.5;
const SPH_MIN = -19;
const SPH_MAX = 16.5;
const CYL_MIN = -6;
const CYL_MAX = 0;

const FB_ESF_MOSTRAR = 'binoc_esfera_aplicar_variante';
const FB_ESF_PREG = 'binoc_esfera_preguntando';
const FB_CIL_MOSTRAR = 'binoc_cil_aplicar_variante';
const FB_CIL_PREG = 'binoc_cil_preguntando';
const FB_TRANS_LISTO = 'binoc_transicion_esperando_listo';

const MSG_BINOC_PRE_CAMBIO =
  'Ahora vamos a usar otro par de lentes, y me vas a decir si ves mejor o peor.';
const MSG_BINOC_PREGUNTA = '¿Ves mejor con la configuración anterior o con la actual?';
/** Un solo turno: variante ya aplicada; el paciente compara con la configuración previa. */
const MSG_BINOC_PREGUNTA_COMBINADA = `${MSG_BINOC_PRE_CAMBIO} ${MSG_BINOC_PREGUNTA}`;
const MSG_BINOC_TRANSICION =
  'Ahora vamos a ver con ambos ojos, tomate tu tiempo y avisame cuando estés listo.';
const MSG_BINOC_REINTENTO_LISTO =
  'Tomate unos segundos mas. Cuando quieras seguimos; decime "listo".';

function binocResultadoCompleto(b) {
  return b != null && typeof b === 'object' && b.esfera !== null && b.esfera !== undefined;
}

function esRespuestaContinuidadBinocular(respuestaPaciente = '') {
  const t = String(respuestaPaciente || '').toLowerCase().trim();
  if (!t) return false;

  const patrones = [
    /\blisto\b/,
    /\bcontinu(ar|emos)?\b/,
    /\bok\b/,
    /\bdale\b/,
    /\bya\b/,
    /\bseguimos\b/,
    /\bsi\b/,
    /\bs[ií]\b/
  ];

  return patrones.some((re) => re.test(t));
}

function redondearDioptria(v) {
  if (v == null || Number.isNaN(v)) return v;
  return Math.round(v * 100) / 100;
}

function clampEsferaBinocular(v) {
  if (v == null || Number.isNaN(v)) return v;
  return Math.min(SPH_MAX, Math.max(SPH_MIN, v));
}

function clampCilindroBinocular(v) {
  if (v == null || Number.isNaN(v)) return v;
  return Math.min(CYL_MAX, Math.max(CYL_MIN, v));
}

/** Mueve la esfera 0,50 D hacia el cero (rango esfera -19 … +16,5). */
function moverMediaHaciaCeroEsfera(valor) {
  if (valor == null || valor === 0) return valor;
  let next;
  if (valor > 0) next = Math.max(0, valor - PASO_BINOC_D);
  else next = Math.min(0, valor + PASO_BINOC_D);
  return redondearDioptria(clampEsferaBinocular(next));
}

/** Mueve el cilindro 0,50 D hacia el cero (cilindro 0 … -6). */
function moverMediaHaciaCeroCilindro(valor) {
  if (valor == null || valor === 0) return valor;
  const next = Math.min(0, valor + PASO_BINOC_D);
  return redondearDioptria(clampCilindroBinocular(next));
}

function normalizarOjoBinocular(ojo) {
  const esfera = ojo.esfera == null ? 0 : redondearDioptria(Number(ojo.esfera));
  let cilindro = ojo.cilindro == null ? 0 : redondearDioptria(Number(ojo.cilindro));
  cilindro = clampCilindroBinocular(cilindro);
  let angulo = ojo.angulo == null ? 0 : Number(ojo.angulo);
  if (cilindro === 0) angulo = 0;
  return { esfera: clampEsferaBinocular(esfera), cilindro, angulo };
}

function normalizarRxPar(rx) {
  return {
    R: normalizarOjoBinocular(rx.R),
    L: normalizarOjoBinocular(rx.L)
  };
}

function copiarRxPar(rx) {
  return normalizarRxPar({
    R: { ...rx.R },
    L: { ...rx.L }
  });
}

function cilindroEsCero(c) {
  return c === 0 || c === null || c === undefined;
}

function ambosCilindrosCero(rx) {
  return cilindroEsCero(rx.R.cilindro) && cilindroEsCero(rx.L.cilindro);
}

/** Construye Rx de entrada a ETAPA_6 (examen normal vs testbin). */
function construirRxBaseBinocular() {
  const resultados = estadoExamen.secuenciaExamen.resultados;
  const recalc = estadoExamen.valoresRecalculados;
  const modo = estadoExamen.modo;

  if (modo === 'testbin') {
    for (const ojo of ['R', 'L']) {
      const v = recalc[ojo];
      if (v.esfera == null || v.cilindro == null || v.angulo == null) {
        return { ok: false, error: `valoresRecalculados incompletos para ojo ${ojo}` };
      }
    }
    const rx = {
      R: { esfera: recalc.R.esfera, cilindro: recalc.R.cilindro, angulo: recalc.R.angulo },
      L: { esfera: recalc.L.esfera, cilindro: recalc.L.cilindro, angulo: recalc.L.angulo }
    };
    return { ok: true, rx: normalizarRxPar(rx) };
  }

  const esferaR = resultados.R.esfericoFino;
  const esferaL = resultados.L.esfericoFino;
  if (esferaR == null || esferaL == null) {
    return { ok: false, error: 'Falta esférico fino confirmado para binocular (R y L)' };
  }

  function cilYAnguloOjo(ojo) {
    const res = resultados[ojo];
    const tieneCil =
      res.cilindrico !== null && res.cilindrico !== undefined;
    const tieneAng =
      res.cilindricoAngulo !== null && res.cilindricoAngulo !== undefined;
    if (tieneCil && tieneAng) {
      return { cilindro: res.cilindrico, angulo: res.cilindricoAngulo };
    }
    return { cilindro: recalc[ojo].cilindro, angulo: recalc[ojo].angulo };
  }

  const cR = cilYAnguloOjo('R');
  const cL = cilYAnguloOjo('L');
  if (cR.cilindro == null || cR.angulo == null || cL.cilindro == null || cL.angulo == null) {
    return { ok: false, error: 'Faltan cilindro/eje (resultados o valores recalculados) para binocular' };
  }

  const rx = {
    R: { esfera: esferaR, cilindro: cR.cilindro, angulo: cR.angulo },
    L: { esfera: esferaL, cilindro: cL.cilindro, angulo: cL.angulo }
  };
  return { ok: true, rx: normalizarRxPar(rx) };
}

function aplicarVarianteEsferica(rxBase) {
  const out = copiarRxPar(rxBase);
  if (out.R.esfera !== 0) out.R.esfera = moverMediaHaciaCeroEsfera(out.R.esfera);
  if (out.L.esfera !== 0) out.L.esfera = moverMediaHaciaCeroEsfera(out.L.esfera);
  return normalizarRxPar(out);
}

function aplicarVarianteCilindrica(rxBase) {
  const out = copiarRxPar(rxBase);
  if (!cilindroEsCero(out.R.cilindro)) {
    out.R.cilindro = moverMediaHaciaCeroCilindro(out.R.cilindro);
  }
  if (!cilindroEsCero(out.L.cilindro)) {
    out.L.cilindro = moverMediaHaciaCeroCilindro(out.L.cilindro);
  }
  return normalizarRxPar(out);
}

function foropteroDesdeRx(rx) {
  const n = normalizarRxPar(rx);
  return {
    R: {
      esfera: n.R.esfera,
      cilindro: n.R.cilindro,
      angulo: n.R.angulo,
      occlusion: 'open'
    },
    L: {
      esfera: n.L.esfera,
      cilindro: n.L.cilindro,
      angulo: n.L.angulo,
      occlusion: 'open'
    }
  };
}

function binocularEstadoVacio() {
  return {
    rxInicial: null,
    rxActiva: null,
    rxBasePaso: null,
    rxVariante: null,
    paso: null,
    faseBinocular: null,
    omitirCilindro: false
  };
}

function contextoBinocularResumido(st) {
  return {
    paso: st.paso,
    faseBinocular: st.faseBinocular,
    rxActiva: st.rxActiva ? copiarRxPar(st.rxActiva) : null,
    rxBasePaso: st.rxBasePaso ? copiarRxPar(st.rxBasePaso) : null,
    rxVariante: st.rxVariante ? copiarRxPar(st.rxVariante) : null
  };
}

/**
 * Inicializa el estado de binocular
 * @returns {object} - Resultado de la inicialización
 */
function iniciarBinocular() {
  const built = construirRxBaseBinocular();
  if (!built.ok) return built;

  const rxEntrada = copiarRxPar(built.rx);
  const rxBase = copiarRxPar(built.rx);
  const rxVar = aplicarVarianteEsferica(rxBase);

  estadoExamen.binocularEstado = {
    rxInicial: copiarRxPar(rxEntrada),
    rxActiva: copiarRxPar(rxEntrada),
    rxBasePaso: rxBase,
    rxVariante: rxVar,
    paso: 'esfera',
    faseBinocular: FB_TRANS_LISTO,
    omitirCilindro: false
  };

  console.log(`🔍 Iniciando test binocular:`, {
    rxEntrada,
    varianteEsfera: rxVar
  });

  return { ok: true, binocularIniciado: true };
}

/**
 * Genera pasos para ETAPA_6 (test binocular)
 */
function generarPasosEtapa6() {
  const testActual = estadoExamen.secuenciaExamen.testActual;

  if (!testActual || testActual.tipo !== 'binocular') {
    return { ok: false, error: 'No estamos en test binocular' };
  }

  const resultados = estadoExamen.secuenciaExamen.resultados;
  const estadoIni = estadoExamen.binocularEstado;

  if (!estadoIni || !estadoIni.faseBinocular) {
    const resultado = iniciarBinocular();
    if (!resultado.ok) return resultado;
  }

  const estadoActual = estadoExamen.binocularEstado;

  if (binocResultadoCompleto(resultados.R.binocular) && binocResultadoCompleto(resultados.L.binocular)) {
    avanzarTest();
    return generarPasos();
  }

  const pasos = [];
  const tvPaso = (orden) => ({
    tipo: 'tv',
    orden,
    letra: BINOC_LETRA,
    logmar: BINOC_LOGMAR
  });

  const fase = estadoActual.faseBinocular;

  if (fase === FB_TRANS_LISTO) {
    pasos.push({
      tipo: 'foroptero',
      orden: 1,
      foroptero: foropteroDesdeRx(estadoActual.rxBasePaso)
    });
    pasos.push({ tipo: 'esperar_foroptero', orden: 2 });
    pasos.push(tvPaso(3));
    pasos.push({ tipo: 'hablar', orden: 4, mensaje: MSG_BINOC_TRANSICION });
  } else if (fase === FB_ESF_MOSTRAR) {
    pasos.push({
      tipo: 'foroptero',
      orden: 1,
      foroptero: foropteroDesdeRx(estadoActual.rxVariante)
    });
    pasos.push({ tipo: 'esperar_foroptero', orden: 2 });
    pasos.push(tvPaso(3));
    pasos.push({ tipo: 'hablar', orden: 4, mensaje: MSG_BINOC_PREGUNTA_COMBINADA });
    estadoActual.faseBinocular = FB_ESF_PREG;
  } else if (fase === FB_ESF_PREG) {
    return {
      ok: true,
      pasos: [],
      contexto: {
        etapa: 'ETAPA_6',
        testActual,
        binocularEstado: contextoBinocularResumido(estadoActual)
      }
    };
  } else if (fase === FB_CIL_MOSTRAR) {
    pasos.push({
      tipo: 'foroptero',
      orden: 1,
      foroptero: foropteroDesdeRx(estadoActual.rxVariante)
    });
    pasos.push({ tipo: 'esperar_foroptero', orden: 2 });
    pasos.push(tvPaso(3));
    pasos.push({ tipo: 'hablar', orden: 4, mensaje: MSG_BINOC_PREGUNTA_COMBINADA });
    estadoActual.faseBinocular = FB_CIL_PREG;
  } else if (fase === FB_CIL_PREG) {
    return {
      ok: true,
      pasos: [],
      contexto: {
        etapa: 'ETAPA_6',
        testActual,
        binocularEstado: contextoBinocularResumido(estadoActual)
      }
    };
  }

  return {
    ok: true,
    pasos,
    contexto: {
      etapa: 'ETAPA_6',
      testActual,
      binocularEstado: contextoBinocularResumido(estadoActual)
    }
  };
}

/**
 * Procesa la respuesta del paciente en test binocular
 */
function procesarRespuestaBinocular(respuestaPaciente, interpretacionComparacion) {
  const estado = estadoExamen.binocularEstado;
  const testActual = estadoExamen.secuenciaExamen.testActual;

  if (!estado || !testActual || testActual.tipo !== 'binocular') {
    return { ok: false, error: 'No estamos en test binocular' };
  }

  if (estado.faseBinocular === FB_TRANS_LISTO) {
    if (esRespuestaContinuidadBinocular(respuestaPaciente)) {
      estado.faseBinocular = FB_ESF_MOSTRAR;
      return { ok: true, necesitaMostrarLente: true };
    }
    return {
      ok: true,
      pasos: [
        {
          tipo: 'hablar',
          orden: 1,
          mensaje: MSG_BINOC_REINTENTO_LISTO
        }
      ]
    };
  }

  if (estado.faseBinocular !== FB_ESF_PREG && estado.faseBinocular !== FB_CIL_PREG) {
    return { ok: false, error: 'No estamos esperando respuesta de comparación binocular' };
  }

  let preferencia = interpretarPreferenciaLente(respuestaPaciente, interpretacionComparacion);
  if (!preferencia) {
    return { ok: false, error: 'No se pudo interpretar la preferencia del paciente' };
  }
  if (preferencia === 'igual') preferencia = 'anterior';

  if (preferencia === 'actual') {
    estado.rxActiva = copiarRxPar(estado.rxVariante);
  } else {
    estado.rxActiva = copiarRxPar(estado.rxBasePaso);
  }
  estado.rxActiva = normalizarRxPar(estado.rxActiva);

  console.log(`📊 Procesando respuesta binocular:`, {
    respuestaPaciente,
    preferencia,
    paso: estado.paso,
    rxActiva: estado.rxActiva
  });

  if (estado.paso === 'esfera') {
    if (ambosCilindrosCero(estado.rxActiva)) {
      return confirmarResultadoBinocular(estado.rxActiva);
    }
    estado.rxBasePaso = copiarRxPar(estado.rxActiva);
    estado.rxVariante = aplicarVarianteCilindrica(estado.rxBasePaso);
    estado.paso = 'cilindro';
    estado.faseBinocular = FB_CIL_MOSTRAR;
    return {
      ok: true,
      necesitaMostrarLente: true,
      postComparacionTrasEsfera: true,
      reanclajeRxBinocularIntermedio: preferencia === 'anterior'
    };
  }

  return confirmarResultadoBinocular(estado.rxActiva);
}

/**
 * Confirma el resultado final del test binocular (Rx completa por ojo)
 */
function confirmarResultadoBinocular(rxFinal) {
  const resultados = estadoExamen.secuenciaExamen.resultados;
  const n = normalizarRxPar(copiarRxPar(rxFinal));

  resultados.R.binocular = { esfera: n.R.esfera, cilindro: n.R.cilindro, angulo: n.R.angulo };
  resultados.L.binocular = { esfera: n.L.esfera, cilindro: n.L.cilindro, angulo: n.L.angulo };

  console.log(`✅ Resultado binocular confirmado:`, n);

  estadoExamen.binocularEstado = binocularEstadoVacio();

  const siguienteTest = avanzarTest();

  return {
    ok: true,
    resultadoConfirmado: true,
    rxFinal: n,
    siguienteTest
  };
}

/**
 * Obtiene el detalle completo del examen
 * Incluye valores iniciales, recalculados, lista de tests y resultados
 */
export function obtenerDetalleExamen() {
  const { secuenciaExamen, valoresIniciales, valoresRecalculados } = estadoExamen;
  
  // Mapear tests con su estado y resultado
  // Si testsActivos está vacío o no existe, retornar array vacío
  const tests = (secuenciaExamen.testsActivos || []).map((test, indice) => {
    const estado = obtenerEstadoTest(indice, test.tipo, test.ojo);
    const resultado = obtenerResultadoTest(test.tipo, test.ojo);
    
    // Manejo especial para binocular
    if (test.tipo === 'binocular') {
      return {
        indice,
        tipo: test.tipo,
        ojo: test.ojo,
        estado,
        resultadoR: resultado?.resultadoR ?? null,
        resultadoL: resultado?.resultadoL ?? null
      };
    }
    
    // Lógica normal para otros tests
    return {
      indice,
      tipo: test.tipo,
      ojo: test.ojo,
      estado,
      resultado
    };
  });
  
  return {
    ok: true,
    detalle: {
      // 0. Modo de examen
      modo: estadoExamen.modo,
      // 1. Valores iniciales
      valoresIniciales: {
        R: { ...valoresIniciales.R },
        L: { ...valoresIniciales.L }
      },
      
      // 2. Valores recalculados
      valoresRecalculados: {
        R: { ...valoresRecalculados.R },
        L: { ...valoresRecalculados.L }
      },
      
      // 3. Lista de tests a realizar (con estado)
      tests,
      
      // 4. Valores de los tests (realizados y por realizar)
      resultados: {
        R: { ...(secuenciaExamen.resultados?.R || {}) },
        L: { ...(secuenciaExamen.resultados?.L || {}) }
      },
      
      // 5. Información adicional
      estadoActual: {
        etapa: estadoExamen.etapa,
        ojoActual: estadoExamen.ojoActual,
        testActual: secuenciaExamen.testActual || null,
        indiceActual: secuenciaExamen.indiceActual || 0,
        progreso: calcularProgreso()
      },
      
      timestamps: {
        iniciado: estadoExamen.iniciado,
        finalizado: estadoExamen.finalizado
      }
    }
  };
}

// ============================================================
// REGISTRO POC — export CSV (ver PLAN_POC_REGISTRO_EXAMEN_CSV.md)
// ============================================================

const REGISTRO_TZ = 'America/Argentina/Buenos_Aires';

function registroExamenLimpiar() {
  registroExamenEventos = [];
  registroTextoValoresInicialesPaciente = null;
}

function registroExamenFormatTimestampAR(d = new Date()) {
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: REGISTRO_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
      .format(d)
      .replace('T', ' ');
  } catch {
    const t = new Date(d.getTime() - 3 * 60 * 60 * 1000);
    return t.toISOString().slice(0, 19).replace('T', ' ');
  }
}

function registroExamenEscapeCsvCell(val) {
  if (val == null) return '';
  const s = String(val);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function registroFmtDiop(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return '?';
  if (Math.abs(x) < 1e-9) return '+0.00';
  const t = x.toFixed(2);
  return x > 0 ? `+${t}` : t;
}

function registroFmtCadenaRxDesdeVals(vR, vL) {
  if (
    vR?.esfera == null ||
    vR?.cilindro == null ||
    vR?.angulo == null ||
    vL?.esfera == null ||
    vL?.cilindro == null ||
    vL?.angulo == null
  ) {
    return 'pendiente';
  }
  return `<R> ${registroFmtDiop(vR.esfera)} , ${registroFmtDiop(vR.cilindro)} , ${vR.angulo} / <L> ${registroFmtDiop(vL.esfera)} , ${registroFmtDiop(vL.cilindro)} , ${vL.angulo}`;
}

function registroDescribirComandoForoptero(cmd) {
  if (!cmd || typeof cmd !== 'object') return '(sin comando foróptero)';
  const ojos = ['R', 'L'];
  const partes = [];
  for (const eye of ojos) {
    const o = cmd[eye];
    if (!o || typeof o !== 'object') continue;
    const bits = [];
    if (o.esfera != null) bits.push(`Esf ${registroFmtDiop(o.esfera)}`);
    if (o.cilindro != null) bits.push(`Cil ${registroFmtDiop(o.cilindro)}`);
    if (o.angulo != null && Number(o.cilindro) !== 0) bits.push(`@${o.angulo}°`);
    if (o.occlusion) bits.push(`(${o.occlusion})`);
    if (bits.length) partes.push(`<${eye}> ${bits.join(' / ')}`);
    else if (o.occlusion) partes.push(`<${eye}> (${o.occlusion})`);
  }
  return partes.length ? partes.join('; ') : JSON.stringify(cmd);
}

function registroExamenAppendEvento(origen, detalle) {
  registroExamenEventos.push({
    timestamp: registroExamenFormatTimestampAR(),
    origen,
    detalle: typeof detalle === 'string' ? detalle : JSON.stringify(detalle)
  });
}

function registroExamenRegistrarPacienteEInterpretacion(rp, ia, ic) {
  registroExamenAppendEvento('Paciente', rp);
  if (ia && typeof ia === 'object') {
    registroExamenAppendEvento(
      'Interpretacion',
      JSON.stringify({ tipo: 'agudeza', resultado: ia.resultado, letraIdentificada: ia.letraIdentificada ?? null })
    );
  }
  if (ic && typeof ic === 'object') {
    registroExamenAppendEvento(
      'Interpretacion',
      JSON.stringify({
        tipo: 'comparacion',
        preferencia: ic.preferencia,
        confianza: ic.confianza ?? null
      })
    );
  }
}

/**
 * Llamar desde server.js tras cada respuesta con pasos `hablar` para el agente.
 * @param {{ ok?: boolean, pasos?: Array<{ tipo?: string, mensaje?: string }> }} resultado
 */
export function registrarPasosOftalmologoDesdeRespuesta(resultado) {
  if (!resultado?.ok || !Array.isArray(resultado.pasos)) return;
  for (const p of resultado.pasos) {
    if (p?.tipo === 'hablar' && typeof p.mensaje === 'string' && p.mensaje.trim()) {
      registroExamenAppendEvento('Oftalmologo', p.mensaje.trim());
    }
  }
}

function registroFmtValorResultado(v) {
  if (v == null) return 'pendiente';
  if (typeof v === 'object') {
    const r = v;
    if (r.esfera != null && r.cilindro != null && r.angulo != null) {
      return `Esf ${registroFmtDiop(r.esfera)} / Cil ${registroFmtDiop(r.cilindro)} @ ${r.angulo}°`;
    }
    return JSON.stringify(v);
  }
  return String(v);
}

/**
 * Genera el contenido UTF-8 del CSV del examen en curso (POC).
 */
export function generarRegistroExamenCsv() {
  const lineas = [];
  const sep = ',';
  const push2 = (a, b) =>
    lineas.push(`${registroExamenEscapeCsvCell(a)}${sep}${registroExamenEscapeCsvCell(b)}`);

  push2('exportado_en', registroExamenFormatTimestampAR());
  push2('zona_horaria', REGISTRO_TZ);
  push2('etapa_actual', estadoExamen.etapa ?? '');
  push2('modo_examen', estadoExamen.modo ?? '');

  const viStr =
    registroTextoValoresInicialesPaciente && registroTextoValoresInicialesPaciente.trim() !== ''
      ? registroTextoValoresInicialesPaciente.trim()
      : registroFmtCadenaRxDesdeVals(estadoExamen.valoresIniciales?.R, estadoExamen.valoresIniciales?.L);
  push2('Valores iniciales', viStr);

  const vrStr = registroFmtCadenaRxDesdeVals(
    estadoExamen.valoresRecalculados?.R,
    estadoExamen.valoresRecalculados?.L
  );
  push2('Valores recalculados', vrStr);

  lineas.push(`Timestamp${sep}Origen${sep}Detalle`);
  for (const ev of registroExamenEventos) {
    lineas.push(
      [
        registroExamenEscapeCsvCell(ev.timestamp),
        registroExamenEscapeCsvCell(ev.origen),
        registroExamenEscapeCsvCell(ev.detalle)
      ].join(sep)
    );
  }

  lineas.push(`Test${sep}Valor`);
  const res = estadoExamen.secuenciaExamen?.resultados;
  if (res?.R) {
    const r = res.R;
    push2('Agudeza inicial (R)', registroFmtValorResultado(r.agudezaInicial));
    push2('Esférico Grueso (R)', registroFmtValorResultado(r.esfericoGrueso));
    push2('Esférico Fino (R)', registroFmtValorResultado(r.esfericoFino));
    push2('Cilíndrico (R)', registroFmtValorResultado(r.cilindrico));
    push2('Cilíndrico ángulo (R)', registroFmtValorResultado(r.cilindricoAngulo));
    push2('Agudeza alcanzada (R)', registroFmtValorResultado(r.agudezaAlcanzada));
  }
  if (res?.L) {
    const L = res.L;
    push2('Agudeza inicial (L)', registroFmtValorResultado(L.agudezaInicial));
    push2('Esférico Grueso (L)', registroFmtValorResultado(L.esfericoGrueso));
    push2('Esférico Fino (L)', registroFmtValorResultado(L.esfericoFino));
    push2('Cilíndrico (L)', registroFmtValorResultado(L.cilindrico));
    push2('Cilíndrico ángulo (L)', registroFmtValorResultado(L.cilindricoAngulo));
    push2('Agudeza alcanzada (L)', registroFmtValorResultado(L.agudezaAlcanzada));
  }
  if (res?.R?.binocular != null && res?.L?.binocular != null) {
    push2(
      'Binocular (B)',
      `R: ${registroFmtValorResultado(res.R.binocular)} / L: ${registroFmtValorResultado(res.L.binocular)}`
    );
  } else {
    push2('Binocular (B)', 'pendiente');
  }

  return `\ufeff${lineas.join('\r\n')}`;
}

