import type { ModelInfo } from '../types';

export type ShellRunner = (cmd: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

export interface ModelRegistryOptions {
  shellRunner?: ShellRunner;
  cachePath?: string;
}

const DEFAULT_RUNNER: ShellRunner = async (cmd) => {
  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { stdout, stderr, exitCode };
};

function inferCapabilities(modelId: string): ModelInfo['capabilities'] {
  const lower = modelId.toLowerCase();
  return {
    multimodal: lower.includes('vision') || lower.includes('gemini') || lower.includes('gpt-4') || lower.includes('4o'),
    thinking: lower.includes('o3') || lower.includes('o1') || lower.includes('thinking') || lower.includes('claude-opus'),
    reasoning: lower.includes('o3') || lower.includes('o1') || lower.includes('reasoning') || lower.includes('opus'),
    maxTokens: undefined,
  };
}

function inferPriceTier(modelId: string): ModelInfo['priceTier'] {
  const lower = modelId.toLowerCase();
  if (lower.includes('nano')) return 'nano';
  if (lower.includes('mini')) return 'mini';
  if (lower.includes('flash')) return 'flash';
  if (lower.includes('haiku')) return 'mini';
  if (lower.includes('sonnet')) return 'sonnet';
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('gpt-5')) return 'standard';
  return 'unknown';
}

export class ModelRegistry {
  private models: ModelInfo[] = [];
  private shellRunner: ShellRunner;
  private cachePath?: string;

  constructor(options: ModelRegistryOptions = {}) {
    this.shellRunner = options.shellRunner ?? DEFAULT_RUNNER;
    this.cachePath = options.cachePath;
  }

  async refresh(): Promise<ModelInfo[]> {
    const result = await this.shellRunner(['opencode', 'models']);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to list models: ${result.stderr}`);
    }

    const lines = result.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#') && l.includes('/'));

    this.models = lines.map((line) => {
      const [provider, ...modelParts] = line.split('/');
      const modelId = modelParts.join('/');
      const fullId = `${provider}/${modelId}`;
      return {
        id: fullId,
        provider,
        modelId,
        capabilities: inferCapabilities(fullId),
        priceTier: inferPriceTier(fullId),
      };
    });

    return this.models;
  }

  list(): ModelInfo[] {
    return this.models;
  }

  findById(id: string): ModelInfo | undefined {
    return this.models.find((m) => m.id === id);
  }

  getProviders(): string[] {
    return [...new Set(this.models.map((m) => m.provider))];
  }
}
