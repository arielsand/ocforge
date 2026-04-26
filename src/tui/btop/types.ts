import type { ConfigState, ModelInfo, Change } from '../../types';

export type Panel = 'agents' | 'categories' | 'opencode';

export interface AppState {
  configs: ConfigState;
  models: ModelInfo[];
  activePanel: Panel;
  selectedAgent: number;
  selectedCategory: number;
  selectedOpencodeField: number;
  pendingChanges: Change[];
  message: string | null;
  messageType: 'success' | 'error' | 'info' | 'warning';
  showModelPicker: boolean;
  pickerTarget: {
    type: 'agent' | 'category' | 'opencode-model' | 'opencode-small-model';
    name: string;
    filePath: string;
    currentValue: string;
  } | null;
  showSnapshotModal: boolean;
  snapshotName: string;
  snapshotDesc: string;
  snapshots: { name: string; createdAt: string; description?: string }[];
  showOllamaPicker: boolean;
  ollamaModels: { name: string; model: string }[];
  selectedOllamaModel: string;
  ollamaAvailable: boolean;
  aiSuggesting: string | null;
}

export const OPENCODE_FIELDS = ['model', 'small_model'] as const;
