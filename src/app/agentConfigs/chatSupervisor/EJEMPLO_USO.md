# Ejemplos de Uso - Estrategias de Optimización

## Estrategia 1: Instrucciones Modulares (RECOMENDADA)

### Implementación Simple

```typescript
// En src/app/agentConfigs/chatSupervisor/index.ts
import { RealtimeAgent } from '@openai/agents/realtime';
import supervisorAgentOptimized from './supervisorAgentOptimized'; // ← Cambiar aquí

export const chatAgent = new RealtimeAgent({
  name: 'Viejo',
  instructions: `...`, // Tu prompt actual
  voice: 'alloy',
  handoffs: [supervisorAgentOptimized] // ← Usar el optimizado
});

export const chatSupervisorScenario = [supervisorAgentOptimized, chatAgent];
```

**¡Eso es todo!** El modelo automáticamente usará la herramienta `obtenerInstruccionesEtapa` cuando necesite contexto específico.

### Cómo Funciona

1. El modelo inicia con instrucciones base reducidas (~200 tokens)
2. Cuando necesita protocolo de una etapa específica, llama a `obtenerInstruccionesEtapa('1')`
3. La herramienta devuelve solo las instrucciones de esa etapa
4. El modelo continúa con el contexto necesario

### Monitoreo

Puedes ver en los logs cuando se llama la herramienta:
```
✅ Tool call: obtenerInstruccionesEtapa({ etapa: '1' })
✅ Response: { ok: true, etapa: '1', instrucciones: '...' }
```

---

## Estrategia 2: Actualización Dinámica

### Implementación Completa

```typescript
// En src/app/App.tsx
import { useDynamicInstructions } from './hooks/useDynamicInstructions';
import { construirInstruccionesCompletas } from './agentConfigs/chatSupervisor/instructionsModular';

function App() {
  // ... código existente ...
  
  const { sendEvent } = useRealtimeSession({...});
  const [sessionStatus, setSessionStatus] = useState('DISCONNECTED');
  
  // Función para detectar la etapa actual desde el transcript
  const detectCurrentStage = useCallback(() => {
    // Ejemplo: detectar por palabras clave en el transcript
    const transcript = getTranscript(); // Tu función para obtener transcript
    
    if (transcript.includes('autorrefractómetro') || transcript.includes('valores iniciales')) {
      return '1';
    }
    if (transcript.includes('recalcular') || transcript.includes('valores recalculados')) {
      return '2';
    }
    if (transcript.includes('secuencia') || transcript.includes('agudeza visual derecha')) {
      return '3';
    }
    if (transcript.includes('LogMAR') || transcript.includes('letra')) {
      return '4';
    }
    
    return null;
  }, []);

  // Usar el hook
  const { updateInstructionsForStage } = useDynamicInstructions({
    sendEvent,
    sessionStatus,
    detectCurrentStage
  });

  // O actualizar manualmente cuando detectes un cambio
  const handleStageChange = (newStage: string) => {
    updateInstructionsForStage(newStage);
  };

  // ... resto del código ...
}
```

### Actualización Manual

Si prefieres controlar cuándo actualizar:

```typescript
const actualizarInstrucciones = (etapa: string) => {
  const instrucciones = construirInstruccionesCompletas([etapa]);
  
  sendEvent({
    type: 'session.update',
    session: {
      instructions: instrucciones
    }
  });
};

// Llamar cuando cambies de etapa
actualizarInstrucciones('2'); // Cambiar a etapa 2
```

---

## Comparación de Tokens

### Escenario: Examen completo (4 etapas)

**Original:**
- Inicial: ~1500 tokens
- Total: ~1500 tokens

**Estrategia 1 (Modular):**
- Inicial: ~200 tokens
- Consultas de etapa: ~300 tokens × 4 = 1200 tokens
- Total: ~1400 tokens (ahorro: ~7%)

**Estrategia 2 (Dinámica):**
- Inicial: ~200 tokens
- Actualizaciones: ~300 tokens × 3 = 900 tokens (3 cambios)
- Total: ~1100 tokens (ahorro: ~27%)

**Nota:** Los ahorros reales dependen de cuántas veces se consulten/actualicen las instrucciones.

---

## Respuestas a Preguntas Frecuentes

### ¿Puedo usar un agente ya entrenado?

**Respuesta corta:** No directamente con Realtime API, pero hay alternativas.

**Opciones:**

1. **Assistants API + Proxy**
   ```typescript
   // Crear assistant una vez
   const assistant = await openai.beta.assistants.create({
     name: "Oftalmólogo Virtual",
     instructions: instruccionesCompletas,
     model: "gpt-4o",
     tools: [...]
   });
   
   // Usar en un proxy que traduzca entre Realtime y Assistants
   // (Requiere implementación personalizada)
   ```

2. **Fine-tuning (no recomendado para este caso)**
   - Fine-tuning cambia el comportamiento fundamental del modelo
   - Para instrucciones específicas, el prompt es más eficiente
   - Fine-tuning es útil para estilo de respuesta, no para protocolos

3. **Híbrido: Realtime + Assistants**
   - Realtime para conversación de voz
   - Assistants para decisiones complejas o validaciones
   - El agente de Realtime llama a Assistants cuando necesita lógica compleja

### ¿session.update envía todo el prompt cada vez?

**No.** `session.update` solo actualiza los campos que especifiques:

```typescript
// Solo actualiza turn_detection (código actual)
sendEvent({
  type: 'session.update',
  session: {
    turn_detection: {...}
  }
});

// Si actualizas instructions, solo envía eso
sendEvent({
  type: 'session.update',
  session: {
    instructions: nuevasInstrucciones
  }
});
```

### ¿Cuándo se envían las instrucciones?

Las instrucciones se envían:
1. **Al crear la sesión** (en `RealtimeSession` constructor)
2. **Al hacer session.update con instructions** (si lo implementas)

NO se envían en cada `session.update` que solo cambia `turn_detection`.

---

## Recomendación Final

**Para tu caso de uso, usa ESTRATEGIA 1 (Modular):**

✅ Mayor simplicidad  
✅ No requiere cambios en el cliente  
✅ Ahorro de tokens significativo  
✅ Fácil de mantener  

Si después necesitas más control o el examen crece mucho, considera migrar a Estrategia 2 o 3.

