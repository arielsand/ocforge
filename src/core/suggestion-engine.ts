import type { ModelInfo, ConfigState, Suggestion, OmOConfig, OpenCodeConfig } from '../types';
import { ModelRegistry } from './model-registry';

interface AgentRole {
  capabilityNeed: 'orchestrator' | 'reasoning' | 'fast' | 'vision' | 'general';
  preferredTier: ModelInfo['priceTier'][];
}

const AGENT_ROLES: Record<string, AgentRole> = {
  sisyphus: { capabilityNeed: 'orchestrator', preferredTier: ['opus', 'sonnet', 'standard'] },
  prometheus: { capabilityNeed: 'orchestrator', preferredTier: ['opus', 'sonnet', 'standard'] },
  metis: { capabilityNeed: 'orchestrator', preferredTier: ['opus', 'sonnet', 'standard'] },
  momus: { capabilityNeed: 'orchestrator', preferredTier: ['opus', 'sonnet', 'standard'] },
  oracle: { capabilityNeed: 'reasoning', preferredTier: ['opus', 'sonnet', 'standard'] },
  hephaestus: { capabilityNeed: 'general', preferredTier: ['sonnet', 'standard', 'mini'] },
  atlas: { capabilityNeed: 'general', preferredTier: ['sonnet', 'standard', 'mini'] },
  librarian: { capabilityNeed: 'fast', preferredTier: ['mini', 'flash', 'nano'] },
  explore: { capabilityNeed: 'fast', preferredTier: ['mini', 'flash', 'nano'] },
  'multimodal-looker': { capabilityNeed: 'vision', preferredTier: ['standard', 'sonnet', 'opus'] },
  'sisyphus-junior': { capabilityNeed: 'fast', preferredTier: ['mini', 'flash', 'nano'] },
};

const CATEGORY_ROLES: Record<string, AgentRole> = {
  'visual-engineering': { capabilityNeed: 'vision', preferredTier: ['standard', 'sonnet', 'opus'] },
  ultrabrain: { capabilityNeed: 'reasoning', preferredTier: ['opus', 'sonnet', 'standard'] },
  deep: { capabilityNeed: 'reasoning', preferredTier: ['opus', 'sonnet', 'standard'] },
  artistry: { capabilityNeed: 'vision', preferredTier: ['standard', 'sonnet', 'opus'] },
  quick: { capabilityNeed: 'fast', preferredTier: ['nano', 'mini', 'flash'] },
  'unspecified-low': { capabilityNeed: 'fast', preferredTier: ['mini', 'flash', 'standard'] },
  'unspecified-high': { capabilityNeed: 'orchestrator', preferredTier: ['opus', 'sonnet', 'standard'] },
  writing: { capabilityNeed: 'fast', preferredTier: ['flash', 'mini', 'standard'] },
};

const DEFAULT_AGENT_CONFIDENCE = 0.75;
const DEFAULT_OPENCODE_CONFIDENCE = 0.7;

export class SuggestionEngine {
  constructor(private registry: ModelRegistry) {}

  generate(configs: ConfigState): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const models = this.registry.list();

    if (configs.opencode.length > 0) {
      const ocData = configs.opencode[0].data as OpenCodeConfig;
      if (ocData.model) {
        const best = this.pickBestModel(ocData.model, models, 'orchestrator', ['opus', 'sonnet', 'standard']);
        if (best && best.id !== ocData.model) {
          suggestions.push({
            targetType: 'opencode-model',
            targetName: 'model',
            currentValue: ocData.model,
            suggestedValue: best.id,
            reason: `Better orchestrator model: ${best.id} (${best.priceTier})`,
            confidence: DEFAULT_OPENCODE_CONFIDENCE,
          });
        }
      }
      if (ocData.small_model) {
        const best = this.pickBestModel(ocData.small_model, models, 'fast', ['nano', 'mini', 'flash']);
        if (best && best.id !== ocData.small_model) {
          suggestions.push({
            targetType: 'opencode-small-model',
            targetName: 'small_model',
            currentValue: ocData.small_model,
            suggestedValue: best.id,
            reason: `Better small model: ${best.id} (${best.priceTier})`,
            confidence: DEFAULT_OPENCODE_CONFIDENCE,
          });
        }
      }
    }

    if (configs.omo.length > 0) {
      const omo = configs.omo[0];
      const omoData = omo.data as OmOConfig;
      const agents = omoData.agents ?? {};
      const categories = omoData.categories ?? {};
      for (const [name, cfg] of Object.entries(agents)) {
        const currentModel = (cfg as { model?: string }).model;
        if (!currentModel) continue;
        const role = AGENT_ROLES[name] ?? { capabilityNeed: 'general', preferredTier: ['standard', 'sonnet', 'mini'] };
        const best = this.pickBestModel(currentModel, models, role.capabilityNeed, role.preferredTier);
        if (best && best.id !== currentModel) {
          suggestions.push({
            targetType: 'agent',
            targetName: name,
            currentValue: currentModel,
            suggestedValue: best.id,
            reason: `${role.capabilityNeed} fit: ${best.id} (${best.priceTier})`,
            confidence: DEFAULT_AGENT_CONFIDENCE,
          });
        }
      }

      for (const [name, cfg] of Object.entries(categories)) {
        const currentModel = (cfg as { model?: string }).model;
        if (!currentModel) continue;
        const role = CATEGORY_ROLES[name] ?? { capabilityNeed: 'general', preferredTier: ['standard', 'sonnet', 'mini'] };
        const best = this.pickBestModel(currentModel, models, role.capabilityNeed, role.preferredTier);
        if (best && best.id !== currentModel) {
          suggestions.push({
            targetType: 'category',
            targetName: name,
            currentValue: currentModel,
            suggestedValue: best.id,
            reason: `${role.capabilityNeed} fit for category: ${best.id} (${best.priceTier})`,
            confidence: 0.75,
          });
        }
      }
    }

    return suggestions;
  }

  private pickBestModel(
    currentModelId: string,
    models: ModelInfo[],
    need: AgentRole['capabilityNeed'],
    preferredTiers: ModelInfo['priceTier'][]
  ): ModelInfo | undefined {
    const current = models.find((m) => m.id === currentModelId);
    if (!current) return undefined;

    let candidates = models;
    if (need === 'vision') {
      candidates = models.filter((m) => m.capabilities.multimodal);
    } else if (need === 'reasoning') {
      candidates = models.filter((m) => m.capabilities.reasoning || m.capabilities.thinking);
    }

    const scored = candidates.map((m) => {
      let score = 0;
      if (m.provider === current.provider) score += 1;
      const tierIndex = preferredTiers.indexOf(m.priceTier);
      if (tierIndex !== -1) score += (preferredTiers.length - tierIndex) * 2;
      if (need === 'orchestrator' && (m.capabilities.thinking || m.capabilities.reasoning)) score += 3;
      if (need === 'vision' && m.capabilities.multimodal) score += 3;
      if (m.id === currentModelId) score = -1;
      return { model: m, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.model;
  }
}