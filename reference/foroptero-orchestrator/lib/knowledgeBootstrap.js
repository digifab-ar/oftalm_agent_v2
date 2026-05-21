import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { validateManifestAtRoot } from './validateManifest.js';
import { invalidarCacheManifest, setKnowledgeRoot } from './knowledge.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORCHESTRATOR_ROOT = path.join(__dirname, '..');

const DEFAULT_GIT_URL =
  'https://github.com/digifab-ar/Oftalm_agent_v2_prompts_knowledge.git';
const DEFAULT_GIT_REF = 'main';
const DEFAULT_CLONE_DIR = path.join(
  ORCHESTRATOR_ROOT,
  '../Oftalm_agent_v2_prompts_knowledge'
);

let lastBootstrapInfo = {
  root: null,
  version: null,
  gitRef: null,
  commitShort: null,
  pulledAt: null
};

export function obtenerBootstrapInfo() {
  return { ...lastBootstrapInfo };
}

/**
 * @returns {string}
 */
export function resolverKnowledgeRoot() {
  const fromEnv = process.env.KNOWLEDGE_ROOT?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  if (fs.existsSync(path.join(DEFAULT_CLONE_DIR, 'knowledge.manifest.json'))) {
    return DEFAULT_CLONE_DIR;
  }
  throw new Error(
    'KNOWLEDGE_ROOT no configurado y no se encontró ../Oftalm_agent_v2_prompts_knowledge. ' +
      'Cloná el repo de prompts/knowledge o definí KNOWLEDGE_ROOT.'
  );
}

async function runGit(args, cwd) {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024
  });
  return { stdout: stdout?.trim() ?? '', stderr: stderr?.trim() ?? '' };
}

async function gitCommitShort(cwd) {
  try {
    const { stdout } = await runGit(['rev-parse', '--short', 'HEAD'], cwd);
    return stdout || null;
  } catch {
    return null;
  }
}

/**
 * Clone shallow si no existe; luego reset a origin/main.
 * @param {string} root
 */
async function gitSyncToMain(root) {
  const gitUrl = process.env.KNOWLEDGE_GIT_URL?.trim() || DEFAULT_GIT_URL;
  const gitRef = process.env.KNOWLEDGE_GIT_REF?.trim() || DEFAULT_GIT_REF;
  const gitDir = path.join(root, '.git');

  if (!fs.existsSync(gitDir)) {
    if (!fs.existsSync(path.dirname(root))) {
      fs.mkdirSync(path.dirname(root), { recursive: true });
    }
    const parent = path.dirname(root);
    const dirName = path.basename(root);
    console.log(`📥 Clonando knowledge repo (${gitRef})…`);
    await runGit(
      ['clone', '--depth', '1', '--branch', gitRef, gitUrl, dirName],
      parent
    );
  } else if (process.env.KNOWLEDGE_GIT_URL?.trim()) {
    console.log(`📥 Actualizando knowledge repo (${gitRef})…`);
    await runGit(['fetch', 'origin'], root);
    await runGit(['checkout', gitRef], root);
    await runGit(['reset', '--hard', `origin/${gitRef}`], root);
  }
}

/**
 * @param {{ pull?: boolean }} [options]
 */
export async function asegurarKnowledgeRepo(options = {}) {
  const pull = options.pull !== false;
  const root = resolverKnowledgeRoot();
  const gitRef = process.env.KNOWLEDGE_GIT_REF?.trim() || DEFAULT_GIT_REF;

  const shouldPull =
    pull &&
    (process.env.KNOWLEDGE_GIT_URL?.trim() ||
      !fs.existsSync(path.join(root, 'knowledge.manifest.json')));

  if (shouldPull) {
    try {
      await gitSyncToMain(root);
    } catch (err) {
      if (!fs.existsSync(path.join(root, 'knowledge.manifest.json'))) {
        throw new Error(
          `No se pudo clonar/actualizar knowledge repo: ${err.message}`
        );
      }
      console.warn(
        `⚠️ git pull falló; se mantiene contenido local en ${root}: ${err.message}`
      );
    }
  }

  const validation = validateManifestAtRoot(root);
  if (!validation.ok) {
    throw new Error(
      `knowledge.manifest inválido:\n${validation.errors.join('\n')}`
    );
  }

  setKnowledgeRoot(root);
  invalidarCacheManifest();

  lastBootstrapInfo = {
    root,
    version: validation.manifest.version,
    gitRef,
    commitShort: await gitCommitShort(root),
    pulledAt: new Date().toISOString()
  };

  console.log(
    `📚 Knowledge listo: v${lastBootstrapInfo.version} @ ${lastBootstrapInfo.commitShort ?? '?'} (${root})`
  );

  return lastBootstrapInfo;
}

/**
 * Recarga knowledge (pull + validación). Si pull falla, mantiene versión anterior.
 */
export async function recargarKnowledgeRepo() {
  const root = resolverKnowledgeRoot();
  const previous = { ...lastBootstrapInfo };

  try {
    if (process.env.KNOWLEDGE_GIT_URL?.trim() || fs.existsSync(path.join(root, '.git'))) {
      await gitSyncToMain(root);
    }
  } catch (err) {
    console.warn(`⚠️ recargar knowledge: pull falló: ${err.message}`);
    if (previous.root) {
      return {
        ok: false,
        error: err.message,
        keptPrevious: true,
        knowledge: previous
      };
    }
    throw err;
  }

  const validation = validateManifestAtRoot(root);
  if (!validation.ok) {
    return {
      ok: false,
      error: validation.errors.join('; '),
      keptPrevious: true,
      knowledge: previous
    };
  }

  setKnowledgeRoot(root);
  invalidarCacheManifest();

  lastBootstrapInfo = {
    root,
    version: validation.manifest.version,
    gitRef: process.env.KNOWLEDGE_GIT_REF?.trim() || DEFAULT_GIT_REF,
    commitShort: await gitCommitShort(root),
    pulledAt: new Date().toISOString()
  };

  return { ok: true, knowledge: { ...lastBootstrapInfo } };
}
