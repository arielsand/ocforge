import { describe, expect, it } from 'bun:test';
import { ModelRegistry } from '../../src/core/model-registry';

describe('model-registry', () => {
  it('parses opencode models output into structured ModelInfo', async () => {
    const mockRunner = async () => ({
      stdout: 'anthropic/claude-sonnet-4-5\nopenai/gpt-5.4\ngoogle/gemini-3.1-pro',
      stderr: '',
      exitCode: 0,
    });

    const registry = new ModelRegistry({ shellRunner: mockRunner });
    const models = await registry.refresh();

    expect(models).toHaveLength(3);
    expect(models[0].id).toBe('anthropic/claude-sonnet-4-5');
    expect(models[0].provider).toBe('anthropic');
    expect(models[0].priceTier).toBe('sonnet');
    expect(models[2].capabilities.multimodal).toBe(true);
  });

  it('finds a model by id', async () => {
    const mockRunner = async () => ({
      stdout: 'anthropic/claude-opus-4-7',
      stderr: '',
      exitCode: 0,
    });

    const registry = new ModelRegistry({ shellRunner: mockRunner });
    await registry.refresh();

    expect(registry.findById('anthropic/claude-opus-4-7')).toBeDefined();
    expect(registry.findById('missing/model')).toBeUndefined();
  });

  it('throws on non-zero exit code', async () => {
    const mockRunner = async () => ({
      stdout: '',
      stderr: 'command not found',
      exitCode: 1,
    });

    const registry = new ModelRegistry({ shellRunner: mockRunner });
    await expect(registry.refresh()).rejects.toThrow('Failed to list models');
  });
});
