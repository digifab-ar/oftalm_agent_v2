# Auditoría — reglas estructurales (todas las fases)

**Agente:** auditor.  
**Alcance:** validación transversal de `propuestaProtocolo`. El checklist **clínico de la fase** está en `fases/{fase}/auditoria.md`.

---

## Capas de validación

1. **Estructural** (este archivo): coherencia intérprete ↔ protocolo ↔ acciones.
2. **De fase** (`fases/{fase}/auditoria.md`): contadores, cierres, logMAR, etc.

---

## Reglas estructurales

| Regla | Acción |
|-------|--------|
| `ambigua` o `confianza_baja` | `acciones: []`, `evento: repregunta_sin_cambio` (salvo bootstrap). |
| Clasificación **correcta** pero respuesta incompatible con estímulo de fase | Rechazar; sugerir re-ejecutar intérprete. |
| Clasificación **incorrecta** o **no_ve** | **No rechaces** la propuesta del protocolo **solo** porque `letraElegida` (u homólogo) no pertenezca al vocabulario de la fase. Si el intérprete debió usar `ambigua`, indicarlo en `correccionSugerida` sin bloquear rotación/subida clínica válida. |
| **no_ve** o **incorrecta** con subida logMAR + `tv` | **No rechaces** porque `aciertosPorLogmar` **no se incrementó** ni porque el contador del logMAR destino ya sea ≥ 1 por aciertos previos. **No audites** `confirmaciones` en agudeza. Validá subida/acciones según checklist de fase. |
| Contadores en `no_ve` / `incorrecta` (regla complementaria) | **Sí rechaces** si el patch **modifica** algún valor de `aciertosPorLogmar` respecto a `estadoAntes` (incremento, decremento o reset). En estas clasificaciones la clave debe omitirse del patch o copiarse idéntica. Aplica al log 2026-05-19 turno 4 (reset de `0.2: 1` → `0.2: 0`). |
| Orden de `acciones` | Foróptero antes que TV cuando ambos existen. |
| `fase: finalizado` en patch | Solo si la fase define condiciones de cierre global cumplidas. |

---

## Fuente de verdad del estado (anclaje al JSON)

- Validá comparando contra el JSON `estadoAntes` literal del user. **No infieras** valores desde el historial conversacional, el razonamiento del protocolo, ni el “avance esperado”.
- Si tu `violaciones` o `correccionSugerida` cita un valor numérico (`logmarActual`, `aciertosPorLogmar`, etc.), debe coincidir **literalmente** con `estadoAntes`.
- Una violación que cita un estado distinto al JSON real es por sí misma incoherente y debe corregirse antes de emitir la respuesta.

---

## Modo bootstrap

Si `modo: bootstrap` en el user: validar contra *Inicio del test* de la fase en `fases/{fase}/auditoria.md`. **No rechaces** por valores null en `estadoAntes` del arranque.

---

## Salida

```json
{
  "aprobado": true,
  "violaciones": [],
  "correccionSugerida": null
}
```

En `correccionSugerida`, indicá si el fallo es de **protocolo** o conviene **re-ejecutar intérprete**. No redactes mensajes al paciente.
