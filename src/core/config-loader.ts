import { parse } from 'jsonc-parser';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import type { ConfigState, ConfigFile, OpenCodeConfig, OmOConfig } from '../types';

export function discoverConfigs(cwd?: string): ConfigState {
  const baseDir = cwd ? resolve(cwd) : process.cwd();
  const globalDir = join(homedir(), '.config', 'opencode');

  const state: ConfigState = { opencode: [], omo: [] };

  const opencodePaths = [
    { path: join(globalDir, 'opencode.json'), level: 'global' as const },
    { path: join(baseDir, 'opencode.json'), level: 'project' as const },
  ];

  const omoPaths = [
    { path: join(globalDir, 'oh-my-openagent.json'), level: 'global' as const },
    { path: join(globalDir, 'oh-my-openagent.jsonc'), level: 'global' as const },
    { path: join(globalDir, 'oh-my-opencode.json'), level: 'global' as const },
    { path: join(globalDir, 'oh-my-opencode.jsonc'), level: 'global' as const },
    { path: join(baseDir, '.opencode', 'oh-my-openagent.json'), level: 'project' as const },
    { path: join(baseDir, '.opencode', 'oh-my-openagent.jsonc'), level: 'project' as const },
    { path: join(baseDir, '.opencode', 'oh-my-opencode.json'), level: 'project' as const },
    { path: join(baseDir, '.opencode', 'oh-my-opencode.jsonc'), level: 'project' as const },
  ];

  for (const { path, level } of opencodePaths) {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      const data = parse(content) as OpenCodeConfig;
      state.opencode.push({ path, level, type: 'opencode', content, data });
    }
  }

  for (const { path, level } of omoPaths) {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      const data = parse(content) as OmOConfig;
      state.omo.push({ path, level, type: 'omo', content, data });
    }
  }

  return state;
}
