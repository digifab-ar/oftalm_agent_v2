import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  setKnowledgeRoot,
  invalidarCacheManifest,
  cargarSystemAgente,
  resolverFaseKnowledge,
  getKnowledgeRoot
} from '../lib/knowledge.js';
import { validateManifestAtRoot } from '../lib/validateManifest.js';

const FIXTURE_ROOT = path.join(os.tmpdir(), `knowledge-test-${process.pid}`);

function writeFixture() {
  fs.mkdirSync(path.join(FIXTURE_ROOT, 'prompts'), { recursive: true });
  fs.mkdirSync(path.join(FIXTURE_ROOT, 'knowledge/core'), {
    recursive: true
  });

  fs.writeFileSync(
    path.join(FIXTURE_ROOT, 'knowledge.manifest.json'),
    JSON.stringify(
      {
        version: '9.9.9-test',
        defaultPhase: 'agudeza',
        phases: {
          agudeza: {
            interprete: {
              prompt: 'prompts/interprete.md',
              knowledge: ['knowledge/core/interpretacion-comun.md']
            },
            protocolo: {
              prompt: 'prompts/protocolo.md',
              knowledge: ['knowledge/core/protocolo.md']
            }
          }
        }
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(FIXTURE_ROOT, 'prompts/interprete.md'),
    '# Interprete test'
  );
  fs.writeFileSync(
    path.join(FIXTURE_ROOT, 'prompts/protocolo.md'),
    '# Protocolo test'
  );
  fs.writeFileSync(
    path.join(FIXTURE_ROOT, 'knowledge/core/interpretacion-comun.md'),
    '## Comun'
  );
  fs.writeFileSync(
    path.join(FIXTURE_ROOT, 'knowledge/core/protocolo.md'),
    '## Proto'
  );
}

before(() => {
  if (fs.existsSync(FIXTURE_ROOT)) {
    fs.rmSync(FIXTURE_ROOT, { recursive: true });
  }
  writeFixture();
  setKnowledgeRoot(FIXTURE_ROOT);
  invalidarCacheManifest();
});

after(() => {
  if (fs.existsSync(FIXTURE_ROOT)) {
    fs.rmSync(FIXTURE_ROOT, { recursive: true });
  }
});

test('validateManifestAtRoot acepta fixture', () => {
  const r = validateManifestAtRoot(FIXTURE_ROOT);
  assert.equal(r.ok, true);
  assert.equal(r.manifest.version, '9.9.9-test');
});

test('cargarSystemAgente concatena prompt y knowledge', () => {
  invalidarCacheManifest();
  const system = cargarSystemAgente('interprete', 'agudeza');
  assert.ok(system.includes('# Interprete test'));
  assert.ok(system.includes('## Comun'));
  assert.ok(system.includes('---\n# knowledge/core/interpretacion-comun.md'));
});

test('resolverFaseKnowledge usa defaultPhase', () => {
  invalidarCacheManifest();
  assert.equal(resolverFaseKnowledge('desconocida'), 'agudeza');
});

test('manifest cache reutiliza dentro del TTL', () => {
  process.env.KNOWLEDGE_MANIFEST_CACHE_MS = '60000';
  invalidarCacheManifest();
  cargarSystemAgente('protocolo', 'agudeza');
  const manifestPath = path.join(FIXTURE_ROOT, 'knowledge.manifest.json');
  const before = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  before.version = 'mutado-en-disco';
  fs.writeFileSync(manifestPath, JSON.stringify(before));
  cargarSystemAgente('interprete', 'agudeza');
  assert.equal(resolverFaseKnowledge(), 'agudeza');
  invalidarCacheManifest();
  delete process.env.KNOWLEDGE_MANIFEST_CACHE_MS;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.version = '9.9.9-test';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
});

test('getKnowledgeRoot devuelve path configurado', () => {
  assert.equal(getKnowledgeRoot(), FIXTURE_ROOT);
});

test('validateManifestAtRoot rechaza archivo faltante', () => {
  const badRoot = path.join(FIXTURE_ROOT, 'bad');
  fs.mkdirSync(badRoot, { recursive: true });
  fs.writeFileSync(
    path.join(badRoot, 'knowledge.manifest.json'),
    JSON.stringify({
      version: '1.0.0',
      phases: {
        agudeza: {
          interprete: {
            prompt: 'prompts/no-existe.md',
            knowledge: ['knowledge/core/interpretacion-comun.md']
          }
        }
      }
    })
  );
  const r = validateManifestAtRoot(badRoot);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('no existe')));
});
