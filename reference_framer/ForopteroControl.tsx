import { useState, useEffect, useRef } from "react"

// Misma instancia que NEXT_PUBLIC_FOROPTERO_ORCHESTRATOR_URL en la app de voz.
// Local: http://localhost:3001
const ORCHESTRATOR_URL = "https://oftalmagentv2-production.up.railway.app"

const API_ESTADO = `${ORCHESTRATOR_URL}/api/estado`
const API_DETALLE = `${ORCHESTRATOR_URL}/api/examen/detalle`
const API_MOVIMIENTO = `${ORCHESTRATOR_URL}/api/movimiento`

type AgudezaOjo = {
    logmarActual?: number | null
    letraActual?: string | null
    logmarFinal?: number | null
    letraFinal?: string | null
}

type DetalleExamen = {
    fase?: string
    ojoActual?: string
    agudeza?: { R?: AgudezaOjo; L?: AgudezaOjo }
    iniciado?: number
    finalizado?: number | null
    historial?: TurnoHistorial[]
}

type TurnoHistorial = {
    ts?: string
    respuestaPaciente?: string | null
    confianza?: number
    modoTurno?: string
    mensajesEmitidos?: string[]
    contextoVozEmitido?: string
    razonamientoInterno?: string
    interpretacion?: {
        clasificacion?: string
        notasInterprete?: string
        letraElegida?: string | null
        letrasCandidatas?: string[]
    }
    propuestaProtocolo?: {
        evento?: string
        razonamientoProtocolo?: string
        detalleEvento?: { motivo?: string }
        estadoPatch?: Record<string, unknown>
        acciones?: AccionDispositivo[]
    }
    auditoria?: {
        aprobado?: boolean
        violaciones?: string[]
        correccionSugerida?: string | null
    }
    comunicacion?: {
        razonamientoComunicacion?: string
        contextoVoz?: string
    }
    acciones?: AccionDispositivo[]
}

type AccionDispositivo = {
    dispositivo?: string
    letra?: string
    logmar?: number
    config?: { R?: Record<string, unknown>; L?: Record<string, unknown> }
}

function formatoValor(valor: unknown) {
    return valor !== null && valor !== undefined ? String(valor) : "—"
}

function formatoHora(ts?: string) {
    if (!ts) return "—"
    try {
        return new Date(ts).toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        })
    } catch {
        return ts
    }
}

function formatearAcciones(acciones?: AccionDispositivo[]) {
    if (!acciones?.length) return ["(ninguna)"]
    return acciones.map((a) => {
        if (a.dispositivo === "tv") {
            return `tv: ${a.letra ?? "?"} @ logMAR ${a.logmar ?? "?"}`
        }
        if (a.dispositivo === "foroptero") {
            const parts: string[] = []
            if (a.config?.R) parts.push(`R ${JSON.stringify(a.config.R)}`)
            if (a.config?.L) parts.push(`L ${JSON.stringify(a.config.L)}`)
            return `foróptero: ${parts.join(" | ") || "config"}`
        }
        return `${a.dispositivo ?? "?"}: ${JSON.stringify(a)}`
    })
}

function resumirPatch(patch?: Record<string, unknown>) {
    if (!patch || Object.keys(patch).length === 0) return "sin cambios"
    const ag = patch.agudeza as Record<string, AgudezaOjo> | undefined
    if (!ag) return JSON.stringify(patch)
    const partes: string[] = []
    for (const ojo of ["R", "L"]) {
        const o = ag[ojo]
        if (!o) continue
        const bits: string[] = []
        if (o.logmarActual != null) bits.push(`logMAR ${o.logmarActual}`)
        if (o.letraActual) bits.push(`letra ${o.letraActual}`)
        if (o.logmarFinal != null) bits.push(`final ${o.logmarFinal}`)
        if (bits.length) partes.push(`${ojo}: ${bits.join(", ")}`)
    }
    return partes.length ? partes.join(" · ") : JSON.stringify(patch)
}

function formatoLente(lente: {
    esfera?: number
    cilindro?: number
    angulo?: number
    occlusion?: string
} | null) {
    if (!lente) return "—"
    return `Esf ${lente.esfera?.toFixed(2)} / Cil ${lente.cilindro?.toFixed(2)} @ ${lente.angulo}° (${lente.occlusion})`
}

const layout = {
    display: "flex" as const,
    gap: 20,
    alignItems: "flex-start" as const,
    marginTop: 20,
}

const miniBox = {
    flex: 1,
    border: "1px solid #e0e0e0",
    padding: 20,
    borderRadius: 12,
    background: "#fff",
}

const btnMini = {
    padding: "6px 12px",
    fontSize: 14,
    margin: "0 6px",
    borderRadius: 6,
    border: "1px solid #ccc",
    background: "#f5f5f5",
    cursor: "pointer" as const,
}

const inputAngle = {
    width: "60px",
    padding: "6px",
    borderRadius: 6,
    border: "1px solid #aaa",
}

const selectStyle = {
    width: "100%",
    padding: "8px",
    marginTop: 4,
    borderRadius: 6,
    border: "1px solid #aaa",
}

const buttonColumn = {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: 10,
    width: 140,
}

const bigBtn = {
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    cursor: "pointer" as const,
    border: "none",
}

const seccionAgente = {
    marginTop: 10,
    padding: 10,
    background: "#f9fafb",
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 1.5,
}

const preRazonamiento = {
    margin: "10px 0 0",
    padding: 10,
    background: "#f3f4f6",
    borderRadius: 8,
    fontSize: 11,
    fontFamily: "ui-monospace, monospace",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    lineHeight: 1.45,
}

function TurnoQACard({
    turno,
    indice,
}: {
    turno: TurnoHistorial
    indice: number
}) {
    const rechazado = turno.auditoria?.aprobado === false
    const acciones = turno.acciones ?? turno.propuestaProtocolo?.acciones

    return (
        <div
            style={{
                marginBottom: 14,
                padding: 14,
                borderRadius: 10,
                border: rechazado
                    ? "2px solid #ea580c"
                    : "1px solid #e5e7eb",
                background: rechazado ? "#fff7ed" : "#fff",
            }}
        >
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                    marginBottom: 8,
                }}
            >
                <strong style={{ fontSize: 14 }}>Turno {indice + 1}</strong>
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                    {formatoHora(turno.ts)}
                </span>
                {turno.modoTurno && (
                    <span
                        style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: "#e0e7ff",
                            color: "#3730a3",
                        }}
                    >
                        {turno.modoTurno}
                    </span>
                )}
                <span
                    style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: rechazado ? "#fecaca" : "#d1fae5",
                        color: rechazado ? "#991b1b" : "#065f46",
                        fontWeight: 600,
                    }}
                >
                    Auditor: {rechazado ? "Rechazado" : "Aprobado"}
                </span>
            </div>

            <div style={{ fontSize: 13, marginBottom: 6 }}>
                <strong>Paciente:</strong>{" "}
                {turno.respuestaPaciente?.trim()
                    ? `"${turno.respuestaPaciente}"`
                    : "(sin respuesta — bootstrap / continuar)"}
                {typeof turno.confianza === "number" && (
                    <span style={{ color: "#6b7280" }}>
                        {" "}
                        · confianza {turno.confianza}
                    </span>
                )}
            </div>

            <div style={{ fontSize: 13, marginBottom: 8 }}>
                <strong>Al paciente:</strong>{" "}
                {(turno.mensajesEmitidos ?? []).join(" · ") || "—"}
                {turno.contextoVozEmitido && (
                    <span style={{ color: "#6b7280" }}>
                        {" "}
                        → {turno.contextoVozEmitido}
                    </span>
                )}
            </div>

            {turno.razonamientoInterno && (
                <div>
                    <strong style={{ fontSize: 12 }}>
                        Razonamiento (concatenado)
                    </strong>
                    <pre style={preRazonamiento}>{turno.razonamientoInterno}</pre>
                </div>
            )}

            <div style={seccionAgente}>
                <strong>Intérprete</strong>
                <div>
                    clasificación:{" "}
                    {formatoValor(turno.interpretacion?.clasificacion)}
                </div>
                {turno.interpretacion?.letraElegida != null && (
                    <div>
                        letra elegida: {turno.interpretacion.letraElegida || "—"}
                    </div>
                )}
                {(turno.interpretacion?.letrasCandidatas?.length ?? 0) > 0 && (
                    <div>
                        candidatas:{" "}
                        {turno.interpretacion!.letrasCandidatas!.join(", ")}
                    </div>
                )}
                {turno.interpretacion?.notasInterprete && (
                    <div style={{ marginTop: 4, color: "#4b5563" }}>
                        {turno.interpretacion.notasInterprete}
                    </div>
                )}
            </div>

            <div style={seccionAgente}>
                <strong>Protocolo</strong>
                <div>evento: {formatoValor(turno.propuestaProtocolo?.evento)}</div>
                {turno.propuestaProtocolo?.detalleEvento?.motivo && (
                    <div>
                        motivo: {turno.propuestaProtocolo.detalleEvento.motivo}
                    </div>
                )}
                <div>
                    patch: {resumirPatch(turno.propuestaProtocolo?.estadoPatch)}
                </div>
                {turno.propuestaProtocolo?.razonamientoProtocolo && (
                    <div style={{ marginTop: 4, color: "#4b5563" }}>
                        {turno.propuestaProtocolo.razonamientoProtocolo}
                    </div>
                )}
            </div>

            <div style={seccionAgente}>
                <strong>Auditor</strong>
                <div>aprobado: {turno.auditoria?.aprobado ? "sí" : "no"}</div>
                {(turno.auditoria?.violaciones?.length ?? 0) > 0 && (
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                        {turno.auditoria!.violaciones!.map((v, i) => (
                            <li key={i}>{v}</li>
                        ))}
                    </ul>
                )}
                {turno.auditoria?.correccionSugerida && (
                    <div style={{ marginTop: 4, color: "#b45309" }}>
                        sugerencia: {turno.auditoria.correccionSugerida}
                    </div>
                )}
            </div>

            <div style={seccionAgente}>
                <strong>Comunicación</strong>
                {turno.comunicacion?.razonamientoComunicacion ? (
                    <div style={{ marginTop: 4, color: "#4b5563" }}>
                        {turno.comunicacion.razonamientoComunicacion}
                    </div>
                ) : (
                    <div>—</div>
                )}
            </div>

            <div style={{ marginTop: 10, fontSize: 12 }}>
                <strong>Acciones</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {formatearAcciones(acciones).map((linea, i) => (
                        <li
                            key={i}
                            style={{ fontFamily: "ui-monospace, monospace" }}
                        >
                            {linea}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}

export function ForopteroControl() {
    const [rEsfera, setREsfera] = useState(0)
    const [rCilindro, setRCilindro] = useState(0)
    const [rAngulo, setRAngulo] = useState(0)
    const [rOcclusion, setROcclusion] = useState("open")

    const [lEsfera, setLEsfera] = useState(0)
    const [lCilindro, setLCilindro] = useState(0)
    const [lAngulo, setLAngulo] = useState(0)
    const [lOcclusion, setLOcclusion] = useState("open")

    const [status, setStatus] = useState("")

    const [estadoForoptero, setEstadoForoptero] = useState("...")
    const [lentesR, setLentesR] = useState<{
        esfera?: number
        cilindro?: number
        angulo?: number
        occlusion?: string
    } | null>(null)
    const [lentesL, setLentesL] = useState<{
        esfera?: number
        cilindro?: number
        angulo?: number
        occlusion?: string
    } | null>(null)

    const [detalle, setDetalle] = useState<DetalleExamen | null>(null)
    const [historial, setHistorial] = useState<TurnoHistorial[]>([])
    const [examenActivo, setExamenActivo] = useState(false)
    const [errorDetalle, setErrorDetalle] = useState<string | null>(null)
    const [seguirUltimoTurno, setSeguirUltimoTurno] = useState(true)

    const historialScrollRef = useRef<HTMLDivElement>(null)
    const historialLenRef = useRef(0)

    useEffect(() => {
        let active = true

        async function fetchEstado() {
            try {
                const res = await fetch(API_ESTADO)
                const data = await res.json()
                if (!active) return
                setEstadoForoptero(data.status || "...")
                setLentesR(data.R || null)
                setLentesL(data.L || null)
            } catch (err) {
                console.error("Error obteniendo estado del foróptero:", err)
            }
        }

        fetchEstado()
        const interval = setInterval(fetchEstado, 1500)
        return () => {
            active = false
            clearInterval(interval)
        }
    }, [])

    useEffect(() => {
        let active = true

        async function fetchDetalleExamen() {
            try {
                const res = await fetch(API_DETALLE, { method: "GET" })
                const data = await res.json()
                if (!active) return

                if (!res.ok || !data.ok) {
                    setExamenActivo(false)
                    setDetalle(null)
                    setHistorial([])
                    setErrorDetalle(
                        data?.error || "Sin examen activo en el orquestador"
                    )
                    return
                }

                const d = data.detalle as DetalleExamen
                setDetalle(d)
                setHistorial(d.historial ?? [])
                setExamenActivo(true)
                setErrorDetalle(null)
            } catch (err) {
                console.error("Error obteniendo detalle del examen:", err)
                if (active) {
                    setErrorDetalle("Error de red al consultar el orquestador")
                }
            }
        }

        fetchDetalleExamen()
        const interval = setInterval(fetchDetalleExamen, 1500)
        return () => {
            active = false
            clearInterval(interval)
        }
    }, [])

    useEffect(() => {
        const len = historial.length
        if (!seguirUltimoTurno || len === 0) {
            historialLenRef.current = len
            return
        }
        if (len > historialLenRef.current && historialScrollRef.current) {
            historialScrollRef.current.scrollTop =
                historialScrollRef.current.scrollHeight
        }
        historialLenRef.current = len
    }, [historial, seguirUltimoTurno])

    function ajustar(
        setter: (v: number) => void,
        actual: number,
        delta: number
    ) {
        setter(parseFloat((actual + delta).toFixed(2)))
    }

    async function setHome() {
        try {
            const res = await fetch(API_MOVIMIENTO, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    accion: "home",
                    R: {
                        esfera: rEsfera,
                        cilindro: rCilindro,
                        angulo: rAngulo,
                        occlusion: rOcclusion,
                    },
                    L: {
                        esfera: lEsfera,
                        cilindro: lCilindro,
                        angulo: lAngulo,
                        occlusion: lOcclusion,
                    },
                }),
            })
            const data = await res.json()
            setStatus(JSON.stringify(data, null, 2))
        } catch {
            setStatus("⚠️ Error enviando comando home")
        }
    }

    function clearAll() {
        setREsfera(0)
        setRCilindro(0)
        setRAngulo(0)
        setROcclusion("open")
        setLEsfera(0)
        setLCilindro(0)
        setLAngulo(0)
        setLOcclusion("open")
        setStatus("Valores reseteados")
    }

    async function run() {
        try {
            const res = await fetch(API_MOVIMIENTO, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    accion: "movimiento",
                    R: {
                        esfera: rEsfera,
                        cilindro: rCilindro,
                        angulo: rAngulo,
                        occlusion: rOcclusion,
                    },
                    L: {
                        esfera: lEsfera,
                        cilindro: lCilindro,
                        angulo: lAngulo,
                        occlusion: lOcclusion,
                    },
                }),
            })
            const data = await res.json()
            setStatus(JSON.stringify(data, null, 2))
        } catch {
            setStatus("⚠️ Error enviando comando")
        }
    }

    const ojo = detalle?.ojoActual ?? "—"
    const agActivo = detalle?.agudeza?.[ojo as "R" | "L"]
    const agR = detalle?.agudeza?.R
    const agL = detalle?.agudeza?.L

    return (
        <div
            style={{
                padding: 20,
                fontFamily: "Inter, sans-serif",
                position: "relative",
                maxWidth: 1200,
            }}
        >
            <div
                style={{
                    position: "absolute",
                    top: 10,
                    right: 20,
                    textAlign: "right",
                    fontSize: 15,
                    padding: "6px 10px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.9)",
                    backdropFilter: "blur(4px)",
                    color: estadoForoptero === "ready" ? "#15803d" : "#ca8a04",
                    fontFamily: "monospace",
                    lineHeight: 1.3,
                    zIndex: 999,
                }}
            >
                MQTT: {estadoForoptero}
                {estadoForoptero === "ready" && (
                    <div style={{ color: "#6b7280", fontSize: 13, marginTop: 6 }}>
                        R {formatoLente(lentesR)}
                        <br />
                        L {formatoLente(lentesL)}
                    </div>
                )}
            </div>

            <h2 style={{ marginBottom: 8 }}>Panel de Control del Foróptero</h2>
            <p
                style={{
                    margin: "0 0 24px",
                    fontSize: 13,
                    color: "#6b7280",
                    maxWidth: 720,
                }}
            >
                Observación QA del pipeline multi-agente. El examen se inicia
                desde la app de voz (mismo orquestador). Este panel no inicia ni
                reinicia exámenes.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={layout}>
                    <div style={miniBox}>
                        <h3 style={{ margin: 0 }}>Ojo Derecho (R)</h3>
                        <div style={{ marginTop: 10 }}>Esfera</div>
                        <button
                            style={btnMini}
                            onClick={() => ajustar(setREsfera, rEsfera, -0.25)}
                        >
                            -
                        </button>
                        <span>{rEsfera.toFixed(2)}</span>
                        <button
                            style={btnMini}
                            onClick={() => ajustar(setREsfera, rEsfera, 0.25)}
                        >
                            +
                        </button>
                        <div style={{ marginTop: 10 }}>Cilindro</div>
                        <button
                            style={btnMini}
                            onClick={() =>
                                ajustar(setRCilindro, rCilindro, -0.25)
                            }
                        >
                            -
                        </button>
                        <span>{rCilindro.toFixed(2)}</span>
                        <button
                            style={btnMini}
                            onClick={() =>
                                ajustar(setRCilindro, rCilindro, 0.25)
                            }
                        >
                            +
                        </button>
                        <div style={{ marginTop: 10 }}>Ángulo</div>
                        <input
                            type="number"
                            value={rAngulo}
                            onChange={(e) =>
                                setRAngulo(parseInt(e.target.value, 10) || 0)
                            }
                            style={inputAngle}
                        />
                        <div style={{ marginTop: 10 }}>Oclusión</div>
                        <select
                            style={selectStyle}
                            value={rOcclusion}
                            onChange={(e) => setROcclusion(e.target.value)}
                        >
                            <option value="open">open</option>
                            <option value="close">close</option>
                        </select>
                    </div>

                    <div style={miniBox}>
                        <h3 style={{ margin: 0 }}>Ojo Izquierdo (L)</h3>
                        <div style={{ marginTop: 10 }}>Esfera</div>
                        <button
                            style={btnMini}
                            onClick={() => ajustar(setLEsfera, lEsfera, -0.25)}
                        >
                            -
                        </button>
                        <span>{lEsfera.toFixed(2)}</span>
                        <button
                            style={btnMini}
                            onClick={() => ajustar(setLEsfera, lEsfera, 0.25)}
                        >
                            +
                        </button>
                        <div style={{ marginTop: 10 }}>Cilindro</div>
                        <button
                            style={btnMini}
                            onClick={() =>
                                ajustar(setLCilindro, lCilindro, -0.25)
                            }
                        >
                            -
                        </button>
                        <span>{lCilindro.toFixed(2)}</span>
                        <button
                            style={btnMini}
                            onClick={() =>
                                ajustar(setLCilindro, lCilindro, 0.25)
                            }
                        >
                            +
                        </button>
                        <div style={{ marginTop: 10 }}>Ángulo</div>
                        <input
                            type="number"
                            value={lAngulo}
                            onChange={(e) =>
                                setLAngulo(parseInt(e.target.value, 10) || 0)
                            }
                            style={inputAngle}
                        />
                        <div style={{ marginTop: 10 }}>Oclusión</div>
                        <select
                            style={selectStyle}
                            value={lOcclusion}
                            onChange={(e) => setLOcclusion(e.target.value)}
                        >
                            <option value="open">open</option>
                            <option value="close">close</option>
                        </select>
                    </div>

                    <div style={buttonColumn}>
                        <button
                            style={{
                                ...bigBtn,
                                background: "#000",
                                color: "#fff",
                            }}
                            onClick={run}
                        >
                            Run
                        </button>
                        <button
                            style={{
                                ...bigBtn,
                                background: "#e5e5e5",
                                color: "#000",
                            }}
                            onClick={clearAll}
                        >
                            Clear
                        </button>
                        <button
                            style={{
                                ...bigBtn,
                                background: "#444",
                                color: "#fff",
                            }}
                            onClick={setHome}
                        >
                            Set Home
                        </button>
                    </div>
                </div>

                <div
                    style={{
                        ...miniBox,
                        flex: "none",
                        width: "100%",
                        boxSizing: "border-box",
                    }}
                >
                    <h3 style={{ margin: "0 0 12px" }}>Examen en curso (QA)</h3>
                    {!examenActivo ? (
                        <p style={{ margin: 0, fontSize: 14, color: "#b45309" }}>
                            {errorDetalle ||
                                "Sin examen activo — iniciá desde la app de voz"}
                        </p>
                    ) : (
                        <div style={{ fontSize: 14, lineHeight: 1.7 }}>
                            <div>
                                <strong>Fase:</strong> {formatoValor(detalle?.fase)}
                                {detalle?.fase === "finalizado" && (
                                    <span style={{ color: "#15803d" }}>
                                        {" "}
                                        · finalizado
                                    </span>
                                )}
                            </div>
                            <div>
                                <strong>Ojo activo:</strong> {ojo}
                                {" · "}
                                <strong>logMAR:</strong>{" "}
                                {formatoValor(agActivo?.logmarActual)}
                                {" · "}
                                <strong>Letra:</strong>{" "}
                                {formatoValor(agActivo?.letraActual)}
                            </div>
                            {detalle?.iniciado != null && (
                                <div style={{ fontSize: 12, color: "#6b7280" }}>
                                    sesión iniciada:{" "}
                                    {new Date(detalle.iniciado).toLocaleString(
                                        "es-AR"
                                    )}
                                </div>
                            )}
                            <div style={{ marginTop: 8, fontSize: 13 }}>
                                <strong>R final:</strong>{" "}
                                {agR?.logmarFinal != null
                                    ? `${agR.logmarFinal} (${formatoValor(agR.letraFinal)})`
                                    : "—"}
                                {" · "}
                                <strong>L final:</strong>{" "}
                                {agL?.logmarFinal != null
                                    ? `${agL.logmarFinal} (${formatoValor(agL.letraFinal)})`
                                    : "—"}
                            </div>
                        </div>
                    )}
                </div>

                <div
                    style={{
                        ...miniBox,
                        flex: "none",
                        width: "100%",
                        boxSizing: "border-box",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 12,
                            flexWrap: "wrap",
                            gap: 8,
                        }}
                    >
                        <h3 style={{ margin: 0 }}>
                            Trazabilidad por turno ({historial.length})
                        </h3>
                        <label
                            style={{
                                fontSize: 13,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                cursor: "pointer",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={seguirUltimoTurno}
                                onChange={(e) =>
                                    setSeguirUltimoTurno(e.target.checked)
                                }
                            />
                            Seguir último turno
                        </label>
                    </div>

                    <div
                        ref={historialScrollRef}
                        style={{
                            maxHeight: "50vh",
                            overflowY: "auto",
                            paddingRight: 4,
                        }}
                    >
                        {historial.length === 0 ? (
                            <p style={{ fontSize: 13, color: "#9ca3af" }}>
                                {examenActivo
                                    ? "Aún no hay turnos registrados."
                                    : "Iniciá un examen desde la voz para ver la traza."}
                            </p>
                        ) : (
                            historial.map((turno, i) => (
                                <TurnoQACard key={turno.ts ?? i} turno={turno} indice={i} />
                            ))
                        )}
                    </div>
                </div>

                {status && (
                    <pre
                        style={{
                            fontSize: 11,
                            background: "#f3f4f6",
                            padding: 10,
                            borderRadius: 8,
                            overflow: "auto",
                        }}
                    >
                        {status}
                    </pre>
                )}
            </div>
        </div>
    )
}
