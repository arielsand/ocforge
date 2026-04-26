import { describe, expect, it } from 'bun:test';
import { generateDiff } from '../../src/core/diff-preview';

describe('diff-preview', () => {
  it('generates a summary of changes', () => {
    const result = generateDiff('/tmp/config.json', [
      { filePath: '/tmp/config.json', jsonPath: ['model'], oldValue: 'a/b', newValue: 'c/d' },
      { filePath: '/tmp/config.json', jsonPath: ['agents', 'x', 'model'], oldValue: 'e/f', newValue: 'g/h' },
    ]);

    expect(result.filePath).toBe('/tmp/config.json');
    expect(result.changes).toHaveLength(2);
    expect(result.summary).toContain('model: "a/b" → "c/d"');
    expect(result.summary).toContain('agents.x.model: "e/f" → "g/h"');
  });
});
