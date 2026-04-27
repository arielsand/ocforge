export interface ModelCapabilities {
  multimodal: boolean;
  thinking: boolean;
  reasoning: boolean;
  maxTokens?: number;
}

export type PriceTier = 'nano' | 'mini' | 'flash' | 'standard' | 'sonnet' | 'opus' | 'unknown';

export interface ModelInfo {
  id: string;
  provider: string;
  modelId: string;
  capabilities: ModelCapabilities;
  priceTier: PriceTier;
}

export interface AgentConfig {
  model?: string;
  variant?: string;
  fallback_models?: (string | { model: string; [key: string]: unknown })[];
  temperature?: number;
  top_p?: number;
  prompt?: string;
  prompt_append?: string;
  tools?: Record<string, boolean>;
  disable?: boolean;
  mode?: string;
  color?: string;
  permission?: Record<string, unknown>;
  category?: string;
  maxTokens?: number;
  thinking?: { type: string; budgetTokens?: number };
  reasoningEffort?: string;
  textVerbosity?: string;
  providerOptions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CategoryConfig {
  model?: string;
  fallback_models?: (string | { model: string; [key: string]: unknown })[];
  temperature?: number;
  top_p?: number;
  maxTokens?: number;
  thinking?: { type: string; budgetTokens?: number };
  reasoningEffort?: string;
  textVerbosity?: string;
  tools?: string[];
  prompt_append?: string;
  variant?: string;
  description?: string;
  is_unstable_agent?: boolean;
  [key: string]: unknown;
}

export interface OpenCodeConfig {
  model?: string;
  small_model?: string;
  provider?: Record<string, { options?: Record<string, unknown>; models?: Record<string, unknown> }>;
  agent?: Record<string, AgentConfig>;
  disabled_providers?: string[];
  enabled_providers?: string[];
  [key: string]: unknown;
}

export interface OmOConfig {
  agents?: Record<string, AgentConfig>;
  categories?: Record<string, CategoryConfig>;
  disabled_agents?: string[];
  disabled_categories?: string[];
  background_task?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ConfigFile {
  path: string;
  level: 'global' | 'project';
  type: 'opencode' | 'omo';
  content: string;
  data: OpenCodeConfig | OmOConfig;
}

export interface ConfigState {
  opencode: ConfigFile[];
  omo: ConfigFile[];
}

export interface Suggestion {
  targetType: 'agent' | 'category' | 'opencode-model' | 'opencode-small-model';
  targetName: string;
  currentValue: string | undefined;
  suggestedValue: string;
  reason: string;
  confidence: number;
}

export interface Change {
  filePath: string;
  jsonPath: (string | number)[];
  oldValue: unknown;
  newValue: unknown;
}

export interface DiffResult {
  filePath: string;
  changes: Change[];
  summary: string;
}

export interface ModelOwnership {
  configType: 'opencode' | 'omo';
  configPath: string;
  configLevel: 'global' | 'project';
}

export interface OwnedModel {
  owner: ModelOwnership;
  name: string;
  role: 'agent' | 'category' | 'top-level-model' | 'top-level-small-model';
  currentModel?: string;
}

export interface ReloadResult {
  method: 'sigusr2' | 'signal-file' | 'prompt-user';
  success: boolean;
  message: string;
}
