export interface OllamaModel {
  name: string;
  model: string;
  size: number;
  parameter_size?: string;
  quantization_level?: string;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: Record<string, unknown>;
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

const OLLAMA_BASE_URL = process.env.OCFORGE_OLLAMA_URL || 'http://localhost:11434';

export async function listOllamaModels(): Promise<OllamaModel[]> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
  if (!res.ok) {
    throw new Error(`Ollama list failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.models || [];
}

export async function generateWithOllama(
  model: string,
  prompt: string,
  options?: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: options ?? { temperature: 0.3 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama generate failed: ${res.status} ${res.statusText}`);
  }

  const data: OllamaGenerateResponse = await res.json();
  return data.response.trim();
}

export function buildSuggestionPrompt(
  agentName: string,
  currentModel: string,
  agentDescription: string,
  availableModels: { id: string; provider: string; priceTier: string }[]
): string {
  const modelList = availableModels
    .map((m) => `- ${m.id} (${m.provider}, tier: ${m.priceTier})`)
    .join('\n');

  return `You are an AI model selection expert. You help developers choose the best LLM for their coding agent.

AGENT: ${agentName}
CURRENT MODEL: ${currentModel}
ROLE: ${agentDescription}

AVAILABLE MODELS:
${modelList}

Based on the agent's role and the available models, suggest the SINGLE best model for this agent.

Respond ONLY with a JSON object in this exact format:
{"model": "provider/model-id", "reason": "one sentence explaining why"}

No markdown, no code blocks, just raw JSON.`;
}
