import { useState, useEffect } from "react"

export function ForopteroControl() {
    const API_ESTADO = "https://foroptero-production.up.railway.app/api/estado"
    const API_REGISTRO_CSV =
        "https://foroptero-production.up.railway.app/api/examen/registro.csv"

    // ---------------- Estados del panel ----------------
    const [rEsfera, setREsfera] = useState(0)
    const [rCilindro, setRCilindro] = useState(0)
    const [rAngulo, setRAngulo] = useState(0)
    const [rOcclusion, setROcclusion] = useState("open")

    const [lEsfera, setLEsfera] = useState(0)
    const [lCilindro, setLCilindro] = useState(0)
    const [lAngulo, setLAngulo] = useState(0)
    const [lOcclusion, setLOcclusion] = useState("open")

    const [status, setStatus] = useState("")

    // ---------------- Estado del foróptero ----------------
    const [estadoForoptero, setEstadoForoptero] = useState("...")
    const [lentesR, setLentesR] = useState<any>(null)
    const [lentesL, setLentesL] = useState<any>(null)

    // ---------------- Estado del examen ----------------
    const [valoresIniciales, setValoresIniciales] = useState<any>(null)
    const [valoresRecalculados, setValoresRecalculados] = useState<any>(null)
    const [tests, setTests] = useState<any[]>([])
    const [resultados, setResultados] = useState<any>(null)
    const [estadoActual, setEstadoActual] = useState<any>(null)
    const [timestamps, setTimestamps] = useState<any>(null)
    const [modoExamen, setModoExamen] = useState("normal")

    // Polling cada 1.5 segundos
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

    // Polling de detalle del examen cada 1.5 segundos
    useEffect(() => {
        let active = true

        async function fetchDetalleExamen() {
            try {
                const res = await fetch(
                    "https://foroptero-production.up.railway.app/api/examen/detalle",
                    {
                        method: "GET",
                    }
                )
                const data = await res.json()

                if (!active) return

                if (data.ok && data.detalle) {
                    setModoExamen(data.detalle.modo || "normal")
                    setValoresIniciales(data.detalle.valoresIniciales || null)
                    setValoresRecalculados(
                        data.detalle.valoresRecalculados || null
                    )
                    setTests(data.detalle.tests || [])
                    setResultados(data.detalle.resultados || null)
                    setEstadoActual(data.detalle.estadoActual || null)
                    setTimestamps(data.detalle.timestamps || null)
                }
            } catch (err) {
                console.error("Error obteniendo detalle del examen:", err)
            }
        }

        fetchDetalleExamen()
        const interval = setInterval(fetchDetalleExamen, 1500)

        return () => {
            active = false
            clearInterval(interval)
        }
    }, [])

    const formatoLente = (lente: any) => {
        if (!lente) return "—"
        return `Esf ${lente.esfera?.toFixed(2)} / Cil ${lente.cilindro?.toFixed(2)} @ ${lente.angulo}° (${lente.occlusion})`
    }

    const formatoValor = (valor: any) => {
        return valor !== null && valor !== undefined ? valor : "N/A"
    }

    const formatearNombreTest = (tipo: string, ojo: string) => {
        const nombres: { [key: string]: string } = {
            esferico_grueso: "Esférico Grueso",
            esferico_fino: "Esférico Fino",
            cilindrico: "Cilíndrico",
            agudeza_alcanzada: "Agudeza Alcanzada",
            binocular: "Binocular",
        }
        const nombre = nombres[tipo] || tipo
        return `${nombre} (${ojo})`
    }

    const formatoRxBinocular = (lente: any) => {
        if (!lente || typeof lente !== "object") return formatoValor(lente)
        const { esfera, cilindro, angulo } = lente
        if (esfera == null) return "N/A"
        return `Esf ${Number(esfera).toFixed(2)} / Cil ${cilindro != null ? Number(cilindro).toFixed(2) : "—"} @ ${angulo ?? 0}°`
    }

    const formatearValorTest = (test: any) => {
        if (test.tipo === "binocular") {
            return `R: ${formatoRxBinocular(test.resultadoR)} / L: ${formatoRxBinocular(test.resultadoL)}`
        }
        return formatoValor(test.resultado)
    }

    // ---------------- Funciones ----------------
    function ajustar(setter, actual, delta) {
        setter(parseFloat((actual + delta).toFixed(2)))
    }

    async function setHome() {
        try {
            const res = await fetch(
                "https://foroptero-production.up.railway.app/api/movimiento",
                {
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
                }
            )

            const data = await res.json()
            setStatus(JSON.stringify(data, null, 2))
        } catch {
            setStatus("⚠️ Error enviando comando home")
        }
    }

    async function reiniciarExamen(modo = "normal") {
        try {
            setStatus(`Reiniciando examen en modo ${modo}...`)
            const res = await fetch(
                "https://foroptero-production.up.railway.app/api/examen/reiniciar",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ modo }),
                }
            )

            const data = await res.json()
            if (!res.ok || !data?.ok) {
                setStatus(
                    `⚠️ Error reiniciando examen: ${data?.error || "Error desconocido"}`
                )
                return
            }

            setStatus(`Examen reiniciado en modo ${modo}`)
        } catch {
            setStatus("⚠️ Error reiniciando examen")
        }
    }

    async function descargarRegistroCsv() {
        try {
            setStatus("Descargando registro CSV…")
            const res = await fetch(API_REGISTRO_CSV, { method: "GET" })
            if (!res.ok) {
                setStatus(`⚠️ Error al obtener CSV (${res.status})`)
                return
            }
            const blob = await res.blob()
            const cd = res.headers.get("Content-Disposition")
            let filename = "examen-registro.csv"
            const m = cd?.match(/filename="([^"]+)"/)
            if (m?.[1]) filename = m[1]
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = filename
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
            setStatus("CSV del examen descargado")
        } catch {
            setStatus("⚠️ Error descargando CSV")
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
            const res = await fetch(
                "https://foroptero-production.up.railway.app/api/movimiento",
                {
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
                }
            )
            const data = await res.json()
            setStatus(JSON.stringify(data, null, 2))
        } catch {
            setStatus("⚠️ Error enviando comando")
        }
    }

    // ---------------- Estilos UI ----------------
    const layout = {
        display: "flex",
        gap: 20,
        alignItems: "flex-start",
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
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: 140,
    }

    const bigBtn = {
        padding: 12,
        borderRadius: 8,
        fontSize: 16,
        cursor: "pointer",
        border: "none",
    }

    // ---------------- Render ----------------
    return (
        <div
            style={{
                padding: 20,
                fontFamily: "Inter, sans-serif",
                position: "relative",
            }}
        >
            {/* -------- Estado arriba a la derecha -------- */}
            <div
                style={{
                    position: "absolute",
                    top: 10,
                    right: 180, // <<< MUEVE EL ESTADO MÁS A LA IZQUIERDA
                    textAlign: "right",
                    fontSize: 15,
                    padding: "6px 10px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.85)", // <<< BLOQUE LEGIBLE SIN SOLAPAR
                    backdropFilter: "blur(4px)",
                    color: estadoForoptero === "ready" ? "#0f0" : "#ffb400",
                    fontFamily: "monospace",
                    lineHeight: 1.3,
                    zIndex: 999,
                }}
            >
                Estado: {estadoForoptero}
                {estadoForoptero === "ready" && (
                    <div style={{ color: "#999", fontSize: 13, marginTop: 6 }}>
                        &lt;R&gt; {formatoLente(lentesR)} <br />
                        &lt;L&gt; {formatoLente(lentesL)}
                    </div>
                )}
            </div>

            <h2 style={{ marginBottom: 50 }}>Panel de Control del Foróptero</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* -------- Primera fila: Controles -------- */}
                <div style={layout}>
                    {/* -------- R -------- */}
                    <div style={miniBox}>
                        <h3>Ojo Derecho (R)</h3>

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
                            onClick={() => ajustar(setREsfera, rEsfera, +0.25)}
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
                                ajustar(setRCilindro, rCilindro, +0.25)
                            }
                        >
                            +
                        </button>

                        <div style={{ marginTop: 10 }}>Ángulo</div>
                        <input
                            type="number"
                            value={rAngulo}
                            onChange={(e) =>
                                setRAngulo(parseInt(e.target.value))
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

                    {/* -------- L -------- */}
                    <div style={miniBox}>
                        <h3>Ojo Izquierdo (L)</h3>

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
                            onClick={() => ajustar(setLEsfera, lEsfera, +0.25)}
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
                                ajustar(setLCilindro, lCilindro, +0.25)
                            }
                        >
                            +
                        </button>

                        <div style={{ marginTop: 10 }}>Ángulo</div>
                        <input
                            type="number"
                            value={lAngulo}
                            onChange={(e) =>
                                setLAngulo(parseInt(e.target.value))
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

                    {/* -------- Botones -------- */}
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

                        <button
                            style={{
                                ...bigBtn,
                                background: "#444",
                                color: "#fff",
                            }}
                            onClick={() => reiniciarExamen("normal")}
                        >
                            Nuevo examen
                        </button>

                        <button
                            style={{
                                ...bigBtn,
                                background: "#7c3aed",
                                color: "#fff",
                            }}
                            onClick={() => reiniciarExamen("testesf")}
                        >
                            Prueba ESF
                        </button>

                        <button
                            style={{
                                ...bigBtn,
                                background: "#9333ea",
                                color: "#fff",
                            }}
                            onClick={() => reiniciarExamen("testcil")}
                        >
                            Prueba CIL
                        </button>

                        <button
                            style={{
                                ...bigBtn,
                                background: "#0d9488",
                                color: "#fff",
                            }}
                            onClick={() => reiniciarExamen("testbin")}
                        >
                            Prueba BIN
                        </button>

                        <button
                            style={{
                                ...bigBtn,
                                background: "#15803d",
                                color: "#fff",
                            }}
                            type="button"
                            onClick={() => descargarRegistroCsv()}
                        >
                            Descargar CSV registro
                        </button>
                    </div>
                </div>

                {/* -------- Segunda fila: Información del examen -------- */}
                <div style={layout}>
                    {/* -------- Card Valores Iniciales/Recalculados -------- */}
                    <div style={miniBox}>
                        <h3>Valores del Examen</h3>

                        <div style={{ marginTop: 15 }}>
                            <h4 style={{ fontSize: 14, marginBottom: 8 }}>
                                Valores Iniciales
                            </h4>
                            <div
                                style={{
                                    display: "flex",
                                    gap: 20,
                                    marginBottom: 15,
                                }}
                            >
                                <div style={{ flex: 1 }}>
                                    <strong>Ojo R:</strong>
                                    <div style={{ fontSize: 13, marginTop: 4 }}>
                                        Esf: {formatoValor(
                                            valoresIniciales?.R?.esfera
                                        )}
                                        <br />
                                        Cil: {formatoValor(
                                            valoresIniciales?.R?.cilindro
                                        )}
                                        <br />
                                        Ángulo: {formatoValor(
                                            valoresIniciales?.R?.angulo
                                        )}
                                    </div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <strong>Ojo L:</strong>
                                    <div style={{ fontSize: 13, marginTop: 4 }}>
                                        Esf: {formatoValor(
                                            valoresIniciales?.L?.esfera
                                        )}
                                        <br />
                                        Cil: {formatoValor(
                                            valoresIniciales?.L?.cilindro
                                        )}
                                        <br />
                                        Ángulo: {formatoValor(
                                            valoresIniciales?.L?.angulo
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ marginTop: 15 }}>
                            <h4 style={{ fontSize: 14, marginBottom: 8 }}>
                                Valores Recalculados
                            </h4>
                            <div style={{ display: "flex", gap: 20 }}>
                                <div style={{ flex: 1 }}>
                                    <strong>Ojo R:</strong>
                                    <div style={{ fontSize: 13, marginTop: 4 }}>
                                        Esf: {formatoValor(
                                            valoresRecalculados?.R?.esfera
                                        )}
                                        <br />
                                        Cil: {formatoValor(
                                            valoresRecalculados?.R?.cilindro
                                        )}
                                        <br />
                                        Ángulo: {formatoValor(
                                            valoresRecalculados?.R?.angulo
                                        )}
                                    </div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <strong>Ojo L:</strong>
                                    <div style={{ fontSize: 13, marginTop: 4 }}>
                                        Esf: {formatoValor(
                                            valoresRecalculados?.L?.esfera
                                        )}
                                        <br />
                                        Cil: {formatoValor(
                                            valoresRecalculados?.L?.cilindro
                                        )}
                                        <br />
                                        Ángulo: {formatoValor(
                                            valoresRecalculados?.L?.angulo
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* -------- Card Estado del Examen y Tests -------- */}
                    <div style={miniBox}>
                        <h3>Estado del Examen</h3>

                        <div style={{ marginTop: 15 }}>
                            <div style={{ marginBottom: 10 }}>
                                <strong>Estado:</strong>{" "}
                                {timestamps?.finalizado === null
                                    ? "En curso"
                                    : "Finalizado"}
                            </div>
                            {estadoActual && (
                                <div style={{ marginBottom: 10, fontSize: 13 }}>
                                    <div>
                                        <strong>Modo:</strong> {modoExamen || "normal"}
                                    </div>
                                    <div>
                                        <strong>Etapa:</strong>{" "}
                                        {estadoActual.testActual?.tipo || "N/A"}
                                    </div>
                                    <div style={{ marginTop: 4 }}>
                                        <strong>Ojo Actual:</strong>{" "}
                                        {estadoActual.testActual?.ojo || "N/A"}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ marginTop: 15 }}>
                            <h4 style={{ fontSize: 14, marginBottom: 8 }}>
                                Tests Realizados
                            </h4>
                            {tests && tests.length > 0 ? (
                                <table
                                    style={{
                                        width: "100%",
                                        borderCollapse: "collapse",
                                        fontSize: 12,
                                    }}
                                >
                                    <thead>
                                        <tr
                                            style={{
                                                borderBottom:
                                                    "1px solid #e0e0e0",
                                            }}
                                        >
                                            <th
                                                style={{
                                                    textAlign: "left",
                                                    padding: "6px 4px",
                                                }}
                                            >
                                                Test
                                            </th>
                                            <th
                                                style={{
                                                    textAlign: "left",
                                                    padding: "6px 4px",
                                                }}
                                            >
                                                Valor
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...tests]
                                            .sort((a: any, b: any) => a.indice - b.indice)
                                            .map((test: any) => (
                                                <tr
                                                    key={test.indice}
                                                    style={{
                                                        borderBottom:
                                                            "1px solid #f0f0f0",
                                                    }}
                                                >
                                                    <td
                                                        style={{
                                                            padding: "6px 4px",
                                                        }}
                                                    >
                                                        {formatearNombreTest(
                                                            test.tipo,
                                                            test.ojo
                                                        )}
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: "6px 4px",
                                                        }}
                                                    >
                                                        {formatearValorTest(test)}
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div style={{ fontSize: 13, color: "#999" }}>
                                    No hay tests realizados
                                </div>
                            )}
                        </div>
                    </div>

                    {/* -------- Columna vacía para mantener alineación -------- */}
                    <div style={buttonColumn}></div>
                </div>
            </div>
        </div>
    )
}
