import { useEffect, useState } from 'react';

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

export default function App() {
  const [configs, setConfigs] = useState<{ opencode: ConfigFileView[]; omo: ConfigFileView[] } | null>(null);
  const [models, setModels] = useState<ModelView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [applied, setApplied] = useState(false);

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

  const addChange = (filePath: string, jsonPath: (string | number)[], oldValue: string, newValue: string, display: string) => {
    setPending((prev) => {
      const filtered = prev.filter((c) => !(c.filePath === filePath && c.jsonPath.join('.') === jsonPath.join('.')));
      return [...filtered, { filePath, jsonPath, oldValue, newValue, display }];
    });
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
      // Refresh configs
      const refreshed = await fetch('/api/configs').then((r) => r.json());
      setConfigs(refreshed);
    } else {
      const text = await res.text();
      setError(`Apply failed: ${text}`);
    }
  };

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (error) return <div style={{ padding: 24, color: 'red' }}>Error: {error}</div>;

  const modelIds = models.map((m) => m.id);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '0 auto' }}>
      <h1>🔧 ocforge</h1>

      {configs?.omo.map((c) => (
        <div key={c.path} style={{ marginBottom: 32, border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <strong>{c.path}</strong>

          <h3 style={{ marginTop: 16 }}>Agents</h3>
          {Object.entries(c.data.agents ?? {}).map(([name, cfg]: [string, any]) => (
            <div key={name} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ minWidth: 120 }}>{name}:</label>
              <select
                value={cfg.model ?? ''}
                onChange={(e) => addChange(c.path, ['agents', name, 'model'], cfg.model ?? '', e.target.value, `${name} model`)}
                style={{ flex: 1, padding: 6 }}
              >
                {modelIds.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          ))}

          <h3 style={{ marginTop: 16 }}>Categories</h3>
          {Object.entries(c.data.categories ?? {}).map(([name, cfg]: [string, any]) => (
            <div key={name} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ minWidth: 120 }}>{name}:</label>
              <select
                value={cfg.model ?? ''}
                onChange={(e) => addChange(c.path, ['categories', name, 'model'], cfg.model ?? '', e.target.value, `${name} category`)}
                style={{ flex: 1, padding: 6 }}
              >
                {modelIds.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      ))}

      {configs?.opencode.map((c) => (
        <div key={c.path} style={{ marginBottom: 32, border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <strong>{c.path}</strong>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ minWidth: 120 }}>model:</label>
            <select
              value={c.data.model ?? ''}
              onChange={(e) => addChange(c.path, ['model'], c.data.model ?? '', e.target.value, 'OpenCode model')}
              style={{ flex: 1, padding: 6 }}
            >
              {modelIds.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ minWidth: 120 }}>small_model:</label>
            <select
              value={c.data.small_model ?? ''}
              onChange={(e) => addChange(c.path, ['small_model'], c.data.small_model ?? '', e.target.value, 'OpenCode small_model')}
              style={{ flex: 1, padding: 6 }}
            >
              {modelIds.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      ))}

      {pending.length > 0 && (
        <div style={{ marginBottom: 24, padding: 16, background: '#f5f5f5', borderRadius: 8 }}>
          <h3>Pending Changes</h3>
          <ul>
            {pending.map((c, i) => (
              <li key={i}>
                {c.display}: {c.oldValue} → {c.newValue}
              </li>
            ))}
          </ul>
          <button onClick={applyChanges} style={{ padding: '8px 16px', fontSize: 16, cursor: 'pointer' }}>
            Apply Changes
          </button>
        </div>
      )}

      {applied && <div style={{ color: 'green', marginBottom: 16 }}>✅ Changes applied successfully!</div>}
    </div>
  );
}
