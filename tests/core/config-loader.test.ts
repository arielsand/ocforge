import { describe, expect, it } from 'bun:test';
import { discoverConfigs, discoverModelOwners } from '../../src/core/config-loader';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('config-loader', () => {
  it('discovers opencode.json and oh-my-openagent.jsonc in a directory', () => {
    const tmp = join(tmpdir(), `ocforge-test-${Date.now()}`);
    const opencodeDir = join(tmp, '.opencode');
    mkdirSync(opencodeDir, { recursive: true });

    writeFileSync(join(tmp, 'opencode.json'), JSON.stringify({ model: 'a/b' }));
    writeFileSync(join(opencodeDir, 'oh-my-openagent.jsonc'), '{"agents":{"x":{"model":"c/d"}}}');

    const state = discoverConfigs({ cwd: tmp, globalDir: join(tmp, 'nonexistent-global') });

    const ocFile = state.opencode.find((c) => c.path.includes(tmp));
    expect(ocFile).toBeDefined();
    expect(ocFile!.data.model).toBe('a/b');

    const omoFile = state.omo.find((c) => c.path.includes(tmp));
    expect(omoFile).toBeDefined();
    expect((omoFile!.data as any).agents.x.model).toBe('c/d');

    rmSync(tmp, { recursive: true, force: true });
  });

  it('preserves JSONC comments in content', () => {
    const tmp = join(tmpdir(), `ocforge-test-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });

    const content = '{\n  // comment\n  "model": "a/b"\n}';
    writeFileSync(join(tmp, 'opencode.json'), content);

    const state = discoverConfigs({ cwd: tmp, globalDir: join(tmp, 'nonexistent-global') });
    const ocFile = state.opencode.find((c) => c.path.includes(tmp));
    expect(ocFile).toBeDefined();
    expect(ocFile!.content).toContain('// comment');

    rmSync(tmp, { recursive: true, force: true });
  });

  it('prioritizes legacy oh-my-opencode over oh-my-openagent', () => {
    const tmp = join(tmpdir(), `ocforge-test-${Date.now()}`);
    const opencodeDir = join(tmp, '.opencode');
    mkdirSync(opencodeDir, { recursive: true });

    // Write both formats — legacy should win
    writeFileSync(join(opencodeDir, 'oh-my-openagent.json'), '{"agents":{"x":{"model":"new/d"}}}');
    writeFileSync(join(opencodeDir, 'oh-my-opencode.json'), '{"agents":{"x":{"model":"legacy/d"}}}');

    const state = discoverConfigs({ cwd: tmp, globalDir: join(tmp, 'nonexistent-global') });

    // Legacy (oh-my-opencode) should be at index 0 — the primary config
    expect(state.omo.length).toBeGreaterThanOrEqual(1);
    const primaryOmo = state.omo[0];
    expect(primaryOmo.path).toContain('oh-my-opencode');
    expect((primaryOmo.data as any).agents.x.model).toBe('legacy/d');

    rmSync(tmp, { recursive: true, force: true });
  });

  it('falls back to oh-my-openagent when no legacy file exists', () => {
    const tmp = join(tmpdir(), `ocforge-test-${Date.now()}`);
    const opencodeDir = join(tmp, '.opencode');
    mkdirSync(opencodeDir, { recursive: true });

    writeFileSync(join(opencodeDir, 'oh-my-openagent.json'), '{"agents":{"x":{"model":"new/d"}}}');

    const state = discoverConfigs({ cwd: tmp, globalDir: join(tmp, 'nonexistent-global') });

    expect(state.omo.length).toBeGreaterThanOrEqual(1);
    const primaryOmo = state.omo[0];
    expect(primaryOmo.path).toContain('oh-my-openagent');
    expect((primaryOmo.data as any).agents.x.model).toBe('new/d');

    rmSync(tmp, { recursive: true, force: true });
  });
});

describe('discoverModelOwners', () => {
  it('discovers model ownership across config files', () => {
    const tmp = join(tmpdir(), `ocforge-test-owners-${Date.now()}`);
    const opencodeDir = join(tmp, '.opencode');
    mkdirSync(opencodeDir, { recursive: true });

    writeFileSync(join(tmp, 'opencode.json'), JSON.stringify({
      model: 'provider/default',
      small_model: 'provider/small',
      agent: { build: { model: 'provider/build-model' } },
    }));
    writeFileSync(join(opencodeDir, 'oh-my-openagent.json'), JSON.stringify({
      agents: { sisyphus: { model: 'provider/sisyphus-model' } },
      categories: { quick: { model: 'provider/quick-model' } },
    }));

    const owned = discoverModelOwners({ cwd: tmp, globalDir: join(tmp, 'nonexistent-global') });

    const defaultModel = owned.find((o) => o.role === 'top-level-model');
    expect(defaultModel).toBeDefined();
    expect(defaultModel!.currentModel).toBe('provider/default');

    const buildAgent = owned.find((o) => o.name === 'build');
    expect(buildAgent).toBeDefined();
    expect(buildAgent!.currentModel).toBe('provider/build-model');
    expect(buildAgent!.owner.configType).toBe('opencode');

    const sisyphusAgent = owned.find((o) => o.name === 'sisyphus');
    expect(sisyphusAgent).toBeDefined();
    expect(sisyphusAgent!.currentModel).toBe('provider/sisyphus-model');
    expect(sisyphusAgent!.owner.configType).toBe('omo');

    const quickCategory = owned.find((o) => o.name === 'quick');
    expect(quickCategory).toBeDefined();
    expect(quickCategory!.currentModel).toBe('provider/quick-model');
    expect(quickCategory!.owner.configType).toBe('omo');

    rmSync(tmp, { recursive: true, force: true });
  });
});


