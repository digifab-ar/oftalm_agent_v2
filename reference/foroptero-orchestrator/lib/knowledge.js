import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export function leerMarkdown(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

const KNOWLEDGE_BY_AGENT = {
  interprete: ['interpretacion-paciente.md'],
  protocolo: ['protocolo-agudeza-estado.md', 'dispositivos.md'],
  comunicacion: ['comunicacion-paciente.md'],
  auditor: ['auditoria-protocolo.md', 'dispositivos.md']
};

export function cargarPrompt(agente) {
  return leerMarkdown(`prompts/${agente}.md`);
}

export function cargarKnowledgeAgente(agente) {
  const files = KNOWLEDGE_BY_AGENT[agente];
  if (!files) {
    throw new Error(`Agente knowledge desconocido: ${agente}`);
  }
  return files
    .map((name) => `---\n# ${name}\n` + leerMarkdown(`knowledge/${name}`))
    .join('\n');
}

export function cargarSystemAgente(agente) {
  return [cargarPrompt(agente), cargarKnowledgeAgente(agente)].join('\n\n');
}
