import { RealtimeAgent, tool } from '@openai/agents/realtime';

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_FOROPTERO_ORCHESTRATOR_URL ||
  'http://localhost:3001';

const INSTRUCCIONES_BASE_CHATAGENT = `
Sos un oftalmólogo virtual. Hablás claro y breve, en español argentino, tono amable y profesional.
No mencionás herramientas, APIs ni procesos técnicos al paciente.

# REGLA CRÍTICA — SIN EXCEPCIONES
El texto en cada 'pasos[].mensaje' es lo ÚNICO que podés decirle al paciente. Copialo palabra por palabra.
No agregues introducción, contexto ni transiciones propias.

# Tu rol
- Conversar con el paciente.
- Llamar a 'consultarExamen' para saber qué decir y qué hacer en el examen.
- Enviar lo que dijo el paciente como texto libre (sin clasificar clínicamente).
- El foróptero y la pantalla se controlan solos; vos solo hablás.

# consultarExamen — qué enviar
| Situación | Parámetros |
|-----------|------------|
| Inicio de la conversación | Sin parámetros (body vacío) |
| Paciente acaba de hablar | respuestaPaciente (texto fiel) + confianza (0 a 1) |
| contextoVoz era continuar_sin_respuesta y ya dijiste todos los mensajes | Sin parámetros |

# confianza
- Qué tan seguro estás de haber entendido bien el audio (no es juicio médico).
- Si no entendiste bien: bajá confianza (ej. 0.4) o pedí que repita antes de llamar.
- Si entendiste bien: 0.85–1.0.

# contextoVoz (viene en la respuesta del backend)
| Valor | Qué hacer |
|-------|-----------|
| esperar_respuesta | Decí los mensajes y esperá al paciente; luego llamá con su texto |
| continuar_sin_respuesta | Decí todos los mensajes; después llamá consultarExamen sin parámetros |
| inicio | Igual que primer turno: decí mensajes y seguí contextoVoz |

# Flujo
1. Al arrancar, llamá consultarExamen una vez sin parámetros.
2. Decí en orden todos los pasos tipo hablar.
3. Si contextoVoz es continuar_sin_respuesta: después de hablar, llamá de nuevo sin parámetros.
4. Si contextoVoz es esperar_respuesta: esperá al paciente y llamá con respuestaPaciente + confianza.
5. Repetí.

# Prohibido
- Inventar mensajes al paciente.
- Enviar interpretaciones clínicas estructuradas (correcta/incorrecta/etc.); solo texto del paciente.
- Llamar consultarExamen otra vez antes de haber dicho los mensajes del turno actual (salvo que no haya mensajes).
- Guardar estado del examen; el servidor lo maneja.
`;

/** Solo lo que el agente de voz necesita; evita sesgar transcripción (p. ej. letra en pantalla). */
function respuestaTurnoParaAgenteVoz(data: Record<string, unknown>) {
  if (data.ok !== true) {
    return data;
  }
  return {
    ok: true,
    pasos: Array.isArray(data.pasos) ? data.pasos : [],
    contextoVoz: data.contextoVoz
  };
}

export const chatAgent = new RealtimeAgent({
  name: 'Oftalmólogo Virtual',
  instructions: INSTRUCCIONES_BASE_CHATAGENT,
  voice: 'alloy',
  tools: [
    tool({
      name: 'consultarExamen',
      description:
        'Consulta al backend del examen visual. Devuelve mensajes para decir al paciente y contextoVoz. Si el paciente respondió, enviá respuestaPaciente (texto libre) y confianza de captura (0-1). Sin parámetros al iniciar o cuando contextoVoz indica continuar_sin_respuesta tras haber pronunciado los mensajes.',
      parameters: {
        type: 'object',
        properties: {
          respuestaPaciente: {
            type: 'string',
            nullable: true,
            description:
              'Lo que dijo el paciente, lo más literal posible. Solo si acaba de responder.'
          },
          confianza: {
            type: 'number',
            nullable: true,
            description:
              'Confianza en la captura del audio (0-1). Opcional; default 1 si omitido.'
          }
        },
        required: [],
        additionalProperties: false
      },
      execute: async (input) => {
        const args = input as {
          respuestaPaciente?: string | null;
          confianza?: number | null;
        };
        const body: Record<string, unknown> = {};
        if (
          args.respuestaPaciente != null &&
          String(args.respuestaPaciente).trim() !== ''
        ) {
          body.respuestaPaciente = String(args.respuestaPaciente).trim();
          if (typeof args.confianza === 'number' && !Number.isNaN(args.confianza)) {
            body.confianza = args.confianza;
          }
        }

        try {
          const response = await fetch(`${ORCHESTRATOR_URL}/api/examen/turno`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          const data = await response.json();
          if (!response.ok) {
            return {
              ok: false,
              msg: data.error || response.statusText
            };
          }
          return respuestaTurnoParaAgenteVoz(
            data as Record<string, unknown>
          );
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          return { ok: false, msg: `Error de conexión: ${message}` };
        }
      }
    })
  ],
  handoffs: []
});

export const chatSupervisorScenario = [chatAgent];
export const chatSupervisorCompanyName = 'Oftalmólogo Virtual';

export default chatSupervisorScenario;
