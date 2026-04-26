import Fastify from 'fastify';
import { discoverConfigs } from '../core/config-loader';
import { ModelRegistry } from '../core/model-registry';
import { SuggestionEngine } from '../core/suggestion-engine';
import { JSONCWriter } from '../core/jsonc-writer';
import { generateDiff } from '../core/diff-preview';
import type { Change } from '../types';

let cachedModels: ReturnType<ModelRegistry['list']> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

async function getModels(): Promise<ReturnType<ModelRegistry['list']>> {
  const now = Date.now();
  if (cachedModels && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedModels;
  }
  const registry = new ModelRegistry();
  cachedModels = await registry.refresh();
  cacheTimestamp = now;
  return cachedModels;
}

export async function startWebServer(port: number = 3456, cwd?: string): Promise<void> {
  const app = Fastify({ logger: false });

  app.get('/api/configs', async () => {
    const configs = discoverConfigs(cwd);
    return {
      opencode: configs.opencode.map((c) => ({ path: c.path, level: c.level, type: c.type, data: c.data })),
      omo: configs.omo.map((c) => ({ path: c.path, level: c.level, type: c.type, data: c.data })),
    };
  });

  app.get('/api/models', async () => {
    return getModels();
  });

  app.get('/api/suggestions', async () => {
    const configs = discoverConfigs(cwd);
    const models = await getModels();
    const registry = new ModelRegistry({ shellRunner: async () => ({ stdout: '', stderr: '', exitCode: 0 }) });
    (registry as any).models = models; // seed cached models
    const engine = new SuggestionEngine(registry);
    return engine.generate(configs);
  });

  app.post('/api/preview', async (request) => {
    const { changes } = request.body as { changes: Change[] };
    const results = [];
    for (const change of changes) {
      results.push(generateDiff(change.filePath, [change]));
    }
    return results;
  });

  app.post('/api/apply', async (request) => {
    const { changes } = request.body as { changes: Change[] };
    const writer = new JSONCWriter();
    const byFile = new Map<string, Change[]>();
    for (const c of changes) {
      const arr = byFile.get(c.filePath) ?? [];
      arr.push(c);
      byFile.set(c.filePath, arr);
    }
    for (const [path, fileChanges] of byFile) {
      writer.applyChanges(path, fileChanges, true);
    }
    return { success: true, modified: [...byFile.keys()] };
  });

  await app.listen({ port, host: '127.0.0.1' });
  console.log(`🌐 ocforge web UI running at http://localhost:${port}`);
}
