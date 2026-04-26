import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  listProfiles,
  saveProfile,
  loadProfile,
  deleteProfile,
  renameProfile,
  applyProfile,
  type Profile,
} from '../../src/core/profile-manager';
import { JSONCWriter } from '../../src/core/jsonc-writer';
import type { OmOConfig, Change } from '../../src/types';

const PROFILES_DIR = join(homedir(), '.config', 'ocforge', 'profiles');
const TEST_DIR = join(homedir(), '.config', 'ocforge', 'test-profiles');

function cleanTestProfiles() {
  if (existsSync(PROFILES_DIR)) {
    rmSync(PROFILES_DIR, { recursive: true });
  }
}

describe('ProfileManager', () => {
  beforeEach(() => {
    cleanTestProfiles();
  });

  afterEach(() => {
    cleanTestProfiles();
  });

  const sampleConfig: OmOConfig = {
    agents: {
      sisyphus: { model: 'ollama-cloud/kimi-k2.6:cloud', fallback_models: ['github-copilot/claude-opus-4.6'] },
      oracle: { model: 'ollama-cloud/glm-5.1' },
    },
    categories: {
      quick: { model: 'ollama-cloud/minimax-m2.5' },
      deep: { model: 'ollama-cloud/glm-5.1', fallback_models: ['github-copilot/claude-sonnet-4.6'] },
    },
  };

  describe('#given a clean profiles directory', () => {
    it('#when listing profiles #then returns empty array', () => {
      const profiles = listProfiles();
      expect(profiles).toEqual([]);
    });

    it('#when saving a profile #then it appears in the list', () => {
      const profile = saveProfile('dev-mode', sampleConfig, 'Development setup');

      expect(profile.name).toBe('dev-mode');
      expect(profile.description).toBe('Development setup');
      expect(profile.assignments.agents.sisyphus.model).toBe('ollama-cloud/kimi-k2.6:cloud');
      expect(profile.assignments.agents.sisyphus.fallback_models).toEqual(['github-copilot/claude-opus-4.6']);
      expect(profile.assignments.agents.oracle.model).toBe('ollama-cloud/glm-5.1');
      expect(profile.assignments.categories.quick.model).toBe('ollama-cloud/minimax-m2.5');
      expect(profile.assignments.categories.deep.model).toBe('ollama-cloud/glm-5.1');

      const profiles = listProfiles();
      expect(profiles).toHaveLength(1);
      expect(profiles[0].name).toBe('dev-mode');
    });

    it('#when loading a saved profile #then returns the correct data', () => {
      saveProfile('test-profile', sampleConfig);
      const loaded = loadProfile('test-profile');

      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe('test-profile');
      expect(loaded!.assignments.agents.sisyphus.model).toBe('ollama-cloud/kimi-k2.6:cloud');
    });

    it('#when loading a nonexistent profile #then returns null', () => {
      const loaded = loadProfile('does-not-exist');
      expect(loaded).toBeNull();
    });

    it('#when deleting a profile #then it is removed', () => {
      saveProfile('to-delete', sampleConfig);
      expect(listProfiles()).toHaveLength(1);

      const deleted = deleteProfile('to-delete');
      expect(deleted).toBe(true);
      expect(listProfiles()).toHaveLength(0);
    });

    it('#when deleting a nonexistent profile #then returns false', () => {
      const deleted = deleteProfile('does-not-exist');
      expect(deleted).toBe(false);
    });

    it('#when renaming a profile #then new name exists and old name does not', () => {
      saveProfile('old-name', sampleConfig);
      const renamed = renameProfile('old-name', 'new-name');

      expect(renamed).toBe(true);
      expect(loadProfile('old-name')).toBeNull();
      expect(loadProfile('new-name')).not.toBeNull();
      expect(loadProfile('new-name')!.name).toBe('new-name');
    });

    it('#when renaming to an existing name #then returns false', () => {
      saveProfile('existing', sampleConfig);
      saveProfile('source', sampleConfig);
      const renamed = renameProfile('source', 'existing');
      expect(renamed).toBe(false);
    });

    it('#when saving a profile with special characters #then name is sanitized', () => {
      saveProfile('My Profile!@#', sampleConfig);
      expect(listProfiles()).toHaveLength(1);
      expect(listProfiles()[0].name).toBe('My Profile!@#');
    });

    it('#when updating a profile #then createdAt is preserved', () => {
      const first = saveProfile('update-test', sampleConfig);
      const createdAt = first.createdAt;

      // Wait a tiny bit to ensure different updatedAt
      Bun.sleepSync(10);

      const second = saveProfile('update-test', sampleConfig);
      expect(second.createdAt).toBe(createdAt);
      expect(second.updatedAt).not.toBe(createdAt);
    });
  });

  describe('#given an existing profile', () => {
    it('#when applying profile #then changes are generated', () => {
      saveProfile('apply-test', sampleConfig);

      const mockWriter = {
        applyChanges: (_path: string, _changes: Change[], _backup: boolean) => {
          // no-op
        },
      };

      const currentConfig: OmOConfig = {
        agents: {
          sisyphus: { model: 'old-model' },
          oracle: { model: 'another-old' },
        },
        categories: {
          quick: { model: 'old-quick' },
          deep: { model: 'old-deep' },
        },
      };

      const result = applyProfile('apply-test', '/fake/path.json', currentConfig, mockWriter as JSONCWriter);

      expect(result.success).toBe(true);
      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.message).toContain('Applied profile');

      // Verify changes point to correct paths
      const sisyphusChange = result.changes.find((c) => c.jsonPath[1] === 'sisyphus' && c.jsonPath[2] === 'model');
      expect(sisyphusChange).toBeDefined();
      expect(sisyphusChange!.newValue).toBe('ollama-cloud/kimi-k2.6:cloud');
    });

    it('#when applying profile to matching config #then returns no changes', () => {
      saveProfile('no-change', sampleConfig);

      const mockWriter = {
        applyChanges: (_path: string, _changes: Change[], _backup: boolean) => {
          throw new Error('Should not be called');
        },
      };

      const result = applyProfile('no-change', '/fake/path.json', sampleConfig, mockWriter as JSONCWriter);

      expect(result.success).toBe(true);
      expect(result.changes).toHaveLength(0);
      expect(result.message).toContain('already matches');
    });

    it('#when applying nonexistent profile #then returns error', () => {
      const result = applyProfile('missing', '/fake/path.json', sampleConfig);

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('#given profile sorting', () => {
    it('#when listing profiles #then sorted by updatedAt descending', () => {
      saveProfile('oldest', sampleConfig);
      Bun.sleepSync(20);
      saveProfile('middle', sampleConfig);
      Bun.sleepSync(20);
      saveProfile('newest', sampleConfig);

      const profiles = listProfiles();
      expect(profiles[0].name).toBe('newest');
      expect(profiles[1].name).toBe('middle');
      expect(profiles[2].name).toBe('oldest');
    });
  });
});
