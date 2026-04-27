import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ReloadResult } from '../../src/types';

describe('reload-signaler', () => {
  describe('formatReloadMessage', () => {
    it('formats successful SIGUSR2 reload', () => {
      const { formatReloadMessage } = require('../../src/core/reload-signaler');
      const result: ReloadResult = {
        method: 'sigusr2',
        success: true,
        message: 'Config reload signal sent to OpenCode (PID 1234).',
      };
      const output = formatReloadMessage(result);
      expect(output).toContain('✅');
      expect(output).toContain('SIGUSR2');
    });

    it('formats signal file reload', () => {
      const { formatReloadMessage } = require('../../src/core/reload-signaler');
      const result: ReloadResult = {
        method: 'signal-file',
        success: true,
        message: 'Reload signal file created.',
      };
      const output = formatReloadMessage(result);
      expect(output).toContain('✅');
      expect(output).toContain('/reload');
    });

    it('formats prompt-user fallback', () => {
      const { formatReloadMessage } = require('../../src/core/reload-signaler');
      const result: ReloadResult = {
        method: 'prompt-user',
        success: false,
        message: 'Could not reload.',
      };
      const output = formatReloadMessage(result);
      expect(output).toContain('⚠️');
      expect(output).toContain('/reload');
    });
  });

  describe('signalReload', () => {
    it('creates signal file when SIGUSR2 is not available', async () => {
      const { signalReload } = require('../../src/core/reload-signaler');
      const tmpDir = join(tmpdir(), `ocforge-reload-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });

      const result = await signalReload(tmpDir);

      expect(result.success).toBe(true);
      expect(result.method).toBeOneOf(['sigusr2', 'signal-file']);

      if (result.method === 'signal-file') {
        expect(existsSync(join(tmpDir, '.reload-requested'))).toBe(true);
      }

      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns sigusr2 method when TUI process is found', async () => {
      // Environment-dependent: if pgrep finds an opencode TUI process
      // AND we can send SIGUSR2, it should succeed.
      const { signalReload } = require('../../src/core/reload-signaler');
      const result = await signalReload();

      if (result.method === 'sigusr2') {
        expect(result.success).toBe(true);
        expect(result.message).toContain('reload signal sent');
      }
    });
  });
});