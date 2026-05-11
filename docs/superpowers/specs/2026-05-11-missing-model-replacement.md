# Missing Model Detection and Smart Replacement

**Date**: 2026-05-11
**Feature**: Detect when OmO/OpenCode config points to non-existent providers/models and suggest/apply replacements with similar available models.

## Problem

When `opencode models` changes (providers added/removed, models renamed/deprecated), the user's config may reference models that no longer exist. Currently:

1. `SuggestionEngine.pickBestModel()` returns `undefined` when the current model is not found → no suggestion is generated
2. The web UI's `ModelSelect` shows a bare `(current config)` option with no visual alert
3. Users must manually browse providers to find a replacement — no guidance on what's similar

## Solution Overview

Three-layer change across engine, API, and UI:

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  SuggestionEngine │────▶│   Server (API)   │────▶│   Web UI (React)     │
│                   │     │                  │     │                      │
│ - findReplacement │     │ - /api/validate  │     │ - MissingModelsAlert │
│   for missing     │     │   (new endpoint) │     │ - Accept / Fix All   │
│   models          │     │ - /api/suggestions│     │ - Inline accept per  │
│ - scoring by      │     │   (updated)      │     │   agent/category     │
│   tier+capability │     └──────────────────┘     └──────────────────────┘
└─────────────────┘
```

## Detailed Design

### 1. Backend: `SuggestionEngine.findReplacementForMissingModel()`

**Location**: `src/core/suggestion-engine.ts`

**Signature**:
```typescript
private findReplacementForMissingModel(
  configuredModelId: string,
  availableModels: ModelInfo[]
): { suggested: ModelInfo; reason: string } | undefined
```

**Algorithm**:

```
1. Extract configuredProvider = modelId.split('/')[0]
2. Infer expected capabilities (inferCapabilities) + tier (inferPriceTier)
3. Try same-provider match:
   a. Same provider + same priceTier → best match (score: 5)
   b. Same provider only → fallback (score: 3)
4. If provider not in availableModels:
   a. Score all available models by:
      - Same priceTier (+3)
      - Capability match: multimodal (+2), thinking (+2), reasoning (+2)
      - Prefer higher-tier within matching capabilities (+1 for each tier step)
   b. Return highest-scored model
5. If no match at all → return undefined (no suggestion possible)
```

**Edge cases**:
- Empty available models → return undefined
- Configured model has no provider prefix → treat entire string as model name, provider unknown
- Model exists but with different casing → handled by existing `findById`

### 2. Backend: Extend `Suggestion` type

**Location**: `src/types.ts`

Add `'missing-model'` to the `targetType` union in `Suggestion`:

```typescript
export interface Suggestion {
  targetType: 'agent' | 'category' | 'opencode-model' | 'opencode-small-model' | 'missing-model';
  targetName: string;
  currentValue: string | undefined;
  suggestedValue: string;
  reason: string;
  confidence: number;
}
```

### 3. Backend: Updated `SuggestionEngine.generate()`

**Location**: `src/core/suggestion-engine.ts`

For each agent/category config, after `pickBestModel()` returns undefined:

```typescript
if (!best) {
  // Current model not found in available models
  const replacement = this.findReplacementForMissingModel(currentModel, models);
  if (replacement) {
    suggestions.push({
      targetType: 'missing-model',
      targetName: name,
      currentValue: currentModel,
      suggestedValue: replacement.suggested.id,
      reason: `Model not found. ${replacement.reason}`,
      confidence: 0.7,
    });
  }
}
```

For opencode top-level `model` and `small_model`: same logic applied.

### 4. Backend: API Endpoint

**Location**: `src/web/server.ts`

**New endpoint**: `GET /api/validate`

Returns all stale/dangling model references across configs, with suggested fixes pre-calculated:

```typescript
app.get('/api/validate', async () => {
  const configs = discoverConfigs({ cwd });
  const models = await getModels();
  const registry = new ModelRegistry({ shellRunner: async () => ({ stdout: '', stderr: '', exitCode: 0 }) });
  registry.seed(models);
  const engine = new SuggestionEngine(registry);
  
  // Get regular suggestions + missing model detections
  const allSuggestions = engine.generate(configs);
  const missingModels = allSuggestions.filter(s => s.targetType === 'missing-model');
  
  return {
    valid: missingModels.length === 0,
    missingModels,
    total: allSuggestions,
  };
});
```

**Updated endpoint**: `GET /api/suggestions` already calls `engine.generate()` — it will now include missing-model suggestions automatically.

### 5. Frontend: `MissingModelsAlert` Component

**Location**: `src/web/ui/App.tsx` (new component)

```typescript
function MissingModelsAlert({ 
  missingModels, 
  onAccept,     // (suggestion) => void — add to pending changes
  onAcceptAll,  // () => void — add ALL to pending changes
  onDismiss,    // (suggestion) => void — dismiss this one
}: { ... })
```

**Visual design**:

```
┌──────────────────────────────────────────────────────────────┐
│ ⚠ 3 model references point to unavailable providers/models  │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ✗ sisyphus → anthropic/claude-opus-4 (not found)        │ │
│ │   Suggested: anthropic/claude-sonnet-4 (same provider,   │ │
│ │   similar tier)                                          │ │
│ │   [✓ Accept]  [✗ Dismiss]                               │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ✗ opencode model → openai/gpt-4 (not found)             │ │
│ │   Suggested: openai/gpt-4o (same provider, multimodel)   │ │
│ │   [✓ Accept]  [✗ Dismiss]                               │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ [✓ Fix All (3)]                                              │
└──────────────────────────────────────────────────────────────┘
```

Placed above the `Providers` filter section, before the config sections.

**Integration**:
- Fetch `/api/validate` on initial load alongside other data
- Store `missingModels` in state
- `onAccept` → calls `addChange()` with the suggested replacement (same `PendingChange` mechanism)
- `onAcceptAll` → calls `addChange()` for all
- `onDismiss` → removes from display only (stores in `dismissedMissing` set)
- When all missing models are dismissed/accepted, the alert section hides

### 6. Frontend: Per-Agent Inline Indication (Bonus)

When a model is missing, the `ModelSelect` component already shows `(current config)`. Enhancement: add a small warning icon/badge next to the select when the currently selected value is not in the available models list.

Already partially done via `hasValueInModels` check in `ModelSelect`. Enhancement: pass in `models` list and show a subtle `⚠` indicator + tooltip.

### 7. Testing

**Unit tests** (`tests/core/suggestion-engine.test.ts`):
- Missing provider (e.g., `nonexistent/gpt-4`) → should suggest replacement
- Missing model from existing provider (e.g., `anthropic/claude-v1`) → should suggest same-provider replacement
- All models available → no missing-model suggestions
- Empty available models → no suggestions (graceful)
- Provider exists but no matching tier → fallback to any model from that provider

**Integration test** (`tests/integration.test.ts`):
- Stale model reference in fixture config → validate endpoint returns it
- Accept suggestion → JSONC writer applies the change correctly

### 8. File Changes Summary

| File | Change |
|------|--------|
| `src/types.ts` | Add `isMissingModel` to `Suggestion`; add `missing-model` to `SuggestionTargetType` |
| `src/core/suggestion-engine.ts` | Add `findReplacementForMissingModel()`, update `generate()` to call it |
| `src/core/model-registry.ts` | No changes (reuses existing `inferCapabilities`/`inferPriceTier`) |
| `src/web/server.ts` | Add `GET /api/validate` endpoint |
| `src/web/ui/App.tsx` | Add `MissingModelsAlert` component, fetch `/api/validate`, integrate with pending changes |
| `tests/core/suggestion-engine.test.ts` | Add tests for missing model scenarios |
| `tests/integration.test.ts` | Add test for validate + accept flow |

### 9. Open Questions & Edge Cases

- **Fallback models**: If an agent has `fallback_models` that are also stale, should we suggest replacements for those too? → Phase 2 enhancement, not in scope.
- **AI-suggested model (Ollama)**: This feature is separate from the Ollama AI suggestion — the Ollama feature uses a local LLM to suggest, while this uses rule-based tier/capability matching.
- **Confidence scoring**: Missing model suggestions get `confidence: 0.7` (moderate) since we're inferring capabilities from model names which may be imperfect.
