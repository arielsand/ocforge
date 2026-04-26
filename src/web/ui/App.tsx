import { useEffect, useState, useMemo } from 'react';

interface ConfigFileView {
  path: string;
  level: string;
  type: string;
  data: any;
}

interface ModelView {
  id: string;
  provider: string;
  priceTier: string;
}

interface PendingChange {
  filePath: string;
  jsonPath: (string | number)[];
  oldValue: string;
  newValue: string;
  display: string;
}

interface SuggestionResponse {
  suggestion: {
    targetName: string;
    currentValue: string;
    suggestedValue: string;
    reason: string;
    confidence: number;
  } | null;
  error?: string;
}

export default function App() {
  const [configs, setConfigs] = useState<{ opencode: ConfigFileView[]; omo: ConfigFileView[] } | null>(null);
  const [models, setModels] = useState<ModelView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [applied, setApplied] = useState(false);
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(new Set());
  const [suggestingFor, setSuggestingFor] = useState<string | null>(null);
  const [suggestionResult, setSuggestionResult] = useState<Record<string, SuggestionResponse['suggestion']>>({});

  useEffect(() => {
    fetch('/api/configs')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setConfigs)
      .then(() => fetch('/api/models'))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setModels)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const providers = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of models) {
      map.set(m.provider, (map.get(m.provider) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [models]);

  const visibleModels = useMemo(() => {
    return models.filter((m) => !hiddenProviders.has(m.provider));
  }, [models, hiddenProviders]);

  const modelsByProvider = useMemo(() => {
    const map = new Map<string, ModelView[]>();
    for (const m of visibleModels) {
      const arr = map.get(m.provider) || [];
      arr.push(m);
      map.set(m.provider, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibleModels]);

  const toggleProvider = (provider: string) => {
    setHiddenProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  const addChange = (filePath: string, jsonPath: (string | number)[], oldValue: string, newValue: string, display: string) => {
    setPending((prev) => {
      const key = `${filePath}::${jsonPath.join('.')}`;
      const filtered = prev.filter((c) => `${c.filePath}::${c.jsonPath.join('.')}` !== key);
      return [...filtered, { filePath, jsonPath, oldValue, newValue, display }];
    });
  };

  const removePending = (filePath: string, jsonPath: (string | number)[]) => {
    const key = `${filePath}::${jsonPath.join('.')}`;
    setPending((prev) => prev.filter((c) => `${c.filePath}::${c.jsonPath.join('.')}` !== key));
  };

  const applyChanges = async () => {
    if (pending.length === 0) return;
    const changes = pending.map((c) => ({
      filePath: c.filePath,
      jsonPath: c.jsonPath,
      oldValue: c.oldValue,
      newValue: c.newValue,
    }));
    const res = await fetch('/api/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes }),
    });
    if (res.ok) {
      setPending([]);
      setApplied(true);
      setTimeout(() => setApplied(false), 3000);
      const refreshed = await fetch('/api/configs').then((r) => r.json());
      setConfigs(refreshed);
    } else {
      const text = await res.text();
      setError(`Apply failed: ${text}`);
    }
  };

  const aiSuggest = async (agentName: string, filePath: string) => {
    setSuggestingFor(agentName);
    try {
      const res = await fetch('/api/suggest-for-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName, filePath }),
      });
      const data: SuggestionResponse = await res.json();
      setSuggestionResult((prev) => ({ ...prev, [agentName]: data.suggestion }));
      if (data.suggestion) {
        addChange(filePath, ['agents', agentName, 'model'], data.suggestion.currentValue, data.suggestion.suggestedValue, `${agentName} model (AI suggested)`);
      }
    } catch (err) {
      setError(`Suggest failed: ${err}`);
    } finally {
      setSuggestingFor(null);
    }
  };

  const addFallbackChange = (filePath: string, agentName: string, currentFallbacks: string[], modelId: string) => {
    const newFallbacks = [...currentFallbacks, modelId];
    addChange(filePath, ['agents', agentName, 'fallback_models'], JSON.stringify(currentFallbacks), JSON.stringify(newFallbacks), `${agentName} fallback`);
  };

  const removeFallbackChange = (filePath: string, agentName: string, currentFallbacks: string[], index: number) => {
    const newFallbacks = currentFallbacks.filter((_, i) => i !== index);
    addChange(filePath, ['agents', agentName, 'fallback_models'], JSON.stringify(currentFallbacks), JSON.stringify(newFallbacks), `${agentName} fallback remove`);
  };

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (error) return <div style={{ padding: 24, color: 'red' }}>Error: {error}</div>;

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 1000, margin: '0 auto' }}>
      <h1>🔧 ocforge</h1>

      {/* Provider Filter */}
      <div style={{ marginBottom: 24, padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #e9ecef' }}>
        <h3 style={{ margin: '0 0 12px 0' }}>Providers</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {providers.map(([provider, count]) => (
            <label key={provider} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', opacity: hiddenProviders.has(provider) ? 0.5 : 1 }}>
              <input
                type="checkbox"
                checked={!hiddenProviders.has(provider)}
                onChange={() => toggleProvider(provider)}
              />
              <span>{provider}</span>
              <span style={{ color: '#666', fontSize: 12 }}>({count})</span>
            </label>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
          Showing {visibleModels.length} of {models.length} models
        </div>
      </div>

      {configs?.omo.map((c) => (
        <div key={c.path} style={{ marginBottom: 32, border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <strong>{c.path}</strong>

          <h3 style={{ marginTop: 16, marginBottom: 12 }}>Agents</h3>
          {Object.entries(c.data.agents ?? {}).map(([name, cfg]: [string, any]) => (
            <AgentRow
              key={name}
              name={name}
              cfg={cfg}
              filePath={c.path}
              modelsByProvider={modelsByProvider}
              pending={pending}
              suggestion={suggestionResult[name]}
              isSuggesting={suggestingFor === name}
              onModelChange={(val) => addChange(c.path, ['agents', name, 'model'], cfg.model ?? '', val, `${name} model`)}
              onAiSuggest={() => aiSuggest(name, c.path)}
              onAddFallback={(modelId) => addFallbackChange(c.path, name, (cfg.fallback_models || []).map((f: any) => typeof f === 'string' ? f : f.model), modelId)}
              onRemoveFallback={(idx) => removeFallbackChange(c.path, name, (cfg.fallback_models || []).map((f: any) => typeof f === 'string' ? f : f.model), idx)}
            />
          ))}

          <h3 style={{ marginTop: 24, marginBottom: 12 }}>Categories</h3>
          {Object.entries(c.data.categories ?? {}).map(([name, cfg]: [string, any]) => (
            <div key={name} style={{ marginBottom: 16, padding: 12, background: '#fafafa', borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <label style={{ minWidth: 120, fontWeight: 600 }}>{name}:</label>
                <ModelSelect
                  value={cfg.model ?? ''}
                  modelsByProvider={modelsByProvider}
                  onChange={(e) => addChange(c.path, ['categories', name, 'model'], cfg.model ?? '', e.target.value, `${name} category`)}
                />
              </div>
            </div>
          ))}
        </div>
      ))}

      {configs?.opencode.map((c) => (
        <div key={c.path} style={{ marginBottom: 32, border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <strong>{c.path}</strong>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ minWidth: 120 }}>model:</label>
            <ModelSelect
              value={c.data.model ?? ''}
              modelsByProvider={modelsByProvider}
              onChange={(e) => addChange(c.path, ['model'], c.data.model ?? '', e.target.value, 'OpenCode model')}
            />
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ minWidth: 120 }}>small_model:</label>
            <ModelSelect
              value={c.data.small_model ?? ''}
              modelsByProvider={modelsByProvider}
              onChange={(e) => addChange(c.path, ['small_model'], c.data.small_model ?? '', e.target.value, 'OpenCode small_model')}
            />
          </div>
        </div>
      ))}

      {/* Pending Changes */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 24, padding: 16, background: '#f5f5f5', borderRadius: 8, border: '1px solid #ddd' }}>
          <h3 style={{ marginTop: 0 }}>Pending Changes</h3>
          <ul style={{ paddingLeft: 20 }}>
            {pending.map((c, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {c.display}: <code>{c.oldValue}</code> → <code style={{ color: '#0066cc' }}>{c.newValue}</code>
                <button
                  onClick={() => removePending(c.filePath, c.jsonPath)}
                  style={{ marginLeft: 8, fontSize: 11, cursor: 'pointer', color: '#cc0000', border: 'none', background: 'none' }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button onClick={applyChanges} style={{ padding: '10px 20px', fontSize: 16, cursor: 'pointer', background: '#0066cc', color: 'white', border: 'none', borderRadius: 4 }}>
            Apply Changes
          </button>
        </div>
      )}

      {applied && <div style={{ color: 'green', marginBottom: 16, padding: 12, background: '#e8f5e9', borderRadius: 4 }}>✅ Changes applied successfully!</div>}
    </div>
  );
}

function ModelSelect({
  value,
  modelsByProvider,
  onChange,
}: {
  value: string;
  modelsByProvider: [string, ModelView[]][];
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <select value={value} onChange={onChange} style={{ flex: 1, padding: 8, fontSize: 14 }}>
      <option value="">-- select model --</option>
      {modelsByProvider.map(([provider, models]) => (
        <optgroup key={provider} label={provider}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id} ({m.priceTier})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function AgentRow({
  name,
  cfg,
  filePath,
  modelsByProvider,
  pending,
  suggestion,
  isSuggesting,
  onModelChange,
  onAiSuggest,
  onAddFallback,
  onRemoveFallback,
}: {
  name: string;
  cfg: any;
  filePath: string;
  modelsByProvider: [string, ModelView[]][];
  pending: PendingChange[];
  suggestion: SuggestionResponse['suggestion'];
  isSuggesting: boolean;
  onModelChange: (val: string) => void;
  onAiSuggest: () => void;
  onAddFallback: (modelId: string) => void;
  onRemoveFallback: (index: number) => void;
}) {
  const fallbacks: string[] = (cfg.fallback_models || []).map((f: any) => (typeof f === 'string' ? f : f.model));
  const modelPending = pending.find((p) => p.jsonPath.join('.') === `agents.${name}.model`);

  return (
    <div style={{ marginBottom: 20, padding: 16, background: '#fafafa', borderRadius: 6, border: '1px solid #eee' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <label style={{ minWidth: 120, fontWeight: 600, fontSize: 15 }}>{name}:</label>
        <ModelSelect
          value={modelPending ? modelPending.newValue : (cfg.model ?? '')}
          modelsByProvider={modelsByProvider}
          onChange={(e) => onModelChange(e.target.value)}
        />
        <button
          onClick={onAiSuggest}
          disabled={isSuggesting}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            cursor: isSuggesting ? 'wait' : 'pointer',
            background: isSuggesting ? '#ccc' : '#6f42c1',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            whiteSpace: 'nowrap',
          }}
        >
          {isSuggesting ? '🤔 Thinking...' : '🤖 AI Suggest'}
        </button>
      </div>

      {suggestion && (
        <div style={{ marginBottom: 12, padding: 10, background: '#e3f2fd', borderRadius: 4, fontSize: 13 }}>
          <strong>AI Suggestion:</strong> {suggestion.suggestedValue}{' '}
          <span style={{ color: '#666' }}>({Math.round(suggestion.confidence * 100)}% confidence)</span>
          <div style={{ color: '#555', marginTop: 4 }}>{suggestion.reason}</div>
        </div>
      )}

      {/* Fallback Models */}
      <div style={{ marginLeft: 132 }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 6, fontWeight: 600 }}>Fallback models:</div>
        {fallbacks.length === 0 && <div style={{ fontSize: 12, color: '#999', fontStyle: 'italic' }}>No fallbacks configured</div>}
        {fallbacks.map((fb, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 13 }}>
            <span style={{ color: '#666' }}>{idx + 1}.</span>
            <code>{fb}</code>
            <button
              onClick={() => onRemoveFallback(idx)}
              style={{ fontSize: 11, color: '#cc0000', border: 'none', background: 'none', cursor: 'pointer' }}
            >
              remove
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: '#666' }}>Add:</span>
          <select
            onChange={(e) => {
              if (e.target.value) {
                onAddFallback(e.target.value);
                e.target.value = '';
              }
            }}
            style={{ padding: 4, fontSize: 13 }}
          >
            <option value="">-- select fallback model --</option>
            {modelsByProvider.map(([provider, models]) => (
              <optgroup key={provider} label={provider}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
