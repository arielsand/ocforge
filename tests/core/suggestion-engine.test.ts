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

  it('suggests replacement when configured provider does not exist', async () => {
    const engine = await createEngine(
      'anthropic/claude-sonnet-4\nopenai/gpt-4o\ngoogle/gemini-2-flash'
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
            sisyphus: { model: 'nonexistent/some-model' },
          },
        },
      }],
    };

    const suggestions = engine.generate(configs);
    const missing = suggestions.find((s) => s.targetType === 'missing-model' && s.targetName === 'sisyphus');
    expect(missing).toBeDefined();
    expect(missing!.currentValue).toBe('nonexistent/some-model');
    expect(missing!.suggestedValue).toMatch(/^(anthropic|openai|google)\//);
    expect(missing!.confidence).toBe(0.7);
  });

  it('suggests same-provider replacement when model removed but provider exists', async () => {
    const engine = await createEngine(
      'anthropic/claude-sonnet-4\nanthropic/claude-haiku-3\nopenai/gpt-4o'
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
            oracle: { model: 'anthropic/claude-opus-4' },
          },
        },
      }],
    };

    const suggestions = engine.generate(configs);
    const missing = suggestions.find((s) => s.targetType === 'missing-model');
    expect(missing).toBeDefined();
    expect(missing!.suggestedValue).toMatch(/^anthropic\//);
  });

  it('does not emit missing-model suggestions when all models are available', async () => {
    const engine = await createEngine(
      'anthropic/claude-sonnet-4\nopenai/gpt-4o'
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
            sisyphus: { model: 'anthropic/claude-sonnet-4' },
          },
        },
      }],
    };

    const suggestions = engine.generate(configs);
    const missing = suggestions.filter((s) => s.targetType === 'missing-model');
    expect(missing).toHaveLength(0);
  });

  it('handles empty available models gracefully', async () => {
    const engine = await createEngine('');
    const configs: ConfigState = {
      opencode: [],
      omo: [{
        path: '/tmp/omo.json',
        level: 'project',
        type: 'omo',
        content: '',
        data: {
          agents: {
            sisyphus: { model: 'anthropic/claude-opus-4' },
          },
        },
      }],
    };

    const suggestions = engine.generate(configs);
    const missing = suggestions.filter((s) => s.targetType === 'missing-model');
    expect(missing).toHaveLength(0);
  });

  it('detects missing opencode model and suggests replacement', async () => {
    const engine = await createEngine(
      'anthropic/claude-sonnet-4\nopenai/gpt-4o'
    );
    const configs: ConfigState = {
      opencode: [{
        path: '/tmp/opencode.json',
        level: 'project',
        type: 'opencode',
        content: '',
        data: {
          model: 'openai/gpt-5',
        },
      }],
      omo: [],
    };

    const suggestions = engine.generate(configs);
    const missing = suggestions.find(
      (s) => s.targetType === 'missing-model' && s.targetName === 'model'
    );
    expect(missing).toBeDefined();
    expect(missing!.suggestedValue).toMatch(/^(anthropic|openai)\//);
  });
});
