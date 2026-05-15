# Solución Simple y Elegante: Problema de Oclusión

## Análisis del Problema

Según los logs y el código:
- Cuando se pasa de `esferico_fino (L)` a `agudeza_alcanzada (L)`:
  - `necesitaInicializacion = false` (estado ya inicializado)
  - `cambioDeOjo = false` (mismo ojo)
  - NO entra en bloque de inicialización → NO configura foróptero
  - Va a "pasos normales" → Solo genera TV + Hablar

**Problema:** El foróptero necesita valores finales (esfera, cilindro, ángulo) pero NO debe cambiar la oclusión (mismo ojo).

**Regla:** La oclusión solo cambia en 3 situaciones:
1. Al setear foróptero con valores recalculados para R (inicio)
2. Al pasar de R a L (p. ej. `agudeza_alcanzada (R)` → primer test del ojo izquierdo, hoy `esferico_grueso (L)`)
3. Al pasar de L a Binocular (agudeza_alcanzada L → binocular)

## Solución Simple y Elegante

### 1. Corregir bug de oclusión invertida (líneas 1338 y 1341)

**Problema:** La lógica está invertida
```javascript
// Línea 1338 - INCORRECTO
occlusion: ojo === 'R' ? 'open' : 'close'
```

**Solución:**
```javascript
occlusion: 'open'  // El ojo del test siempre 'open'
```

```javascript
occlusion: 'close'  // El ojo opuesto siempre 'close'
```

### 2. Detectar cambio de tipo de test y configurar foróptero (sin cambiar oclusión)

**Lógica:**
- Si cambió el tipo de test (lentes → agudeza) pero NO cambió el ojo:
  - Configurar foróptero con valores correctos
  - **MANTENER la oclusión actual** (no cambiarla)

**Implementación:**
Agregar después de la evaluación de `necesitaInicializacion`:

```javascript
// Detectar cambio de tipo de test (lentes → agudeza) sin cambio de ojo
const cambioDeTipoTest = testAnterior !== null && 
                         testAnterior.tipo !== testActual.tipo &&
                         (testAnterior.tipo === 'esferico_grueso' || 
                          testAnterior.tipo === 'esferico_fino' || 
                          testAnterior.tipo === 'cilindrico' || 
                          testAnterior.tipo === 'cilindrico_angulo') &&
                         testActual.tipo === 'agudeza_alcanzada' &&
                         testAnterior.ojo === ojo; // Mismo ojo

// Si cambió el tipo de test pero no el ojo, configurar foróptero SIN cambiar oclusión
if (!necesitaInicializacion && cambioDeTipoTest) {
  if (esAgudezaAlcanzada) {
    // Configurar con valores finales, mantener oclusión actual
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
            // NO especificar occlusion - mantener la actual
          },
          // NO especificar el ojo opuesto - mantener la actual
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
    return { ok: true, pasos, ... };
  }
}
```

**Nota:** Si el comando de foróptero no especifica `occlusion`, debería mantener la actual. Si el sistema requiere especificarla, usar la lógica actual del ojo:
- `[ojo]: { ..., occlusion: 'open' }` (el ojo del test)
- `[ojo opuesto]: { occlusion: 'close' }` (el ojo opuesto)

Pero esto solo cuando realmente hay cambio de ojo.

## Implementación Final

1. **Corregir líneas 1338 y 1341:** Cambiar lógica invertida
2. **Agregar detección de cambio de tipo de test:** Después de línea 1280
3. **Configurar foróptero cuando cambia tipo de test:** Sin cambiar oclusión si mismo ojo

