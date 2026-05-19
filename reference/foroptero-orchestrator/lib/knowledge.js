import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const AGENTES_GENERICOS = new Set(['interprete', 'auditor', 'comunicacion']);

const CORE_KNOWLEDGE = {
  interprete: ['core/interpretacion-comun.md'],
  auditor: ['core/auditoria-estructural.md'],
  comunicacion: ['core/comunicacion-comun.md']
};

const FASE_KNOWLEDGE = {
  agudeza: {
    interprete: ['fases/agudeza/interpretacion.md'],
    auditor: ['fases/agudeza/auditoria.md'],
    comunicacion: ['fases/agudeza/comunicacion.md'],
    protocolo: ['fases/agudeza/protocolo-estado.md', 'dispositivos.md']
  }
};

const FASE_DEFAULT = 'agudeza';

/**
 * Fase clínica para cargar knowledge (examen global puede estar en agudeza o finalizado).
 * @param {string} [fase]
 * @returns {string}
 */
export function resolverFaseKnowledge(fase) {
  if (fase && FASE_KNOWLEDGE[fase]) {
    return fase;
  }
  return FASE_DEFAULT;
}

export function leerMarkdown(relPath) {
  const full = path.join(ROOT, 'knowledge', relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Knowledge no encontrado: knowledge/${relPath}`);
  }
  return fs.readFileSync(full, 'utf8');
}

/**
 * @param {string} agente — interprete | auditor | comunicacion | protocolo
 * @param {string} [fase]
 */
export function cargarPrompt(agente, fase) {
  if (agente === 'protocolo') {
    const f = resolverFaseKnowledge(fase);
    const especifico = path.join(ROOT, 'prompts', `protocolo-${f}.md`);
    if (fs.existsSync(especifico)) {
      return fs.readFileSync(especifico, 'utf8');
    }
  }
  const generico = path.join(ROOT, 'prompts', `${agente}.md`);
  if (!fs.existsSync(generico)) {
    throw new Error(`Prompt no encontrado: prompts/${agente}.md`);
  }
  return fs.readFileSync(generico, 'utf8');
}

function listarKnowledge(agente, fase) {
  const f = resolverFaseKnowledge(fase);
  const faseFiles = FASE_KNOWLEDGE[f]?.[agente];
  if (!faseFiles) {
    throw new Error(`Sin knowledge de fase "${f}" para agente: ${agente}`);
  }
  if (AGENTES_GENERICOS.has(agente)) {
    const core = CORE_KNOWLEDGE[agente] ?? [];
    return [...core, ...faseFiles];
  }
  return faseFiles;
}

/**
 * @param {string} agente
 * @param {string} [fase]
 */
export function cargarKnowledgeAgente(agente, fase) {
  const files = listarKnowledge(agente, fase);
  return files
    .map((rel) => `---\n# ${rel}\n` + leerMarkdown(rel))
    .join('\n');
}

/**
 * @param {string} agente
 * @param {string} [fase] — desde estado.fase del examen
 */
export function cargarSystemAgente(agente, fase) {
  const f = resolverFaseKnowledge(fase);
  return [cargarPrompt(agente, f), cargarKnowledgeAgente(agente, f)].join('\n\n');
}
