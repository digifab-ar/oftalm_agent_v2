import { RealtimeAgent, tool } from '@openai/agents/realtime';

const supervisorAgent = new RealtimeAgent({
  name: 'Oftalmólogo Virtual',
  voice: 'alloy',
  instructions: `Domain-Specific Agent Instructions

Eres un profesional oftalmólogo que se comunica en español argentino, con un tono clínico, amable y claro.
Tu función es guiar al paciente durante un examen visual automatizado realizado con un foróptero digital y una TV de optotipos.


Sigue estas pautas:
- Habla con claridad, usando un tono tranquilo y profesional.
- No menciones nunca comandos, endpoints ni términos técnicos.
- Cuando termines el examen, informá el resultado con una breve conclusión clínica.

**Nunca comandos, ni nombres de etapas.**  
Tus salidas textuales deben sonar como respuestas clínicas breves y naturales, no técnicas.  

---

## ETAPA 1 — Recolección de datos iniciales

**Objetivo:** recibir los valores promedio del autorrefractómetro para cada ojo.  
Formato:  
\`<R> +0.75 , -1.75 , 60 / <L> +2.75 , 0.00 , 0\`

**Acciones permitidas:**
1. Preguntar por los valores iniciales del autorrefractómetro al paciente, ofreciendo que lo escriba en el chat.
2. Leer y validar los tres valores de cada ojo: esfera, cilindro, eje.

**Mensaje inicial**
"Hola, escribe los valores del autorefractómetro antes de iniciar el Test".
"Ejemplo de formato: <R> +0.75 , -1.75 , 60 / <L> +2.75 , 0.00 , 0".

**Ejemplos de respuestas**
"Perfecto, los valores son .... , ¿es correcto?".
"Bien, ahora vamos a iniciar el examen visual".

---

## ETAPA 2 — Cálculo de valores iniciales

**Objetivo:** recalcular los valores cilíndricos según las reglas clínicas.  

**Lógica:**
- Si el cilindro está entre -0.50 y -2.00 → sumar +0.50 (menos negativo).  
- Si está entre -2.25 y -4.00 → sumar +0.75.  
- Si está entre -4.25 y -6.00 → sumar +1.50.  
- Si es 0 o -0.25 → mantener igual.  
- Si es menor a -6.00 → mantener valor original.  

**Acciones permitidas:**
1. Calcular los valores iniciales recalculados según las reglas clínicas.
2. Vervalizar los valores recalculados.

**Ejemplos de respuestas**
"Recalcule los valores iniciales según las reglas clínicas, los valores son .... Proseguimos con el test".

---

## ETAPA 3 — Definición de secuencia de tests

**Objetivo:** establecer los pasos del examen según los valores iniciales.  

**Lógica:*
- Siempre se inicia con la agudeza visual derecha.
- Continuar con agudeza visual izquierda.

**Acciones permitidas:**
1. Definir la secuencia de tests según la lógica.
2. Vervalizar los la secuencia de tests.

**Ejemplos de respuestas**
"El test se inicia con la agudeza visual derecha, luego con la agudeza visual izquierda".


---

## ETAPA 4.1 — Test de Agudeza Visual

**Objetivo:** determinar el valor LogMAR con el que el paciente ve con comodidad.  

**Lógica:**
- Antes de iniciar el test, se debe ajustar el foróptero al valor recalculado de la esfera para cada ojo.
- Llamar a la tool enviarComandoForoptero para ajustar el foróptero al valor recalculado de la esfera para cada ojo.
- Usar letras Sloan (C, D, H, K, N, O, R, S, V, Z).  
- Comenzar con LogMAR 0.4.  
- Si ve bien, reducir (0.3 → 0.2 → 0.1 → 0.0).  
- Si no ve, aumentar (0.5 → 0.6 → 1.0 → 2.0).  
- Debe haber una doble confirmación positiva sobre un valor logmar para dar un resultado. 
- La intención es llegar al valor más pequeño posible (ej: 0.0) que vea con comodidad.
- Si llega a ver 0.0 , cambiar la letra manteniendo el valor logmar para verificar agudeza. 
- Nunca mostrar dos veces la misma letra consecutivamente. 
- Nunca mostrar dos veces el mismo tamaño logmar consecutivamente. (salvo excepcion en 0.0)

**Acciones permitidas:**
1. Llamar a la tool consultarEstadoForoptero para verificar el estado del foróptero.
2. Si el foróptero está ocupado, esperar a que termine el movimiento.
3. Si el foróptero está listo, ajustar el foróptero al valor recalculado de la esfera para cada ojo.
4. Llamar a la tool enviarComandoForoptero para ajustar el foróptero al valor recalculado de la esfera para cada ojo.
5. Llamar a la tool enviarComandoTV para ajustar a la letra "H" en 0.4 como valor inicial.
6. Llamar a la tool consultarEstadoForoptero para verificar el estado del foróptero.
7. Si el foróptero está ocupado, esperar a que termine el movimiento.
8. Si el foróptero está listo, iniciar el test de agudeza visual.
9. Preguntar al paciente que letra ve.
10. Modificar la letra y el valor logmar mediante la tool enviarComandoTV a partir de la respuesta que se recibe del paciente evaluando la lógica del test de agudeza visual.
11. Encontrar el valor logmar que el paciente ve con comodidad.
12. Nunca verbalizar la letra y el valor logmar.
13. Entregar un resultado parcial por cada ojo.
14. Nunca llamar dos veces seguidas la tool enviarComandoTV.
15. Al iniciar el examen del ojo izquierdo volver a la letra "H" en 0.4 antes de consultarle que letra ve.

**Ejemplos de respuestas y mensajes:**
> "Bien, te pido que mires a la pantalla, te voy a estar mostrando una serie de letras, vos inidicame que letra ves."
> "Perfecto, ahora decime si podes ver la letra en la pantalla."
> "Ahora, ¿podes ver la letra cómodamente?"
> "Perfecto. Siguamos trabajando con esta letra."
> " El resultado es 0.4 para el ojo derecho."

**Ejemplo de camino posible**
0.4 | Ok -> 0.3 | Ok -> 0.2 | Ok -> 0.1 | Ok -> 0.0 | Nok -> 0.1 | Ok => Resultado 0.1

---

## MODO CLÍNICO DIRECTO — REGLAS GLOBALES

- No describas tus pasos internos ni menciones comandos.  
- No uses frases como "Ahora pasaré a..." o "He definido la secuencia...".  
- Respondé con frases clínicas concisas, naturales y en español argentino.  
- Las confirmaciones deben sonar humanas:  
- "Perfecto, veamos el siguiente valor."  
- "Muy bien, esa lente parece más cómoda."  


Fin de Instrucciones`,
  tools: [
    tool({
      name: 'enviarComandoForoptero',
      description: 'Envía un comando de ajuste completo al foróptero digital. Puede ajustar el ojo derecho (R), izquierdo (L) o ambos. Permite configurar esfera, cilindro, ángulo y oclusión para cada ojo. Retorna el estado actual del foróptero (busy mientras se mueve, ready cuando termina).',
      parameters: {
        type: 'object',
        properties: {
          R: {
            type: 'object',
            description: 'Configuración para ojo derecho',
            properties: {
              esfera: { type: 'number', description: 'Valor esférico' },
              cilindro: { type: 'number', description: 'Valor cilíndrico' },
              angulo: { type: 'number', description: 'Ángulo del cilindro (0-180)' },
              occlusion: { 
                type: 'string', 
                enum: ['open', 'close'],
                description: 'Estado de oclusión: "open" para abierto, "close" para cerrado'
              }
            },
            required: [],
            additionalProperties: false
          },
          L: {
            type: 'object',
            description: 'Configuración para ojo izquierdo',
            properties: {
              esfera: { type: 'number', description: 'Valor esférico' },
              cilindro: { type: 'number', description: 'Valor cilíndrico' },
              angulo: { type: 'number', description: 'Ángulo del cilindro (0-180)' },
              occlusion: { 
                type: 'string', 
                enum: ['open', 'close'],
                description: 'Estado de oclusión: "open" para abierto, "close" para cerrado'
              }
            },
            required: [],
            additionalProperties: false
          }
        },
        required: [],
        additionalProperties: false
      },
      execute: async (input: any) => {
        const { R, L } = input as { 
          R?: { esfera?: number; cilindro?: number; angulo?: number; occlusion?: 'open' | 'close' };
          L?: { esfera?: number; cilindro?: number; angulo?: number; occlusion?: 'open' | 'close' };
        };

        // Construir el payload según la estructura requerida
        const payload: { 
          accion: string; 
          R?: { esfera?: number; cilindro?: number; angulo?: number; occlusion?: string };
          L?: { esfera?: number; cilindro?: number; angulo?: number; occlusion?: string };
        } = {
          accion: 'movimiento'
        };

        if (R !== undefined) {
          const rConfig: { esfera?: number; cilindro?: number; angulo?: number; occlusion?: string } = {};
          if (R.esfera !== undefined) rConfig.esfera = R.esfera;
          if (R.cilindro !== undefined) rConfig.cilindro = R.cilindro;
          if (R.angulo !== undefined) rConfig.angulo = R.angulo;
          if (R.occlusion !== undefined) rConfig.occlusion = R.occlusion;
          
          // Solo incluir R si tiene al menos un campo
          if (Object.keys(rConfig).length > 0) {
            payload.R = rConfig;
          }
        }

        if (L !== undefined) {
          const lConfig: { esfera?: number; cilindro?: number; angulo?: number; occlusion?: string } = {};
          if (L.esfera !== undefined) lConfig.esfera = L.esfera;
          if (L.cilindro !== undefined) lConfig.cilindro = L.cilindro;
          if (L.angulo !== undefined) lConfig.angulo = L.angulo;
          if (L.occlusion !== undefined) lConfig.occlusion = L.occlusion;
          
          // Solo incluir L si tiene al menos un campo
          if (Object.keys(lConfig).length > 0) {
            payload.L = lConfig;
          }
        }

        // Validar que al menos uno de los ojos tenga configuración válida
        if (payload.R === undefined && payload.L === undefined) {
          return { 
            ok: false, 
            msg: 'Debe especificarse al menos un parámetro válido para R (ojo derecho) o L (ojo izquierdo)' 
          };
        }

        try {
          const response = await fetch('https://foroptero-production.up.railway.app/api/movimiento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Error en respuesta del servidor:', errorText);
            return { ok: false, msg: `Error del servidor: ${errorText}` };
          }

          const data = await response.json();
          console.log('✅ Comando foróptero enviado:', data);
          
          // Retornar el estado recibido (puede ser "busy" o "ready")
          return { 
            ok: true, 
            msg: `Comando enviado. Estado: ${data.status}`,
            status: data.status,
            timestamp: data.timestamp,
            R: data.R,
            L: data.L
          };

        } catch (error: any) {
          console.error('⚠️ Error enviando comando al foróptero:', error);
          return { ok: false, msg: `Error de conexión: ${error.message}` };
        }
      }
    }),
    tool({
      name: 'consultarEstadoForoptero',
      description: 'Consulta el estado actual del foróptero digital mediante GET. Retorna "busy" si está realizando un movimiento o "ready" si está listo para recibir un nuevo comando, junto con los valores actuales de las lentes.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      },
      execute: async () => {
        try {
          const response = await fetch('https://foroptero-production.up.railway.app/api/movimiento', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Error consultando estado del foróptero:', errorText);
            return { ok: false, msg: `Error del servidor: ${errorText}` };
          }

          const data = await response.json();
          console.log('✅ Estado del foróptero consultado:', data);
          
          return { 
            ok: true, 
            msg: `Estado: ${data.status}`,
            status: data.status,
            timestamp: data.timestamp,
            R: data.R,
            L: data.L
          };

        } catch (error: any) {
          console.error('⚠️ Error consultando estado del foróptero:', error);
          return { ok: false, msg: `Error de conexión: ${error.message}` };
        }
      }
    }),
    tool({
      name: 'enviarComandoTV',
      description: 'Envía un comando HTTP POST al servidor para mostrar una letra en la TV de optotipos.',
      parameters: {
        type: 'object',
        properties: {
          letra: { type: 'string', description: 'Letra a mostrar en la pantalla' },
          logmar: { type: 'number', description: 'Valor logMAR correspondiente a la escala del test visual' }
        },
        required: ['letra', 'logmar'],
        additionalProperties: false
      },
      execute: async (input: any) => {
        const { letra, logmar } = input as { letra: string; logmar: number };
    
        const payload = {
          dispositivo: 'pantalla',
          accion: 'mostrar',
          letra,
          logmar,
          token: 'foropteroiñaki2022#'
        };
    
        try {
          const response = await fetch('https://foroptero-production.up.railway.app/api/pantalla', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
    
          if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Error en respuesta del servidor:', errorText);
            return { ok: false, msg: `Error del servidor: ${errorText}` };
          }
    
          const data = await response.json();
          console.log('✅ Comando enviado correctamente:', data);
          return { ok: true, msg: `Letra ${letra} mostrada con logMAR ${logmar}`, response: data };
    
        } catch (error: any) {
          console.error('⚠️ Error enviando comando a la TV:', error);
          return { ok: false, msg: `Error de conexión: ${error.message}` };
        }
      }
    }),
    
  ],
  handoffs: []
});

export default supervisorAgent;
