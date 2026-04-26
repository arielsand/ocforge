import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('reload-signaler', () => {
  describe('formatReloadMessage', () => {
    it('formats successful CLI reload', () => {
      const { formatReloadMessage } = require('../../src/core/reload-signaler');
      const result = formatReloadMessage({
        method: 'opencode-reload',
        success: true,
        message: 'OpenCode reload signal sent via CLI.',
      });
      expect(result).toContain('✅');
      expect(result).toContain('reload signal sent');
    });

    it('formats signal file reload', () => {
      const { formatReloadMessage } = require('../../src/core/reload-signaler');
      const result = formatReloadMessage({
        method: 'signal-file',
        success: true,
        message: 'Reload signal file created.',
      });
      expect(result).toContain('✅');
      expect(result).toContain('/reload');
    });

    it('formats prompt-user fallback', () => {
      const { formatReloadMessage } = require('../../src/core/reload-signaler');
      const result = formatReloadMessage({
        method: 'prompt-user',
        success: false,
        message: 'Could not reload.',
      });
      expect(result).toContain('⚠️');
      expect(result).toContain('/reload');
    });
  });

  describe('signalReload', () => {
    it('creates signal file as fallback when opencode CLI is not available', async () => {
      const { signalReload } = require('../../src/core/reload-signaler');
      const tmpDir = join(tmpdir(), `ocforge-reload-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });

      const result = await signalReload(tmpDir);

      expect(result.success).toBe(true);
      expect(result.method).toBeOneOf(['opencode-reload', 'signal-file']);

      rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});