# Panel Framer — QA del pipeline multi-agente

Code component: `ForopteroControl.tsx`  
Publicado en: [foroptero.framer.website/controlpanel](https://foroptero.framer.website/controlpanel)

## Qué hace

- **Observa** el examen en curso y puede **inicializar** una sesión vacía (`POST /api/examen/nuevo`).
- Polling cada 1,5 s a `GET /api/examen/detalle` del orquestador.
- Muestra por turno: `razonamientoInterno`, bloques por agente y acciones MQTT.
- Resalta turnos con auditor **rechazado**.
- Botón **Iniciar examen** → `POST /api/examen/nuevo`.
- Controles manuales Run / Clear / Set Home contra el mismo orquestador.

## Backend

| Entorno | URL |
|---------|-----|
| Producción | `https://oftalmagentv2-production.up.railway.app` |
| Local | `http://localhost:3001` (cambiar `ORCHESTRATOR_URL` en el `.tsx`) |

Debe ser la **misma instancia** que `NEXT_PUBLIC_FOROPTERO_ORCHESTRATOR_URL` en la app de voz.

## Publicar en Framer

1. Abrir el proyecto Framer del panel de control.
2. Editar el Code Component y pegar el contenido de `ForopteroControl.tsx`.
3. Preview en `/controlpanel` — consola sin errores CORS.
4. **Publish** el sitio.

## Prueba E2E

1. Abrir [controlpanel](https://foroptero.framer.website/controlpanel).
2. Iniciar conversación en la app de voz (mismo orquestador).
3. Verificar mini-card (ojo, logMAR, letra) y turnos que crecen con auto-scroll.
4. Comparar un turno con `curl https://oftalmagentv2-production.up.railway.app/api/examen/detalle`.

## Timing en el panel

Cada turno muestra `timingMs.total` (suma de agentes). Tras el paralelismo auditor/comunicación en el orquestador, conviene interpretar **`timingMs.totalWallClock`** (si está en el JSON del historial) como latencia real del pipeline LLM en ese turno.

Ejemplo: `total` puede ser ~11 s mientras `totalWallClock` es ~9,5 s cuando comunicación (~7,9 s) corrió en paralelo con auditor (~2,4 s). Ver [docs/API.md](../docs/API.md) y [docs/ORQUESTADOR.md](../docs/ORQUESTADOR.md#orquestación-y-latencia).

## CORS

Si el panel no carga datos, en la consola del navegador verificar bloqueo CORS desde `https://foroptero.framer.website`. El orquestador usa `cors()` abierto; si falla, revisar despliegue Railway.
