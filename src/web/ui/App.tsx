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

export default function App() {
  const [configs, setConfigs] = useState<{ opencode: ConfigFileView[]; omo: ConfigFileView[] } | null>(null);
  const [models, setModels] = useState<ModelView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/configs')
      .then((r) => r.json())
      .then(setConfigs)
      .then(() => fetch('/api/models'))
      .then((r) => r.json())
      .then(setModels)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>🔧 ocforge</h1>
      <h2>Configs</h2>
      {configs?.omo.map((c) => (
        <div key={c.path} style={{ marginBottom: 16 }}>
          <strong>{c.path}</strong>
          <div>
            Agents: {Object.keys(c.data.agents ?? {}).join(', ') || 'none'}
          </div>
          <div>
            Categories: {Object.keys(c.data.categories ?? {}).join(', ') || 'none'}
          </div>
        </div>
      ))}
      <h2>Available Models ({models.length})</h2>
      <ul>
        {models.slice(0, 20).map((m) => (
          <li key={m.id}>{m.id} ({m.priceTier})</li>
        ))}
      </ul>
    </div>
  );
}
