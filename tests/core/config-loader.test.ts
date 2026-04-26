import { describe, expect, it } from 'bun:test';
import { discoverConfigs } from '../../src/core/config-loader';
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

    const state = discoverConfigs(tmp);

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

    const state = discoverConfigs(tmp);
    const ocFile = state.opencode.find((c) => c.path.includes(tmp));
    expect(ocFile).toBeDefined();
    expect(ocFile!.content).toContain('// comment');

    rmSync(tmp, { recursive: true, force: true });
  });
});
