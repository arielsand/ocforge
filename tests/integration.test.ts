import { describe, expect, it } from 'bun:test';
import { discoverConfigs } from '../src/core/config-loader';
import { ModelRegistry } from '../src/core/model-registry';
import { SuggestionEngine } from '../src/core/suggestion-engine';
import { JSONCWriter } from '../src/core/jsonc-writer';
import { generateDiff } from '../src/core/diff-preview';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('integration', () => {
  it('end-to-end: discover configs, suggest models, preview diff, apply change', async () => {
    const tmp = join(tmpdir(), `ocforge-e2e-${Date.now()}`);
    const omoDir = join(tmp, '.opencode');
    mkdirSync(omoDir, { recursive: true });

    const omoPath = join(omoDir, 'oh-my-openagent.jsonc');
    writeFileSync(omoPath, '{\n  "agents": {\n    "sisyphus": {\n      "model": "anthropic/claude-opus-4-7"\n    }\n  }\n}');

    const configs = discoverConfigs({ cwd: tmp, globalDir: join(tmp, 'nonexistent-global') });
    const omoFile = configs.omo.find((c) => c.path === omoPath);
    expect(omoFile).toBeDefined();

    const registry = new ModelRegistry({
      shellRunner: async () => ({
        stdout: 'anthropic/claude-opus-4-7\nopenai/gpt-5.5',
        stderr: '',
        exitCode: 0,
      }),
    });
    await registry.refresh();

    // Override configs to only use the temp omo file for this test
    const isolatedConfigs = { opencode: [], omo: [omoFile!] };
    const engine = new SuggestionEngine(registry);
    const suggestions = engine.generate(isolatedConfigs);
    expect(suggestions.length).toBeGreaterThan(0);

    const change = {
      filePath: omoPath,
      jsonPath: ['agents', 'sisyphus', 'model'] as (string | number)[],
      oldValue: 'anthropic/claude-opus-4-7',
      newValue: suggestions[0].suggestedValue,
    };

    const diff = generateDiff(omoPath, [change]);
    expect(diff.summary).toContain('anthropic/claude-opus-4-7');

    const writer = new JSONCWriter();
    writer.applyChanges(omoPath, [change], true);

    const updated = readFileSync(omoPath, 'utf-8');
    expect(updated).toContain(`"model": "${suggestions[0].suggestedValue}"`);

    rmSync(tmp, { recursive: true, force: true });
  });

  it('end-to-end: detects stale model reference and produces enriched missing-model suggestion', async () => {
    const tmp = join(tmpdir(), `ocforge-validate-${Date.now()}`);
    const omoDir = join(tmp, '.opencode');
    mkdirSync(omoDir, { recursive: true });

    const omoPath = join(omoDir, 'oh-my-openagent.jsonc');
    writeFileSync(omoPath, '{\n  "agents": {\n    "sisyphus": {\n      "model": "nonexistent/dead-model"\n    }\n  }\n}');

    const configs = discoverConfigs({ cwd: tmp, globalDir: join(tmp, 'nonexistent-global') });
    const omoFile = configs.omo.find((c) => c.path === omoPath);
    expect(omoFile).toBeDefined();

    const registry = new ModelRegistry({
      shellRunner: async () => ({
        stdout: 'anthropic/claude-sonnet-4\nopenai/gpt-4o',
        stderr: '',
        exitCode: 0,
      }),
    });
    await registry.refresh();

    const isolatedConfigs = { opencode: [], omo: [omoFile!] };
    const engine = new SuggestionEngine(registry);
    const suggestions = engine.generate(isolatedConfigs);

    const missing = suggestions.find((s) => s.targetType === 'missing-model');
    expect(missing).toBeDefined();
    expect(missing!.currentValue).toBe('nonexistent/dead-model');
    expect(missing!.suggestedValue).toMatch(/^(anthropic|openai)\//);
    expect(missing!.targetName).toBe('sisyphus');

    const omoData = omoFile!.data as import('../src/types').OmOConfig;
    const enrichTargetName = missing!.targetName;
    let jsonPath: (string | number)[] = [];
    if (omoData?.agents?.[enrichTargetName]) {
      jsonPath = ['agents', enrichTargetName, 'model'];
    }
    expect(jsonPath).toEqual(['agents', 'sisyphus', 'model']);

    rmSync(tmp, { recursive: true, force: true });
  });
});
