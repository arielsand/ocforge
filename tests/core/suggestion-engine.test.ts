import { describe, expect, it } from 'bun:test';
import { SuggestionEngine } from '../../src/core/suggestion-engine';
import { ModelRegistry } from '../../src/core/model-registry';
import type { ConfigState } from '../../src/types';

describe('suggestion-engine', () => {
  async function createEngine(stdout: string) {
    const registry = new ModelRegistry({
      shellRunner: async () => ({ stdout, stderr: '', exitCode: 0 }),
    });
    await registry.refresh();
    return new SuggestionEngine(registry);
  }

  it('suggests a better model for sisyphus when a new orchestrator is available', async () => {
    const engine = await createEngine(
      'anthropic/claude-opus-4-7\nopenai/gpt-5.5\ngoogle/gemini-3-flash'
    );
    const configs: ConfigState = {
      opencode: [],
      omo: [{
        path: '/tmp/omo.json',
        level: 'project',
        type: 'omo',
        content: '',
        data: {
          agents: {
            sisyphus: { model: 'anthropic/claude-opus-4-7' },
            explore: { model: 'google/gemini-3-flash' },
          },
        },
      }],
    };

    const suggestions = engine.generate(configs);
    const sisyphusSuggestion = suggestions.find(s => s.targetName === 'sisyphus');
    expect(sisyphusSuggestion).toBeDefined();
    expect(sisyphusSuggestion!.suggestedValue).toBe('openai/gpt-5.5');
  });

  it('does not suggest the same model', async () => {
    const engine = await createEngine('anthropic/claude-opus-4-7');
    const configs: ConfigState = {
      opencode: [],
      omo: [{
        path: '/tmp/omo.json',
        level: 'project',
        type: 'omo',
        content: '',
        data: {
          agents: { sisyphus: { model: 'anthropic/claude-opus-4-7' } },
        },
      }],
    };

    const suggestions = engine.generate(configs);
    expect(suggestions).toHaveLength(0);
  });
});
