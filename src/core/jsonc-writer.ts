import { modify, applyEdits } from 'jsonc-parser';
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
}
