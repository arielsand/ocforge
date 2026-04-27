import { writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import type { ReloadResult } from '../types';

/**
 * Discover the port of the running OpenCode server process.
 * Uses OPENCODE_PID env var + lsof to find the listening port.
 */
function discoverOpenCodePort(): number | null {
  const pid = process.env['OPENCODE_PID'];
  if (pid) {
    const port = getPortFromPid(parseInt(pid, 10));
    if (port) return port;
  }

  return null;
}

function getPortFromPid(pid: number): number | null {
  try {
    const output = execFileSync('lsof', ['-i', '-P', '-n', '-p', String(pid)], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const pidStr = String(pid);
    // lsof output: opencode- 1654 arielsand    7u     IPv4 ... TCP 127.0.0.1:49806 (LISTEN)
    // Must filter by PID column to exclude child processes (nginx, etc.)
    for (const line of output.split('\n')) {
      if (!line.includes('(LISTEN)')) continue;
      const columns = line.trim().split(/\s+/);
      if (columns.length >= 2 && columns[1] === pidStr) {
        const tcpPart = columns.find((c) => c.startsWith('TCP') || c.includes(':'));
        // The address with port is in a column like "127.0.0.1:49806" or "[::1]:49806"
        for (const col of columns) {
          const addrMatch = col.match(/:(\d+)$/);
          if (addrMatch) return parseInt(addrMatch[1], 10);
        }
      }
    }
  } catch {
    // lsof not available or PID not found
  }

  return null;
}

/**
 * Find the OpenCode TUI process (Node.js) that handles SIGUSR2.
 * OPENCODE_PID points to the Go serve process, not the Node.js TUI.
 */
function findTuiPid(): number | null {
  try {
    const output = execFileSync('pgrep', ['-f', '/opencode-ai/bin/.opencode'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const pids = output.trim().split('\n').map(Number).filter((p) => !isNaN(p) && p > 0);
    return pids.length > 0 ? pids[0] : null;
  } catch {
    return null;
  }
}

/**
 * Send SIGUSR2 to trigger OpenCode's Config.invalidate(true).
 * This is the same mechanism the /reload slash command uses internally.
 */
function sendSigusr2(pid: number): boolean {
  try {
    process.kill(pid, 'SIGUSR2');
    return true;
  } catch {
    return false;
  }
}

/**
 * Trigger a config reload in running OpenCode/OmO instances.
 *
 * 1. SIGUSR2 — sends signal to the TUI process (same as /reload internally)
 * 2. Signal file — ~/.config/opencode/.reload-requested for OmO hot_reload watchers
 * 3. Fallback — user must manually /reload or restart
 */
export async function signalReload(configDir?: string): Promise<ReloadResult> {
  const globalDir = configDir ?? join(homedir(), '.config', 'opencode');

  const tuiPid = findTuiPid();
  if (tuiPid) {
    const sent = sendSigusr2(tuiPid);
    if (sent) {
      const port = discoverOpenCodePort();
      return {
        method: 'sigusr2',
        success: true,
        message: `Config reload signal sent to OpenCode (PID ${tuiPid}).${
          port ? ` Server on port ${port}.` : ''
        } Run /reload in OpenCode if changes are not reflected.`,
      };
    }
  }

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

export function formatReloadMessage(result: ReloadResult): string {
  if (result.success && result.method === 'sigusr2') {
    return '✅ Config changes applied. OpenCode reload signal sent (SIGUSR2). Changes should be reflected shortly.';
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