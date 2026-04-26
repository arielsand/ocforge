import { describe, expect, it } from 'bun:test';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

describe('version-detector', () => {
  describe('detectOmOVersion', () => {
    it('returns undetected when OmO is not installed', () => {
      const { detectOmOVersion } = require('../../src/core/version-detector');
      const result = detectOmOVersion('/nonexistent/path');
      expect(result.detected).toBe(false);
      expect(result.version).toBeNull();
    });
  });

  describe('formatVersionWarning', () => {
    it('returns warning when version is not detected', () => {
      const { formatVersionWarning } = require('../../src/core/version-detector');
      const result = formatVersionWarning({ detected: false, version: null, pluginName: null, configPath: null });
      expect(result).toContain('#1573');
    });

    it('returns warning when bug fix is not confirmed', () => {
      const { formatVersionWarning } = require('../../src/core/version-detector');
      const result = formatVersionWarning({
        detected: true,
        version: '1.0.0',
        pluginName: 'oh-my-openagent',
        configPath: '/some/path',
      });
      expect(result).toContain('#1573');
    });
  });

  describe('hasBug1573Fix', () => {
    it('returns false when version is not detected', () => {
      const { hasBug1573Fix } = require('../../src/core/version-detector');
      expect(hasBug1573Fix({ detected: false, version: null, pluginName: null, configPath: null })).toBe(false);
    });

    it('returns false conservatively even with detected version', () => {
      const { hasBug1573Fix } = require('../../src/core/version-detector');
      expect(hasBug1573Fix({ detected: true, version: '2.0.0', pluginName: 'oh-my-openagent', configPath: '/path' })).toBe(false);
    });
  });
});