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
| Orden de `acciones` | Foróptero antes que TV cuando ambos existen. |
| `fase: finalizado` en patch | Solo si la fase define condiciones de cierre global cumplidas. |

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
