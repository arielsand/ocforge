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
  // Cheapest
  if (lower.includes('nano')) return 'nano';
  // Cheap / fast
  if (lower.includes('mini')) return 'mini';
  if (lower.includes('haiku')) return 'mini';
  if (lower.includes('flash')) return 'flash';
  // Mid-tier
  if (lower.includes('sonnet')) return 'sonnet';
  // High-tier
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('claude-3-5')) return 'standard';
  if (lower.includes('claude-4')) return 'standard';
  // OpenAI family
  if (/gpt-5[.\d]*/.test(lower)) return 'standard';
  // Google Gemini
  if (lower.includes('gemini') && lower.includes('pro')) return 'standard';
  if (lower.includes('gemini') && lower.includes('flash')) return 'flash';
  if (lower.includes('gemini') && lower.includes('ultra')) return 'opus';
  // Kimi
  if (lower.includes('kimi')) return lower.includes('thinking') ? 'opus' : 'sonnet';
  // GLM
  if (lower.includes('glm')) return 'sonnet';
  // Minimax
  if (lower.includes('minimax')) return 'mini';
  // Gemma
  if (lower.includes('gemma')) return 'mini';
  // Grok
  if (lower.includes('grok')) return 'sonnet';
  // Qwen
  if (lower.includes('qwen')) return 'mini';
  // Mistral
  if (lower.includes('mistral')) return 'mini';
  // DeepSeek
  if (lower.includes('deepseek')) return lower.includes('flash') ? 'flash' : 'standard';
  // Nemotron
  if (lower.includes('nemotron')) return lower.includes('super') ? 'standard' : lower.includes('nano') ? 'nano' : 'mini';
  // GPT-4 family (OpenAI legacy)
  if (lower.includes('gpt-4')) return 'standard';
  // OSS models (OpenAI open source)
  if (lower.includes('gpt-oss')) return 'standard';
  // Cogito
  if (lower.includes('cogito')) return 'standard';
  // Devstral
  if (lower.includes('devstral')) return 'sonnet';
  // RNJ
  if (lower.includes('rnj')) return 'mini';
  // Hy
  if (lower.includes('hy')) return 'mini';
  // Mimo
  if (lower.includes('mimo')) return 'mini';
  // Big-pickle
  if (lower.includes('big-pickle')) return 'standard';
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

  seed(models: ModelInfo[]): void {
    this.models = models;
  }
}
