import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const OMO_PLUGIN_PATTERNS = ['oh-my-openagent', 'oh-my-opencode'];

export interface OmOVersionInfo {
  detected: boolean;
  version: string | null;
  pluginName: string | null;
  configPath: string | null;
}

export function detectOmOVersion(globalDir?: string): OmOVersionInfo {
  const dir = globalDir ?? join(homedir(), '.config', 'opencode');

  for (const pattern of OMO_PLUGIN_PATTERNS) {
    const pkgPath = join(dir, 'node_modules', pattern, 'package.json');
    try {
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        return {
          detected: true,
          version: pkg.version ?? null,
          pluginName: pattern,
          configPath: pkgPath,
        };
      }
    } catch {
      // intentional fallthrough
    }
  }

  try {
    const proc = Bun.spawn(['opencode', '--version'], { stdout: 'pipe', stderr: 'pipe' });
    proc.kill();
  } catch {
    // intentional fallthrough
  }

  return { detected: false, version: null, pluginName: null, configPath: null };
}

// Bug #1573 (uiSelectedModel overriding userModel) was fixed in PR #1578, merged Feb 7, 2026.
// We conservatively return false since exact fix version is unknown.
export function hasBug1573Fix(versionInfo: OmOVersionInfo): boolean {
  if (!versionInfo.detected || !versionInfo.version) return false;
  return false;
}

export function formatVersionWarning(versionInfo: OmOVersionInfo): string | null {
  if (!versionInfo.detected) {
    return '⚠️  Could not detect OmO version. Model cache issue (#1573) may cause config changes to be ignored.';
  }

  if (!hasBug1573Fix(versionInfo)) {
    return (
      '⚠️  Your OmO version may be affected by model cache bug (#1573).\n' +
      '   If model changes don\'t take effect, try: /reload in OpenCode, or restart it.'
    );
  }

  return null;
}