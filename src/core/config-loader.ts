import { parse } from 'jsonc-parser';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import type { ConfigState, ConfigFile, OpenCodeConfig, OmOConfig, OwnedModel } from '../types';

export interface DiscoverOptions {
  cwd?: string;
  globalDir?: string;
}

export function discoverConfigs(options?: DiscoverOptions): ConfigState {
  const baseDir = options?.cwd ? resolve(options.cwd) : process.cwd();
  const globalDir = options?.globalDir ?? join(homedir(), '.config', 'opencode');

  const state: ConfigState = { opencode: [], omo: [] };

  const opencodePaths = [
    { path: join(globalDir, 'opencode.json'), level: 'global' as const },
    { path: join(baseDir, 'opencode.json'), level: 'project' as const },
  ];

  // OmO precedence within same directory: legacy oh-my-opencode wins over oh-my-openagent.
  // Since consumers use omo[0] as primary, legacy files must appear first when both exist.
  const omoPaths = [
    { path: join(globalDir, 'oh-my-opencode.json'), level: 'global' as const },
    { path: join(globalDir, 'oh-my-opencode.jsonc'), level: 'global' as const },
    { path: join(globalDir, 'oh-my-openagent.json'), level: 'global' as const },
    { path: join(globalDir, 'oh-my-openagent.jsonc'), level: 'global' as const },
    { path: join(baseDir, '.opencode', 'oh-my-opencode.json'), level: 'project' as const },
    { path: join(baseDir, '.opencode', 'oh-my-opencode.jsonc'), level: 'project' as const },
    { path: join(baseDir, '.opencode', 'oh-my-openagent.json'), level: 'project' as const },
    { path: join(baseDir, '.opencode', 'oh-my-openagent.jsonc'), level: 'project' as const },
  ];

  for (const { path, level } of opencodePaths) {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      const data = parse(content) as OpenCodeConfig;
      state.opencode.push({ path, level, type: 'opencode', content, data });
    }
  }

  // Deduplicate: keep only the highest-precedence file per level.
  // If both legacy and new-format exist, legacy wins (already first in path list).
  for (const { path, level } of omoPaths) {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      const data = parse(content) as OmOConfig;
      state.omo.push({ path, level, type: 'omo', content, data });
      break; // Only keep highest-precedence file per level
    }
  }

  // Check project-level OmO configs (only if none found at global level was from same path)
  const projectOmoPaths = omoPaths.filter(p => p.level === 'project');
  for (const { path, level } of projectOmoPaths) {
    if (existsSync(path) && !state.omo.some(f => f.path === path)) {
      const content = readFileSync(path, 'utf-8');
      const data = parse(content) as OmOConfig;
      state.omo.push({ path, level, type: 'omo', content, data });
      break;
    }
  }

  return state;
}

export function discoverModelOwners(options?: DiscoverOptions): OwnedModel[] {
  const configs = discoverConfigs(options);
  const owned: OwnedModel[] = [];

  for (const file of configs.opencode) {
    const ocData = file.data as OpenCodeConfig;
    if (ocData.model) {
      owned.push({
        owner: { configType: 'opencode', configPath: file.path, configLevel: file.level },
        name: 'model',
        role: 'top-level-model',
        currentModel: ocData.model,
      });
    }
    if (ocData.small_model) {
      owned.push({
        owner: { configType: 'opencode', configPath: file.path, configLevel: file.level },
        name: 'small_model',
        role: 'top-level-small-model',
        currentModel: ocData.small_model,
      });
    }
    if (ocData.agent) {
      for (const [agentName, agentCfg] of Object.entries(ocData.agent)) {
        const model = (agentCfg as Record<string, unknown>)?.model as string | undefined;
        if (model) {
          owned.push({
            owner: { configType: 'opencode', configPath: file.path, configLevel: file.level },
            name: agentName,
            role: 'agent',
            currentModel: model,
          });
        }
      }
    }
  }

  for (const file of configs.omo) {
    const omoData = file.data as OmOConfig;
    if (omoData.agents) {
      for (const [agentName, agentCfg] of Object.entries(omoData.agents)) {
        const model = (agentCfg as Record<string, unknown>)?.model as string | undefined;
        if (model) {
          owned.push({
            owner: { configType: 'omo', configPath: file.path, configLevel: file.level },
            name: agentName,
            role: 'agent',
            currentModel: model,
          });
        }
      }
    }
    if (omoData.categories) {
      for (const [catName, catCfg] of Object.entries(omoData.categories)) {
        const model = (catCfg as Record<string, unknown>)?.model as string | undefined;
        if (model) {
          owned.push({
            owner: { configType: 'omo', configPath: file.path, configLevel: file.level },
            name: catName,
            role: 'category',
            currentModel: model,
          });
        }
      }
    }
  }

  return owned;
}
