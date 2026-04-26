import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { AgentConfig, CategoryConfig, OmOConfig } from '../types';
import { JSONCWriter } from './jsonc-writer';
import type { Change } from '../types';

export interface ProfileAssignment {
  model?: string;
  fallback_models?: (string | { model: string; [key: string]: unknown })[];
}

export interface Profile {
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  assignments: {
    agents: Record<string, ProfileAssignment>;
    categories: Record<string, ProfileAssignment>;
  };
}

const PROFILES_DIR = join(homedir(), '.config', 'ocforge', 'profiles');

function ensureDir() {
  if (!existsSync(PROFILES_DIR)) {
    mkdirSync(PROFILES_DIR, { recursive: true });
  }
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
}

function profilePath(name: string): string {
  return join(PROFILES_DIR, `${sanitizeName(name)}.json`);
}

export function listProfiles(): Profile[] {
  ensureDir();
  return readdirSync(PROFILES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const content = readFileSync(join(PROFILES_DIR, f), 'utf-8');
      return JSON.parse(content) as Profile;
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function saveProfile(
  name: string,
  config: OmOConfig,
  description?: string
): Profile {
  ensureDir();

  const agents: Record<string, ProfileAssignment> = {};
  const categories: Record<string, ProfileAssignment> = {};

  if (config.agents) {
    for (const [agentName, agent] of Object.entries(config.agents)) {
      const assignment: ProfileAssignment = {};
      if (agent.model) assignment.model = agent.model;
      if (agent.fallback_models) assignment.fallback_models = agent.fallback_models;
      if (Object.keys(assignment).length > 0) {
        agents[agentName] = assignment;
      }
    }
  }

  if (config.categories) {
    for (const [catName, cat] of Object.entries(config.categories)) {
      const assignment: ProfileAssignment = {};
      if (cat.model) assignment.model = cat.model;
      if (cat.fallback_models) assignment.fallback_models = cat.fallback_models;
      if (Object.keys(assignment).length > 0) {
        categories[catName] = assignment;
      }
    }
  }

  const now = new Date().toISOString();
  const existing = loadProfile(name);

  const profile: Profile = {
    name,
    description,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    assignments: { agents, categories },
  };

  writeFileSync(profilePath(name), JSON.stringify(profile, null, 2), 'utf-8');
  return profile;
}

export function loadProfile(name: string): Profile | null {
  const path = profilePath(name);
  if (!existsSync(path)) return null;
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content) as Profile;
}

export function deleteProfile(name: string): boolean {
  const path = profilePath(name);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

export function renameProfile(oldName: string, newName: string): boolean {
  const oldPath = profilePath(oldName);
  const newPath = profilePath(newName);
  if (!existsSync(oldPath) || existsSync(newPath)) return false;

  const content = readFileSync(oldPath, 'utf-8');
  const profile = JSON.parse(content) as Profile;
  profile.name = newName;
  profile.updatedAt = new Date().toISOString();

  writeFileSync(newPath, JSON.stringify(profile, null, 2), 'utf-8');
  unlinkSync(oldPath);
  return true;
}

function pick<T extends Record<string, unknown>>(obj: T, keys: string[]): Partial<T> {
  const result: Partial<T> = {};
  for (const key of keys) {
    if (key in obj) {
      (result as Record<string, unknown>)[key] = obj[key];
    }
  }
  return result;
}

function buildAgentChanges(
  agentName: string,
  assignment: ProfileAssignment,
  currentAgent: AgentConfig | undefined
): Change[] {
  const changes: Change[] = [];

  if (assignment.model !== undefined && assignment.model !== currentAgent?.model) {
    changes.push({
      filePath: '',
      jsonPath: ['agents', agentName, 'model'],
      oldValue: currentAgent?.model,
      newValue: assignment.model,
    });
  }

  const currentFallbacks = currentAgent?.fallback_models;
  const shouldSetFallbacks =
    assignment.fallback_models !== undefined &&
    JSON.stringify(assignment.fallback_models) !== JSON.stringify(currentFallbacks);

  if (shouldSetFallbacks) {
    changes.push({
      filePath: '',
      jsonPath: ['agents', agentName, 'fallback_models'],
      oldValue: currentFallbacks,
      newValue: assignment.fallback_models,
    });
  }

  return changes;
}

function buildCategoryChanges(
  catName: string,
  assignment: ProfileAssignment,
  currentCat: CategoryConfig | undefined
): Change[] {
  const changes: Change[] = [];

  if (assignment.model !== undefined && assignment.model !== currentCat?.model) {
    changes.push({
      filePath: '',
      jsonPath: ['categories', catName, 'model'],
      oldValue: currentCat?.model,
      newValue: assignment.model,
    });
  }

  const currentFallbacks = currentCat?.fallback_models;
  const shouldSetFallbacks =
    assignment.fallback_models !== undefined &&
    JSON.stringify(assignment.fallback_models) !== JSON.stringify(currentFallbacks);

  if (shouldSetFallbacks) {
    changes.push({
      filePath: '',
      jsonPath: ['categories', catName, 'fallback_models'],
      oldValue: currentFallbacks,
      newValue: assignment.fallback_models,
    });
  }

  return changes;
}

export function applyProfile(
  profileName: string,
  configPath: string,
  currentConfig: OmOConfig,
  writer = new JSONCWriter()
): { success: boolean; changes: Change[]; message: string } {
  const profile = loadProfile(profileName);
  if (!profile) {
    return { success: false, changes: [], message: `Profile "${profileName}" not found` };
  }

  const changes: Change[] = [];

  for (const [agentName, assignment] of Object.entries(profile.assignments.agents)) {
    const currentAgent = currentConfig.agents?.[agentName];
    const agentChanges = buildAgentChanges(agentName, assignment, currentAgent);
    changes.push(...agentChanges);
  }

  for (const [catName, assignment] of Object.entries(profile.assignments.categories)) {
    const currentCat = currentConfig.categories?.[catName];
    const catChanges = buildCategoryChanges(catName, assignment, currentCat);
    changes.push(...catChanges);
  }

  if (changes.length === 0) {
    return { success: true, changes: [], message: 'Profile already matches current config' };
  }

  writer.applyChanges(configPath, changes, true);

  const agentCount = Object.keys(profile.assignments.agents).length;
  const catCount = Object.keys(profile.assignments.categories).length;
  return {
    success: true,
    changes,
    message: `Applied profile "${profileName}" (${agentCount} agents, ${catCount} categories)`,
  };
}
