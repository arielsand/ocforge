import { writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface ReloadResult {
  method: 'opencode-reload' | 'signal-file' | 'prompt-user';
  success: boolean;
  message: string;
}

/**
 * Attempt to trigger a config reload in running OpenCode/OmO instances.
 *
 * Strategies tried in order:
 * 1. `opencode reload` CLI command — if opencode is in PATH and supports it
 * 2. Signal file `~/.config/opencode/.reload-requested` — picked up by hot_reload watchers
 * 3. Prompt the user to manually reload
 */
export async function signalReload(configDir?: string): Promise<ReloadResult> {
  const globalDir = configDir ?? join(homedir(), '.config', 'opencode');

  try {
    const proc = Bun.spawn(['opencode', 'reload'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      return {
        method: 'opencode-reload',
        success: true,
        message: 'OpenCode reload signal sent via CLI.',
      };
    }
  } catch {
    // opencode not in PATH
  }

  // Fallback: create signal file for hot_reload watchers
  try {
    const signalPath = join(globalDir, '.reload-requested');
    writeFileSync(signalPath, new Date().toISOString(), 'utf-8');
    return {
      method: 'signal-file',
      success: true,
      message: `Reload signal file created at ${signalPath}. OpenCode will pick it up if hot_reload is enabled.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      method: 'signal-file',
      success: false,
      message: `Failed to create reload signal file: ${msg}`,
    };
  }
}

/**
 * Format a reload result into a user-facing message for the TUI.
 */
export function formatReloadMessage(result: ReloadResult): string {
  if (result.success && result.method === 'opencode-reload') {
    return '✅ Config changes applied. OpenCode reload signal sent.';
  }

  if (result.success && result.method === 'signal-file') {
    return (
      '✅ Config changes applied.\n' +
      '⚠️  Reload signal file created. OpenCode will pick up changes if hot_reload is enabled.\n' +
      '   Otherwise, run /reload in OpenCode or restart it.'
    );
  }

  return (
    '✅ Config changes applied.\n' +
    '⚠️  Could not auto-reload. Run /reload in OpenCode, or restart it to apply changes.'
  );
}