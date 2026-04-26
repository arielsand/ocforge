import type { Change, DiffResult } from '../types';

export function generateDiff(filePath: string, changes: Change[]): DiffResult {
  const lines: string[] = [];
  for (const change of changes) {
    const pathStr = change.jsonPath.join('.');
    lines.push(`  ${pathStr}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`);
  }

  return {
    filePath,
    changes,
    summary: `Will modify ${changes.length} value(s) in ${filePath}:\n${lines.join('\n')}`,
  };
}
