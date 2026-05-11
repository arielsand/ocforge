# Missing Model Detection and Smart Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect when OmO/OpenCode config points to models that no longer exist in `opencode models` and suggest replacements with similar available models.

**Architecture:** Three-layer: (1) `SuggestionEngine` gets a new `findReplacementForMissingModel()` method that uses `inferCapabilities`/`inferPriceTier` to score available models; (2) API gets `GET /api/validate` endpoint returning enriched missing-model suggestions with config paths; (3) Web UI gets a `MissingModelsAlert` component with Accept/Fix All per missing model.

**Tech Stack:** TypeScript, Bun, Fastify, React

**Spec:** `docs/superpowers/specs/2026-05-11-missing-model-replacement.md`

---

### Task 1: Add `'missing-model'` to `Suggestion.targetType`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Update the Suggestion interface targetType union**

Change `targetType` from 4-value union to 5-value union:

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

- [ ] **Step 2: Verify typecheck passes**

Run: `bun run typecheck`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
GIT_MASTER=1 git add src/types.ts
GIT_MASTER=1 git commit -m "feat(types): add missing-model targetType to Suggestion"
```

---

### Task 2: Add `findReplacementForMissingModel()` method

**Files:**
- Modify: `src/core/suggestion-engine.ts`

- [ ] **Step 1: Add the new private method after `pickBestModel()`**

Add this method after line 146 (end of `pickBestModel`):

```typescript
private findReplacementForMissingModel(
  configuredModelId: string,
  availableModels: ModelInfo[]
): { suggested: ModelInfo; reason: string } | undefined {
  if (availableModels.length === 0) return undefined;

  const configuredProvider = configuredModelId.split('/')[0];
  const targetTier = inferPriceTier(configuredModelId);
  const targetCaps = inferCapabilities(configuredModelId);

  // 1. Try same provider (still exists in available models)
  const sameProvider = availableModels.filter((m) => m.provider === configuredProvider);
  if (sameProvider.length > 0) {
    const sameTier = sameProvider.filter((m) => m.priceTier === targetTier);
    if (sameTier.length > 0) {
      return {
        suggested: sameTier[0],
        reason: `Same provider and similar tier: ${sameTier[0].id}`,
      };
    }
    return {
      suggested: sameProvider[0],
      reason: `Same provider available: ${sameProvider[0].id}`,
    };
  }

  // 2. Provider doesn't exist — score cross-provider by tier + capabilities
  let best: ModelInfo | undefined;
  let bestScore = -1;
  for (const m of availableModels) {
    let score = 0;
    if (m.priceTier === targetTier) score += 3;
    if (targetCaps.multimodal && m.capabilities.multimodal) score += 2;
    if (targetCaps.thinking && m.capabilities.thinking) score += 2;
    if (targetCaps.reasoning && m.capabilities.reasoning) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }

  if (best) {
    return {
      suggested: best,
      reason: `Provider '${configuredProvider}' not available. Best match: ${best.id} (${best.priceTier})`,
    };
  }

  return undefined;
}
```

- [ ] **Step 2: Run tests to confirm nothing broke**

Run: `bun test tests/core/suggestion-engine.test.ts`
Expected: 2 tests pass

- [ ] **Step 3: Commit**

```bash
GIT_MASTER=1 git add src/core/suggestion-engine.ts
GIT_MASTER=1 git commit -m "feat(suggestion): add findReplacementForMissingModel method"
```

---

### Task 3: Update `generate()` to emit missing-model suggestions

**Files:**
- Modify: `src/core/suggestion-engine.ts`

- [ ] **Step 1: Add missing-model detection after `pickBestModel` in agent loop**

Around line 83-94, change:

```typescript
// === OLD ===
const best = this.pickBestModel(currentModel, models, role.capabilityNeed, role.preferredTier);
if (best && best.id !== currentModel) {
  suggestions.push({ ... });
}
```

To:

```typescript
const best = this.pickBestModel(currentModel, models, role.capabilityNeed, role.preferredTier);
if (best && best.id !== currentModel) {
  suggestions.push({ ... });
} else if (!best) {
  const replacement = this.findReplacementForMissingModel(currentModel, models);
  if (replacement) {
    suggestions.push({
      targetType: 'missing-model',
      targetName: name,
      currentValue: currentModel,
      suggestedValue: replacement.suggested.id,
      reason: replacement.reason,
      confidence: 0.7,
    });
  }
}
```

- [ ] **Step 2: Add same missing-model detection after `pickBestModel` in category loop**

Around line 100-110, apply the same `else if (!best)` pattern for categories.

- [ ] **Step 3: Add same missing-model detection for OpenCode top-level `model`**

Around line 47-57 (opencode model block), after:

```typescript
const best = this.pickBestModel(ocData.model, models, 'orchestrator', ['opus', 'sonnet', 'standard']);
if (best && best.id !== ocData.model) {
```

Add:

```typescript
} else if (!best) {
  const replacement = this.findReplacementForMissingModel(ocData.model, models);
  if (replacement) {
    suggestions.push({
      targetType: 'missing-model',
      targetName: 'model',
      currentValue: ocData.model,
      suggestedValue: replacement.suggested.id,
      reason: replacement.reason,
      confidence: 0.7,
    });
  }
}
```

- [ ] **Step 4: Add same for OpenCode `small_model`**

Around line 59-71, same pattern for `ocData.small_model` with `targetName: 'small_model'`.

- [ ] **Step 5: Run tests**

Run: `bun test tests/core/suggestion-engine.test.ts`
Expected: 2 tests still pass

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
GIT_MASTER=1 git add src/core/suggestion-engine.ts
GIT_MASTER=1 git commit -m "feat(suggestion): emit missing-model suggestions when configured model not found"
```

---

### Task 4: Add unit tests for missing model detection

**Files:**
- Modify: `tests/core/suggestion-engine.test.ts`

- [ ] **Step 1: Add test — missing provider suggests cross-provider replacement**

```typescript
it('suggests replacement when configured provider does not exist', async () => {
  const engine = await createEngine(
    'anthropic/claude-sonnet-4\nopenai/gpt-4o\ngoogle/gemini-2-flash'
  );
  const configs: ConfigState = {
    opencode: [],
    omo: [{
      path: '/tmp/omo.json',
      level: 'project',
      type: 'omo',
      content: '',
      data: {
        agents: {
          sisyphus: { model: 'nonexistent/some-model' },
        },
      },
    }],
  };

  const suggestions = engine.generate(configs);
  const missing = suggestions.find((s) => s.targetType === 'missing-model' && s.targetName === 'sisyphus');
  expect(missing).toBeDefined();
  expect(missing!.currentValue).toBe('nonexistent/some-model');
  // Should suggest a model that actually exists
  expect(missing!.suggestedValue).toMatch(/^(anthropic|openai|google)\//);
  expect(missing!.confidence).toBe(0.7);
});
```

- [ ] **Step 2: Add test — missing model from existing provider suggests same-provider replacement**

```typescript
it('suggests same-provider replacement when model removed but provider exists', async () => {
  const engine = await createEngine(
    'anthropic/claude-sonnet-4\nanthropic/claude-haiku-3\nopenai/gpt-4o'
  );
  const configs: ConfigState = {
    opencode: [],
    omo: [{
      path: '/tmp/omo.json',
      level: 'project',
      type: 'omo',
      content: '',
      data: {
        agents: {
          oracle: { model: 'anthropic/claude-opus-4' },  // opus not in available models
        },
      },
    }],
  };

  const suggestions = engine.generate(configs);
  const missing = suggestions.find((s) => s.targetType === 'missing-model');
  expect(missing).toBeDefined();
  // Should prefer same provider (anthropic)
  expect(missing!.suggestedValue).toMatch(/^anthropic\//);
});
```

- [ ] **Step 3: Add test — all models available, no missing-model suggestions**

```typescript
it('does not emit missing-model suggestions when all models are available', async () => {
  const engine = await createEngine(
    'anthropic/claude-sonnet-4\nopenai/gpt-4o'
  );
  const configs: ConfigState = {
    opencode: [],
    omo: [{
      path: '/tmp/omo.json',
      level: 'project',
      type: 'omo',
      content: '',
      data: {
        agents: {
          sisyphus: { model: 'anthropic/claude-sonnet-4' },
        },
      },
    }],
  };

  const suggestions = engine.generate(configs);
  const missing = suggestions.filter((s) => s.targetType === 'missing-model');
  expect(missing).toHaveLength(0);
});
```

- [ ] **Step 4: Add test — empty available models returns no suggestions**

```typescript
it('handles empty available models gracefully', async () => {
  const engine = await createEngine('');
  const configs: ConfigState = {
    opencode: [],
    omo: [{
      path: '/tmp/omo.json',
      level: 'project',
      type: 'omo',
      content: '',
      data: {
        agents: {
          sisyphus: { model: 'anthropic/claude-opus-4' },
        },
      },
    }],
  };

  const suggestions = engine.generate(configs);
  const missing = suggestions.filter((s) => s.targetType === 'missing-model');
  expect(missing).toHaveLength(0);
});
```

- [ ] **Step 5: Add test — OpenCode top-level model missing suggests replacement**

```typescript
it('detects missing opencode model and suggests replacement', async () => {
  const engine = await createEngine(
    'anthropic/claude-sonnet-4\nopenai/gpt-4o'
  );
  const configs: ConfigState = {
    opencode: [{
      path: '/tmp/opencode.json',
      level: 'project',
      type: 'opencode',
      content: '',
      data: {
        model: 'openai/gpt-5',  // not in available models
      },
    }],
    omo: [],
  };

  const suggestions = engine.generate(configs);
  const missing = suggestions.find(
    (s) => s.targetType === 'missing-model' && s.targetName === 'model'
  );
  expect(missing).toBeDefined();
  expect(missing!.suggestedValue).toMatch(/^(anthropic|openai)\//);
});
```

- [ ] **Step 6: Run all tests**

Run: `bun test tests/core/suggestion-engine.test.ts`
Expected: 7 tests pass (2 existing + 5 new)

- [ ] **Step 7: Commit**

```bash
GIT_MASTER=1 git add tests/core/suggestion-engine.test.ts
GIT_MASTER=1 git commit -m "test(suggestion): add missing model detection tests"
```

---

### Task 5: Add `/api/validate` server endpoint

**Files:**
- Modify: `src/web/server.ts`

- [ ] **Step 1: Add the validate endpoint after `/api/suggestions` (around line 70)**

```typescript
app.get('/api/validate', async () => {
  const configs = discoverConfigs({ cwd });
  const models = await getModels();
  const registry = new ModelRegistry({ shellRunner: async () => ({ stdout: '', stderr: '', exitCode: 0 }) });
  registry.seed(models);
  const engine = new SuggestionEngine(registry);
  const allSuggestions = engine.generate(configs);

  const missingModels = allSuggestions
    .filter((s) => s.targetType === 'missing-model')
    .map((s) => {
      // Enrich with config path and JSON path for UI to apply changes
      let configPath = '';
      let jsonPath: (string | number)[] = [];
      let display = '';

      const omoConfig = configs.omo[0];
      const ocConfig = configs.opencode[0];
      const omoData = omoConfig?.data as import('../types').OmOConfig | undefined;
      const ocData = ocConfig?.data as import('../types').OpenCodeConfig | undefined;

      if (s.targetName === 'model' || s.targetName === 'small_model') {
        configPath = ocConfig?.path || '';
        jsonPath = [s.targetName];
        display = `OpenCode ${s.targetName} (missing)`;
      } else if (omoData?.agents?.[s.targetName]) {
        configPath = omoConfig!.path;
        jsonPath = ['agents', s.targetName, 'model'];
        display = `${s.targetName} agent (missing)`;
      } else if (omoData?.categories?.[s.targetName]) {
        configPath = omoConfig!.path;
        jsonPath = ['categories', s.targetName, 'model'];
        display = `${s.targetName} category (missing)`;
      } else if (ocData?.agent?.[s.targetName]) {
        configPath = ocConfig!.path;
        jsonPath = ['agent', s.targetName, 'model'];
        display = `${s.targetName} agent (missing)`;
      }

      return {
        targetType: s.targetType,
        targetName: s.targetName,
        currentValue: s.currentValue,
        suggestedValue: s.suggestedValue,
        reason: s.reason,
        confidence: s.confidence,
        configPath,
        jsonPath,
        display,
      };
    });

  return { valid: missingModels.length === 0, missingModels };
});
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
GIT_MASTER=1 git add src/web/server.ts
GIT_MASTER=1 git commit -m "feat(server): add /api/validate endpoint for stale model detection"
```

---

### Task 6: Update integration test

**Files:**
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Read current integration test to understand fixture setup**

Read: `tests/integration.test.ts` to understand how fixtures are set up.

- [ ] **Step 2: Add test — validate endpoint detects stale model and accept creates pending change**

(In the integration test, add after existing tests:)

```typescript
it('validate detects stale model references and returns enriched suggestions', async () => {
  const { app, fixtures, cleanup } = await setupIntegration();
  try {
    const res = await app.inject({ method: 'GET', url: '/api/validate' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('valid');
    expect(body).toHaveProperty('missingModels');
    expect(Array.isArray(body.missingModels)).toBe(true);
  } finally {
    await cleanup();
  }
});
```

(Note: actual fixture data determines whether missing models are detected — adjust assertion if fixture has all valid models.)

- [ ] **Step 3: Run integration test**

Run: `bun test tests/integration.test.ts`
Expected: All integration tests pass

- [ ] **Step 4: Commit**

```bash
GIT_MASTER=1 git add tests/integration.test.ts
GIT_MASTER=1 git commit -m "test(integration): add validate endpoint test"
```

---

### Task 7: Add `MissingModelsAlert` component and integrate in Web UI

**Files:**
- Modify: `src/web/ui/App.tsx`

- [ ] **Step 1: Add state variables for missing models**

After the existing state declarations (around line 285), add:

```typescript
const [missingModels, setMissingModels] = useState<MissingModelSuggestion[]>([]);
const [dismissedMissing, setDismissedMissing] = useState<Set<string>>(new Set());
```

And a type before the component function (around line 6):

```typescript
interface MissingModelSuggestion {
  targetType: string;
  targetName: string;
  currentValue: string;
  suggestedValue: string;
  reason: string;
  confidence: number;
  configPath: string;
  jsonPath: (string | number)[];
  display: string;
}
```

- [ ] **Step 2: Fetch `/api/validate` on mount alongside other data**

In the mount effect (around line 290), add to the Promise.all:

```typescript
const [cfgRes, modelsRes, ollamaRes, snapshotsRes, profilesRes, validateRes] = await Promise.all([
  fetch('/api/configs'),
  fetch('/api/models'),
  fetch('/api/ollama/models'),
  fetch('/api/snapshots'),
  fetch('/api/profiles'),
  fetch('/api/validate'),
]);
```

And after setting all other state, parse validate data:

```typescript
const validateData = await validateRes.json();
setMissingModels(validateData.missingModels || []);
```

- [ ] **Step 3: Add the `MissingModelsAlert` component definition**

After the `Alert` component (around line 246), add:

```typescript
function MissingModelsAlert({
  missingModels,
  onAccept,
  onAcceptAll,
  onDismiss,
}: {
  missingModels: MissingModelSuggestion[];
  onAccept: (s: MissingModelSuggestion) => void;
  onAcceptAll: () => void;
  onDismiss: (key: string) => void;
}) {
  if (missingModels.length === 0) return null;

  return (
    <Card className="border-amber-500/30">
      <CardContent>
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <span className="text-amber-200 font-medium">
            {missingModels.length} model reference{missingModels.length > 1 ? 's' : ''} point{missingModels.length === 1 ? 's' : ''} to unavailable providers/models
          </span>
        </div>
        <div className="space-y-3">
          {missingModels.map((s) => {
            const key = `${s.configPath}::${s.jsonPath.join('.')}`;
            return (
              <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="text-sm font-medium text-zinc-200">{s.targetName}</span>
                    <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700">{s.currentValue}</Badge>
                    <ArrowRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">{s.suggestedValue}</Badge>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{s.reason}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-4">
                  <Button variant="primary" size="sm" onClick={() => onAccept(s)}>
                    <Check className="w-3.5 h-3.5" />
                    Accept
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDismiss(key)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={onAcceptAll} className="bg-emerald-600 hover:bg-emerald-500">
            <Check className="w-4 h-4" />
            Accept All ({missingModels.length})
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Add handler functions for accept/dismiss**

After the `toggleProvider` function (around line 354), add:

```typescript
const handleAcceptMissing = (s: MissingModelSuggestion) => {
  addChange(s.configPath, s.jsonPath, s.currentValue, s.suggestedValue, s.display);
  const key = `${s.configPath}::${s.jsonPath.join('.')}`;
  setDismissedMissing((prev) => new Set([...prev, key]));
};

const handleAcceptAllMissing = () => {
  const visible = missingModels.filter(
    (s) => !dismissedMissing.has(`${s.configPath}::${s.jsonPath.join('.')}`)
  );
  for (const s of visible) {
    addChange(s.configPath, s.jsonPath, s.currentValue, s.suggestedValue, s.display);
  }
  setDismissedMissing((prev) => {
    const next = new Set(prev);
    for (const s of visible) {
      next.add(`${s.configPath}::${s.jsonPath.join('.')}`);
    }
    return next;
  });
};

const handleDismissMissing = (key: string) => {
  setDismissedMissing((prev) => new Set([...prev, key]));
};
```

- [ ] **Step 5: Compute visible (not dismissed) missing models**

After the `modelsByProvider` useMemo (around line 345), add:

```typescript
const visibleMissingModels = useMemo(() => {
  return missingModels.filter(
    (s) => !dismissedMissing.has(`${s.configPath}::${s.jsonPath.join('.')}`)
  );
}, [missingModels, dismissedMissing]);
```

- [ ] **Step 6: Render the MissingModelsAlert component in the UI**

After the Ollama card and before the Providers section (after the closing `</Card>` for Ollama at around line 612), add:

```tsx
<MissingModelsAlert
  missingModels={visibleMissingModels}
  onAccept={handleAcceptMissing}
  onAcceptAll={handleAcceptAllMissing}
  onDismiss={handleDismissMissing}
/>
```

- [ ] **Step 7: Build and verify frontend compiles**

Run: `bun run build:web`
Expected: Build succeeds

- [ ] **Step 8: Typecheck**

Run: `bun run typecheck`
Expected: No type errors

- [ ] **Step 9: Commit**

```bash
GIT_MASTER=1 git add src/web/ui/App.tsx
GIT_MASTER=1 git commit -m "feat(web): add MissingModelsAlert component for stale model detection"
```

---

### Self-Review Checklist

- **Spec coverage:** Every section in the spec is covered by a task above (types → Task 1, engine method → Task 2, generate update → Task 3, validate endpoint → Task 5, web UI → Task 7, tests → Tasks 4 and 6)
- **Placeholder scan:** No TBD, TODO, "implement later", or vague instructions
- **Type consistency:** `MissingModelSuggestion` interface used in Task 7 matches the enrich shape returned by the validate endpoint in Task 5 (both have `configPath`, `jsonPath`, `display`)

**All 7 tasks accounted for.** Ready for execution.
