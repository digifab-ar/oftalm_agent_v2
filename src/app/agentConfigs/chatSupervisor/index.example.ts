/**
 * EJEMPLO: Cómo cambiar entre diferentes versiones del supervisor
 * 
 * Copia este archivo a index.ts y descomenta la versión que quieras usar
 */

import { RealtimeAgent } from '@openai/agents/realtime';

// ============================================
// OPCIÓN 1: Versión Original (actual)
// ============================================
// import supervisorAgent from './supervisorAgent';

// ============================================
// OPCIÓN 2: Versión Optimizada con Instrucciones Modulares (REQUIERE ARCHIVOS EXTRA)
// ============================================
// Nota: Esta opción queda solo como referencia.
// Los archivos `supervisorAgentOptimized` y relacionados se han eliminado del proyecto actual,
// por lo que estas líneas se dejan comentadas para evitar errores en el build.
// Si en el futuro recreas esa implementación, podés descomentar estas líneas y crear el archivo correspondiente.
// import supervisorAgentOptimized from './supervisorAgentOptimized';
// const supervisorAgent = supervisorAgentOptimized; // Alias para compatibilidad

// ============================================
// OPCIÓN 3: Versión con Actualización Dinámica
// ============================================
// import supervisorAgentDynamic from './supervisorAgentDynamic';
// const supervisorAgent = supervisorAgentDynamic; // Alias para compatibilidad

// ============================================
// Chat Agent (sin cambios)
// ============================================
export const chatAgent = new RealtimeAgent({
  name: 'Viejo',
  instructions: `
Eres un profesional oftalmólogo que se comunica en español argentino, con un tono clínico, amable y claro.
Tu función es guiar al paciente durante un examen visual automatizado realizado con un foróptero digital y una TV de optotipos.

Sigue estas pautas:
- Habla con claridad, usando un tono tranquilo y profesional.
- No menciones nunca comandos, endpoints ni términos técnicos.
- Si necesitás ajustar lentes o cambiar optotipos, indicá lo que harás de forma natural, por ejemplo:
- Las acciones técnicas se manejan por tu asistente interno (el supervisor), no las digas en voz alta.
- Cuando termines el examen, informá el resultado con una breve conclusión clínica.

# Acciones Permitidas
Podés:
- Solicitar iniciar el test visual al paciente.
- Preguntar por los valores iniciales del autorrefractómetro al paciente.
- Enviar los valores iniciales del autorrefractómetro al supervisor.
- Solicitar los valores iniciales recalculados al supervisor.
- Solicitar la secuencia de tests al supervisor.
- Iniciar el test visual con el paciente.
- Solicitar paso de test al supervisor.
- Guiar el test visual con el paciente.
- Solicitar resultados finales de refracción al supervisor.
- Informar el resultado final de refracción al paciente.

Habla siempre en tono humano, sin tecnicismos de programación ni estructuras de código.
  `,
  voice: 'alloy',
  // En el proyecto actual no se usa un supervisor separado,
  // por lo que este ejemplo no referencia ningún `supervisorAgent` real.
  // Si en el futuro agregás uno, podés pasarlo aquí en `handoffs`.
  handoffs: []
});

export const chatSupervisorScenario = [chatAgent];

// Name of the company represented by this agent set. Used by guardrails
export const chatSupervisorCompanyName = 'Viejo';

export default chatSupervisorScenario;

