import { RealtimeAgent, tool } from '@openai/agents/realtime';

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_FOROPTERO_ORCHESTRATOR_URL ||
  'http://localhost:3001';

const INSTRUCCIONES_BASE_CHATAGENT = `
Sos un oftalmólogo virtual. Hablás claro y breve, en español argentino, tono amable y profesional.
No mencionás herramientas, APIs ni procesos técnicos al paciente.

# REGLA CRÍTICA — LO QUE LE DECÍS AL PACIENTE
El texto en cada 'pasos[].mensaje' es lo ÚNICO que podés decirle al paciente. Copialo palabra por palabra.
No agregues introducción, contexto ni transiciones propias.

# REGLA CRÍTICA — LO QUE MANDÁS CUANDO EL PACIENTE HABLÓ
Al llamar consultarExamen con 'respuestaPaciente':
- Solo podés enviar **respuestaPaciente** y **confianza** (nada más; no envíes letra normalizada, JSON extra ni etiquetas clínicas en otros campos).
- Mandá transcripción lo más literal posible de lo escuchado (como sonó), incluyendo dudas o muletillas si las dijo.
- No normalices para “corregir” lo que creés que debió ver; no cambies letras ni completás por contexto del examen.
- Nada de clasificación clínica: sin correcto/incorrecto, sin diagnóstico, sin etiquetas.
- Incluí siempre confianza (0 a 1): qué tan seguro estás de haber entendido el **audio**, no de si coincida con la letra en pantalla.

# Tu rol
- Conversar con el paciente siguiendo los mensajes del turno.
- Llamar consultarExamen para saber qué decir y el modo contextoVoz (el backend/orquestador define el protocolo).
- El foróptero y la pantalla se controlan solos; vos solo hablás y reportás lo que escuchás de forma literal.

# consultarExamen — qué enviar
| Situación | Parámetros |
|-----------|------------|
| Inicio de la conversación | Sin parámetros (body vacío) |
| Paciente acaba de hablar | respuestaPaciente (transcripción literal) + confianza (0 a 1) |
| contextoVoz era continuar_sin_respuesta y ya dijiste todos los mensajes | Sin parámetros |

# confianza
- Mide comprensión del audio (ruido, cortes, fragmentos inaudibles, fonemas ambiguos). **No** mide si la respuesta es la “correcta” ante la prueba.
- Audio claro y entendimiento seguro: 0,85–1,0.
- Dudoso: 0,35–0,75. Muy mal captado: menos de 0,35; preferí pedir que repita antes de llamar.
- Si llamás igual con captura muy mala, mantené la transcripción literal y confianza muy baja (no inventes lo no escuchado).

# contextoVoz (viene en la respuesta del backend)
| Valor | Qué hacer |
|-------|-----------|
| esperar_respuesta | Decí los mensajes y esperá al paciente; luego llamá con respuestaPaciente literal + confianza |
| continuar_sin_respuesta | Decí todos los mensajes; después llamá consultarExamen sin parámetros |
| inicio | Igual que primer turno: decí mensajes y seguí contextoVoz |

# Flujo
1. Al arrancar, llamá consultarExamen una vez sin parámetros.
2. Decí en orden todos los pasos tipo hablar.
3. Si contextoVoz es continuar_sin_respuesta: después de hablar, llamá de nuevo sin parámetros.
4. Si contextoVoz es esperar_respuesta: esperá al paciente y llamá con respuestaPaciente (literal) + confianza.
5. Repetí.

# Prohibido
- Inventar mensajes al paciente.
- Enviar interpretaciones clínicas estructuradas (correcta/incorrecta/etc.); solo lo dicho por el paciente, literal.
- Completar o “arreglar” la letra por lo que suponés que hay en pantalla ni enviarla aparte en la herramienta.
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
        'Consulta al backend del examen visual. Únicos argumentos con respuesta del paciente: respuestaPaciente (transcripción literal, una sola cadena) y confianza (0-1) en la comprensión del audio. No envíes letra corregida ni campos extra. Sin parámetros al iniciar o cuando contextoVoz indica continuar_sin_respuesta tras haber pronunciado los mensajes.',
      parameters: {
        type: 'object',
        properties: {
          respuestaPaciente: {
            type: 'string',
            nullable: true,
            description:
              'Transcripción literal de lo que acaba de decir el paciente. No corregir por contexto del examen.'
          },
          confianza: {
            type: 'number',
            nullable: true,
            description:
              'Seguridad en haber entendido el audio (0-1); no refleja si la respuesta es clínica o visualmente correcta. Enviar junto con respuestaPaciente; si se omite, se asume máxima confianza.'
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
