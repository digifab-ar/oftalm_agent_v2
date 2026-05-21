import fs from 'fs';
import path from 'path';

const MANIFEST_FILENAME = 'knowledge.manifest.json';
const DEFAULT_CACHE_MS = 5000;

let contentRoot = null;
let manifestCache = null;
let manifestCacheAt = 0;

/**
 * @param {string} root
 */
export function setKnowledgeRoot(root) {
  contentRoot = path.resolve(root);
}

export function getKnowledgeRoot() {
  if (!contentRoot) {
    throw new Error(
      'Knowledge no inicializado. Ejecutá asegurarKnowledgeRepo() al arranque.'
    );
  }
  return contentRoot;
}

export function invalidarCacheManifest() {
  manifestCache = null;
  manifestCacheAt = 0;
}

function manifestCacheTtlMs() {
  const raw = process.env.KNOWLEDGE_MANIFEST_CACHE_MS;
  if (raw === undefined || raw === '') {
    return DEFAULT_CACHE_MS;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CACHE_MS;
}

function loadManifest() {
  const ttl = manifestCacheTtlMs();
  const now = Date.now();
  if (manifestCache && ttl > 0 && now - manifestCacheAt < ttl) {
    return manifestCache;
  }

  const root = getKnowledgeRoot();
  const manifestPath = path.join(root, MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No existe ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifestCache = manifest;
  manifestCacheAt = now;
  return manifest;
}

/**
 * @param {string} [fase]
 * @returns {string}
 */
export function resolverFaseKnowledge(fase) {
  const manifest = loadManifest();
  if (fase && manifest.phases?.[fase]) {
    return fase;
  }
  return manifest.defaultPhase ?? 'agudeza';
}

/**
 * @param {string} relPath — path desde raíz del repo (ej. knowledge/core/foo.md)
 */
export function leerMarkdown(relPath) {
  const full = path.join(getKnowledgeRoot(), relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Archivo no encontrado: ${relPath}`);
  }
  return fs.readFileSync(full, 'utf8');
}

function agentConfig(agente, fase) {
  const manifest = loadManifest();
  const f = resolverFaseKnowledge(fase);
  const cfg = manifest.phases?.[f]?.[agente];
  if (!cfg) {
    throw new Error(`Sin entrada en manifest para fase "${f}" agente "${agente}"`);
  }
  return cfg;
}

/**
 * @param {string} agente — interprete | auditor | comunicacion | protocolo
 * @param {string} [fase]
 */
export function cargarPrompt(agente, fase) {
  const cfg = agentConfig(agente, fase);
  return leerMarkdown(cfg.prompt);
}

function listarKnowledge(agente, fase) {
  const cfg = agentConfig(agente, fase);
  return cfg.knowledge ?? [];
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
 * @param {string} [fase]
 */
export function cargarSystemAgente(agente, fase) {
  const f = resolverFaseKnowledge(fase);
  return [cargarPrompt(agente, f), cargarKnowledgeAgente(agente, f)].join('\n\n');
}

/**
 * Info para /api/health (requiere bootstrap previo).
 */
export function obtenerInfoKnowledge() {
  const root = getKnowledgeRoot();
  let version = null;
  let manifestMtime = null;
  try {
    const manifest = loadManifest();
    version = manifest.version ?? null;
    const stat = fs.statSync(path.join(root, MANIFEST_FILENAME));
    manifestMtime = stat.mtime.toISOString();
  } catch {
    /* ignore */
  }
  return {
    source: 'external',
    root,
    version,
    manifestMtime,
    manifestCacheMs: manifestCacheTtlMs()
  };
}
