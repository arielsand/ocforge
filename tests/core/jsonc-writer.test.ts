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
});
