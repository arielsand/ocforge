import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { JSONCWriter } from '../../src/core/jsonc-writer';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('jsonc-writer', () => {
  const tmpFile = join(tmpdir(), `ocforge-jsonc-test-${Date.now()}.jsonc`);

  beforeEach(() => {
    writeFileSync(tmpFile, '{\n  // main model\n  "model": "old/model",\n  "agents": {}\n}');
  });

  afterEach(() => {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
    const backups = new Bun.Glob(`${tmpFile}.bak.*`);
    for (const f of backups.scanSync('.')) {
      unlinkSync(f);
    }
  });

  it('updates a value and preserves comments', () => {
    const writer = new JSONCWriter();
    writer.applyChanges(tmpFile, [
      { filePath: tmpFile, jsonPath: ['model'], oldValue: 'old/model', newValue: 'new/model' },
    ]);

    const content = readFileSync(tmpFile, 'utf-8');
    expect(content).toContain('"model": "new/model"');
    expect(content).toContain('// main model');
  });

  it('creates a backup before writing', () => {
    const writer = new JSONCWriter();
    writer.applyChanges(tmpFile, [
      { filePath: tmpFile, jsonPath: ['model'], oldValue: 'old/model', newValue: 'new/model' },
    ]);

    const glob = new Bun.Glob(`${tmpFile}.bak.*`);
    const backups = [...glob.scanSync('.')];
    expect(backups.length).toBeGreaterThan(0);
  });

  it('creates nested paths if missing', () => {
    const writer = new JSONCWriter();
    writer.applyChanges(tmpFile, [
      { filePath: tmpFile, jsonPath: ['agents', 'sisyphus', 'model'], oldValue: undefined, newValue: 'x/y' },
    ]);

    const content = readFileSync(tmpFile, 'utf-8');
    expect(content).toContain('"sisyphus"');
    expect(content).toContain('"model": "x/y"');
  });

  it('verifyChanges returns verified true when changes match', () => {
    const writer = new JSONCWriter();
    writer.applyChanges(tmpFile, [
      { filePath: tmpFile, jsonPath: ['model'], oldValue: 'old/model', newValue: 'new/model' },
    ]);

    const result = writer.verifyChanges(tmpFile, [
      { filePath: tmpFile, jsonPath: ['model'], oldValue: 'old/model', newValue: 'new/model' },
    ]);
    expect(result.verified).toBe(true);
    expect(result.mismatches).toHaveLength(0);
  });

  it('verifyChanges reports mismatches when value differs', () => {
    const writer = new JSONCWriter();
    writer.applyChanges(tmpFile, [
      { filePath: tmpFile, jsonPath: ['model'], oldValue: 'old/model', newValue: 'new/model' },
    ]);

    const result = writer.verifyChanges(tmpFile, [
      { filePath: tmpFile, jsonPath: ['model'], oldValue: 'old/model', newValue: 'wrong/model' },
    ]);
    expect(result.verified).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });

  it('sets fallback_models as a JSON array, not a JSON string (regression)', () => {
    const config = JSON.stringify({
      agents: {
        sisyphus: {
          model: 'provider/model-a',
          fallback_models: ['provider/model-b', 'provider/model-c'],
        },
      },
    }, null, 2);
    writeFileSync(tmpFile, config);

    // BUG FIX: Must pass arrays as arrays, NOT JSON.stringify(strings)
    // Previously, the web UI passed JSON.stringify(fallbacks) which produced
    // a string like '["a","b"]' instead of an actual array.
    const newFallbacks = ['provider/model-b', 'provider/model-c', 'provider/model-d'];
    const writer = new JSONCWriter();
    writer.applyChanges(tmpFile, [
      {
        filePath: tmpFile,
        jsonPath: ['agents', 'sisyphus', 'fallback_models'],
        oldValue: ['provider/model-b', 'provider/model-c'],
        newValue: newFallbacks,
      },
    ]);

    const content = readFileSync(tmpFile, 'utf-8');
    // The value must be a JSON array, not a JSON string
    expect(content).not.toContain('"[\\"provider');
    expect(content).toContain('provider/model-d');

    // Parse and verify it's an actual array, not a string
    const data = JSON.parse(content);
    expect(Array.isArray(data.agents.sisyphus.fallback_models)).toBe(true);
    expect(data.agents.sisyphus.fallback_models).toEqual(newFallbacks);
  });

  it('applies multiple changes to the same file', () => {
    const config = JSON.stringify({
      agents: {
        sisyphus: { model: 'old/a' },
        explore: { model: 'old/b' },
      },
      categories: {
        quick: { model: 'old/c' },
      },
    }, null, 2);
    writeFileSync(tmpFile, config);

    const writer = new JSONCWriter();
    writer.applyChanges(tmpFile, [
      { filePath: tmpFile, jsonPath: ['agents', 'sisyphus', 'model'], oldValue: 'old/a', newValue: 'new/a' },
      { filePath: tmpFile, jsonPath: ['agents', 'explore', 'model'], oldValue: 'old/b', newValue: 'new/b' },
      { filePath: tmpFile, jsonPath: ['categories', 'quick', 'model'], oldValue: 'old/c', newValue: 'new/c' },
    ], false);

    const content = readFileSync(tmpFile, 'utf-8');
    const data = JSON.parse(content);
    expect(data.agents.sisyphus.model).toBe('new/a');
    expect(data.agents.explore.model).toBe('new/b');
    expect(data.categories.quick.model).toBe('new/c');
  });
});
