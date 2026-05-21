import fs from 'fs';
import path from 'path';

/**
 * @param {string} contentRoot — raíz del repo (contiene knowledge.manifest.json)
 * @returns {{ ok: boolean, errors: string[], manifest?: object }}
 */
export function validateManifestAtRoot(contentRoot) {
  const errors = [];
  const manifestPath = path.join(contentRoot, 'knowledge.manifest.json');

  if (!fs.existsSync(manifestPath)) {
    return { ok: false, errors: [`No existe ${manifestPath}`] };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    return { ok: false, errors: [`JSON inválido: ${e.message}`] };
  }

  if (!manifest.version || !manifest.phases) {
    errors.push('Faltan campos obligatorios: version, phases');
  }

  const blocks = [];
  for (const [phase, agents] of Object.entries(manifest.phases ?? {})) {
    for (const [agente, cfg] of Object.entries(agents)) {
      blocks.push({ id: `phases.${phase}.${agente}`, cfg });
    }
  }
  if (manifest.metaAgent) {
    blocks.push({ id: 'metaAgent', cfg: manifest.metaAgent });
  }

  for (const { id, cfg } of blocks) {
    if (!cfg?.prompt) {
      errors.push(`${id}: falta prompt`);
      continue;
    }
    const promptPath = path.join(contentRoot, cfg.prompt);
    if (!fs.existsSync(promptPath)) {
      errors.push(`${id}: prompt no existe: ${cfg.prompt}`);
    }

    if (!Array.isArray(cfg.knowledge) || cfg.knowledge.length === 0) {
      errors.push(`${id}: knowledge[] vacío o inválido`);
      continue;
    }

    const seen = new Set();
    for (const rel of cfg.knowledge) {
      if (seen.has(rel)) {
        errors.push(`${id}: path duplicado: ${rel}`);
      }
      seen.add(rel);
      if (!fs.existsSync(path.join(contentRoot, rel))) {
        errors.push(`${id}: knowledge no existe: ${rel}`);
      }
    }
  }

  for (const rel of manifest.documentationOnly ?? []) {
    if (!fs.existsSync(path.join(contentRoot, rel))) {
      errors.push(`documentationOnly: no existe: ${rel}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    manifest: errors.length === 0 ? manifest : undefined
  };
}
