import { modify, applyEdits, parse } from 'jsonc-parser';
import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import type { Change } from '../types';

export class JSONCWriter {
  applyChanges(filePath: string, changes: Change[], createBackup: boolean = true): void {
    let text = readFileSync(filePath, 'utf-8');

    if (createBackup) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      copyFileSync(filePath, `${filePath}.bak.${timestamp}`);
    }

    // Re-read right before writing to detect concurrent modification
    const textBeforeApply = readFileSync(filePath, 'utf-8');
    if (textBeforeApply !== text) {
      throw new Error(
        `Concurrent modification detected for ${filePath}. ` +
        `The file was changed after we read it. Please retry.`
      );
    }

    const allEdits = changes
      .map((change) =>
        modify(text, change.jsonPath, change.newValue, {
          formattingOptions: {
            insertSpaces: true,
            tabSize: 2,
            eol: '\n',
          },
        })
      )
      .flat();

    text = applyEdits(text, allEdits);
    writeFileSync(filePath, text, 'utf-8');
  }

  verifyChanges(filePath: string, changes: Change[]): { verified: boolean; mismatches: string[] } {
    const content = readFileSync(filePath, 'utf-8');
    const data = parse(content) as Record<string, unknown>;
    const mismatches: string[] = [];

    for (const change of changes) {
      const actual = getNestedValue(data, change.jsonPath);
      if (JSON.stringify(actual) !== JSON.stringify(change.newValue)) {
        mismatches.push(
          `Path ${change.jsonPath.join('.')}: expected ${JSON.stringify(change.newValue)}, got ${JSON.stringify(actual)}`
        );
      }
    }

    return { verified: mismatches.length === 0, mismatches };
  }
}

function getNestedValue(obj: unknown, path: (string | number)[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current === null || current === undefined) return undefined;
    if (typeof key === 'number') {
      current = (current as unknown[])[key];
    } else {
      current = (current as Record<string, unknown>)[key];
    }
  }
  return current;
}
