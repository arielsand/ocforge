import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface Snapshot {
  name: string;
  createdAt: string;
  description?: string;
  configs: SnapshotConfig[];
}

interface SnapshotConfig {
  path: string;
  type: 'opencode' | 'omo';
  content: string;
}

const SNAPSHOTS_DIR = join(homedir(), '.config', 'ocforge', 'snapshots');

function ensureDir() {
  if (!existsSync(SNAPSHOTS_DIR)) {
    mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
}

export function listSnapshots(): Snapshot[] {
  ensureDir();
  const files = readdirSync(SNAPSHOTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const content = readFileSync(join(SNAPSHOTS_DIR, f), 'utf-8');
      return JSON.parse(content) as Snapshot;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return files;
}

export function saveSnapshot(name: string, configs: { path: string; type: 'opencode' | 'omo'; content: string }[], description?: string): Snapshot {
  ensureDir();
  const snapshot: Snapshot = {
    name,
    createdAt: new Date().toISOString(),
    description,
    configs,
  };
  const filename = `${sanitizeName(name)}-${Date.now()}.json`;
  writeFileSync(join(SNAPSHOTS_DIR, filename), JSON.stringify(snapshot, null, 2), 'utf-8');
  return snapshot;
}

export function loadSnapshot(name: string): Snapshot | null {
  const snapshots = listSnapshots();
  return snapshots.find((s) => s.name === name) || null;
}

export function deleteSnapshot(name: string): boolean {
  ensureDir();
  const files = readdirSync(SNAPSHOTS_DIR).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const content = readFileSync(join(SNAPSHOTS_DIR, file), 'utf-8');
    const snapshot = JSON.parse(content) as Snapshot;
    if (snapshot.name === name) {
      unlinkSync(join(SNAPSHOTS_DIR, file));
      return true;
    }
  }
  return false;
}
