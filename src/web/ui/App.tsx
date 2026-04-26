import { useEffect, useMemo, useState } from 'react';
import {
  Wrench, Brain, Save, Trash2, Plus, RefreshCw, Cpu, Server, Zap, X, Check, AlertTriangle, Info, Loader2, Sparkles, GitBranch, Layers, Settings, HardDrive, XCircle, ArrowRight, ChevronDown, FolderOpen, Copy
} from 'lucide-react';
import { cn } from './lib/utils';

interface ModelView {
  id: string;
  provider: string;
  modelId: string;
  priceTier: string;
}

interface PendingChange {
  filePath: string;
  jsonPath: (string | number)[];
  oldValue: unknown;
  newValue: unknown;
  display: string;
}

interface SuggestionResponse {
  suggestion?: {
    targetName: string;
    currentValue: string;
    suggestedValue: string;
    reason: string;
    confidence: number;
  };
  raw?: string;
  error?: string;
}

interface Snapshot {
  name: string;
  createdAt: string;
  description?: string;
}

interface Profile {
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  assignments: {
    agents: Record<string, { model?: string; fallback_models?: unknown[] }>;
    categories: Record<string, { model?: string; fallback_models?: unknown[] }>;
  };
}

interface ConfigFile {
  path: string;
  level: string;
  type: string;
  data: any;
}

interface ConfigState {
  opencode: ConfigFile[];
  omo: ConfigFile[];
}

function getAgentRoleDescription(name: string): string {
  const roles: Record<string, string> = {
    sisyphus: 'Main orchestrator — plans and coordinates complex tasks',
    prometheus: 'Planner — breaks down requirements into actionable steps',
    metis: 'Plan consultant — refines and validates plans',
    momus: 'Critical reviewer — identifies flaws and weaknesses',
    oracle: 'Architect — system design and technical decisions',
    hephaestus: 'Builder — implements solutions from specifications',
    atlas: 'General dev — handles routine development tasks',
    librarian: 'Researcher — gathers and synthesizes information',
    explore: 'Explorer — navigates and searches codebases',
    'multimodal-looker': 'Visual — handles images and visual tasks',
    'sisyphus-junior': 'Light orchestrator — handles simpler tasks',
  };
  return roles[name] || 'Agent — configurable model assignment';
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  anthropic: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  google: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  ollama: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  'ollama-cloud': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  deepseek: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  meta: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  mistral: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  cohere: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  'github-copilot': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  'kimi-for-coding': 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  opencode: 'bg-lime-500/20 text-lime-400 border-lime-500/30',
  'opencode-go': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
};

function getProviderBadge(provider: string): string {
  return PROVIDER_COLORS[provider] || 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
}

function getTierBadge(tier: string): string {
  switch (tier) {
    case 'free': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'budget': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'mini': return 'bg-lime-500/20 text-lime-400 border-lime-500/30';
    case 'flash': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'standard': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'sonnet': return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
    case 'opus': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'flagship': return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
  }
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border', className)}>
      {children}
    </span>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden', className)}>
      {children}
    </div>
  );
}

function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('px-5 py-4 border-b border-zinc-800 flex items-center justify-between', className)}>
      {children}
    </div>
  );
}

function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('p-5', className)}>
      {children}
    </div>
  );
}

function Button({ children, onClick, disabled, variant = 'primary', size = 'md', className, type = 'button' }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  type?: 'button' | 'submit';
}) {
  const variants = {
    primary: 'bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-zinc-700 disabled:text-zinc-500',
    secondary: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 disabled:opacity-50',
    ghost: 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-50',
    danger: 'bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors cursor-pointer', variants[variant], sizes[size], className)}
    >
      {children}
    </button>
  );
}

function Select({ value, onChange, children, className }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className={cn(
          'w-full appearance-none bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 pr-8 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50',
          'hover:border-zinc-600 transition-colors cursor-pointer',
          className
        )}
      >
        {children}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
    </div>
  );
}

function Alert({ type, children }: { type: 'info' | 'success' | 'warning' | 'error'; children: React.ReactNode }) {
  const styles = {
    info: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    warning: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    error: 'bg-red-500/10 border-red-500/20 text-red-400',
  };
  const icons = {
    info: <Info className="w-4 h-4 shrink-0" />,
    success: <Check className="w-4 h-4 shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 shrink-0" />,
    error: <XCircle className="w-4 h-4 shrink-0" />,
  };
  return (
    <div className={cn('flex items-start gap-3 px-4 py-3 rounded-lg border text-sm', styles[type])}>
      {icons[type]}
      <div>{children}</div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center">
        <Icon className="w-5 h-5 text-indigo-400" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
        {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function App() {
  const [configs, setConfigs] = useState<ConfigState | null>(null);
  const [models, setModels] = useState<ModelView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [suggestingFor, setSuggestingFor] = useState<string | null>(null);
  const [suggestionResult, setSuggestionResult] = useState<Record<string, SuggestionResponse['suggestion']>>({});
  const [suggestionRaw, setSuggestionRaw] = useState<Record<string, string>>({});
  const [ollamaModels, setOllamaModels] = useState<{ name: string; model: string; parameter_size?: string }[]>([]);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState('');
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(new Set());
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSnapshotsModal, setShowSnapshotsModal] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotDesc, setSnapshotDesc] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showProfilesModal, setShowProfilesModal] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileDesc, setProfileDesc] = useState('');
  const [profileAction, setProfileAction] = useState<'save' | 'rename'>('save');
  const [renameTarget, setRenameTarget] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [cfgRes, modelsRes, ollamaRes, snapshotsRes, profilesRes] = await Promise.all([
          fetch('/api/configs'),
          fetch('/api/models'),
          fetch('/api/ollama/models'),
          fetch('/api/snapshots'),
          fetch('/api/profiles'),
        ]);
        const cfgData = await cfgRes.json();
        const modelsData = await modelsRes.json();
        const ollamaData = await ollamaRes.json();
        const snapshotsData = await snapshotsRes.json();

        setConfigs(cfgData);
        setModels(modelsData);
        setSnapshots(snapshotsData.snapshots || []);
        const profilesData = await profilesRes.json();
        setProfiles(profilesData.profiles || []);

        if (ollamaData.available) {
          setOllamaAvailable(true);
          setOllamaModels(ollamaData.models);
          if (ollamaData.models.length > 0) {
            setSelectedOllamaModel(ollamaData.models[0].model);
          }
        } else {
          setOllamaAvailable(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
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

  const addChange = (filePath: string, jsonPath: (string | number)[], oldValue: unknown, newValue: unknown, display: string) => {
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
    await fetch('/api/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes }),
    });
    setPending([]);
    const res = await fetch('/api/configs');
    setConfigs(await res.json());
  };

  const aiSuggest = async (name: string, filePath: string, currentModel: string, type: 'agent' | 'category' = 'agent') => {
    if (!selectedOllamaModel) {
      setError('Please select an Ollama model first');
      return;
    }
    setSuggestingFor(name);
    try {
      const visibleProviders = providers.filter(([p]) => !hiddenProviders.has(p)).map(([p]) => p);
      const description = type === 'agent' ? getAgentRoleDescription(name) : `Category: ${name}`;
      const res = await fetch('/api/ollama/suggest-for-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: name,
          currentModel,
          agentDescription: description,
          ollamaModel: selectedOllamaModel,
          allowedProviders: visibleProviders,
        }),
      });
      const data: SuggestionResponse = await res.json();
      setSuggestionResult((prev) => ({ ...prev, [name]: data.suggestion }));
      if (data.raw) setSuggestionRaw((prev) => ({ ...prev, [name]: data.raw! }));
      if (data.suggestion) {
        const jsonPath = type === 'agent' ? ['agents', name, 'model'] : ['categories', name, 'model'];
        const display = type === 'agent' ? `${name} model (AI suggested)` : `${name} category (AI suggested)`;
        addChange(filePath, jsonPath, data.suggestion.currentValue, data.suggestion.suggestedValue, display);
      }
    } catch (err) {
      setError(`AI suggest failed: ${err}`);
    } finally {
      setSuggestingFor(null);
    }
  };

  const saveSnapshot = async () => {
    if (!snapshotName.trim()) return;
    await fetch('/api/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: snapshotName.trim(), description: snapshotDesc.trim() || undefined }),
    });
    const res = await fetch('/api/snapshots');
    const data = await res.json();
    setSnapshots(data.snapshots || []);
    setShowSaveModal(false);
    setSnapshotName('');
    setSnapshotDesc('');
  };

  const loadSnapshot = async (name: string) => {
    if (!confirm(`Load snapshot "${name}"? This will overwrite your current configs.`)) return;
    await fetch(`/api/snapshots/${encodeURIComponent(name)}/load`, { method: 'POST' });
    const res = await fetch('/api/configs');
    setConfigs(await res.json());
    setPending([]);
  };

  const deleteSnapshot = async (name: string) => {
    if (!confirm(`Delete snapshot "${name}"?`)) return;
    await fetch(`/api/snapshots/${encodeURIComponent(name)}`, { method: 'DELETE' });
    const res = await fetch('/api/snapshots');
    const data = await res.json();
    setSnapshots(data.snapshots || []);
  };

  const saveProfileAction = async () => {
    if (!profileName.trim()) return;
    await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: profileName.trim(), description: profileDesc.trim() || undefined }),
    });
    const res = await fetch('/api/profiles');
    const data = await res.json();
    setProfiles(data.profiles || []);
    setShowProfilesModal(false);
    setProfileName('');
    setProfileDesc('');
  };

  const applyProfileAction = async (name: string) => {
    if (!confirm(`Apply profile "${name}"? This will overwrite current model assignments.`)) return;
    const res = await fetch(`/api/profiles/${encodeURIComponent(name)}/apply`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      const cfgRes = await fetch('/api/configs');
      setConfigs(await cfgRes.json());
      setPending([]);
    } else {
      setError(data.message || data.error || 'Failed to apply profile');
    }
  };

  const deleteProfileAction = async (name: string) => {
    if (!confirm(`Delete profile "${name}"?`)) return;
    await fetch(`/api/profiles/${encodeURIComponent(name)}`, { method: 'DELETE' });
    const res = await fetch('/api/profiles');
    const data = await res.json();
    setProfiles(data.profiles || []);
  };

  const renameProfileAction = async (oldName: string, newName: string) => {
    await fetch(`/api/profiles/${encodeURIComponent(oldName)}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName }),
    });
    const res = await fetch('/api/profiles');
    const data = await res.json();
    setProfiles(data.profiles || []);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading ocforge...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <Alert type="error">{error}</Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">ocforge</h1>
              <p className="text-xs text-zinc-500">Model Configurator</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Cpu className="w-4 h-4" />
                <span>{models.length} models</span>
              </div>
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Server className="w-4 h-4" />
                <span className={ollamaAvailable ? 'text-emerald-400' : 'text-zinc-500'}>
                  {ollamaAvailable ? `${ollamaModels.length} local` : 'Ollama off'}
                </span>
              </div>
              {pending.length > 0 && (
                <div className="flex items-center gap-1.5 text-amber-400">
                  <GitBranch className="w-4 h-4" />
                  <span>{pending.length} pending</span>
                </div>
              )}
            </div>

            <Button variant="secondary" size="sm" onClick={() => setShowProfilesModal(true)}>
              <FolderOpen className="w-4 h-4" />
              Profiles
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowSnapshotsModal(true)}>
              <HardDrive className="w-4 h-4" />
              Snapshots
            </Button>

            {pending.length > 0 && (
              <Button onClick={applyChanges} className="bg-emerald-600 hover:bg-emerald-500">
                <Check className="w-4 h-4" />
                Apply {pending.length} change{pending.length > 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Ollama */}
        {ollamaAvailable === false && (
          <Alert type="warning">
            Ollama not available at localhost:11434.
            <a href="https://ollama.com" target="_blank" rel="noreferrer" className="underline ml-1">Install Ollama</a>
          </Alert>
        )}
        {ollamaAvailable === true && ollamaModels.length > 0 && (
          <Card>
            <CardContent className="flex items-center gap-4">
              <Brain className="w-5 h-5 text-indigo-400 shrink-0" />
              <span className="text-sm text-zinc-400 shrink-0">AI model:</span>
              <div className="flex-1 max-w-xs">
                <Select value={selectedOllamaModel} onChange={(e) => setSelectedOllamaModel(e.target.value)}>
                  {ollamaModels.map((m) => (
                    <option key={m.model} value={m.model}>{m.name} {m.parameter_size ? `(${m.parameter_size})` : ''}</option>
                  ))}
                </Select>
              </div>
              <span className="text-xs text-zinc-600">{ollamaModels.length} installed</span>
            </CardContent>
          </Card>
        )}

        {/* Provider Filter */}
        <section>
          <SectionTitle icon={Layers} title="Providers" subtitle="Toggle to filter models" />
          <div className="flex flex-wrap gap-2">
            {providers.map(([provider, count]) => {
              const isHidden = hiddenProviders.has(provider);
              return (
                <button
                  key={provider}
                  onClick={() => toggleProvider(provider)}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all cursor-pointer',
                    isHidden
                      ? 'bg-zinc-900 border-zinc-800 text-zinc-600 hover:text-zinc-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-750'
                  )}
                >
                  {!isHidden && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  <span>{provider}</span>
                  <Badge className={getProviderBadge(provider)}>{count}</Badge>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-zinc-600">
            Showing <span className="text-zinc-400 font-medium">{visibleModels.length}</span> of {models.length} models
          </p>
        </section>

        {/* Configs */}
        {configs?.omo.map((c) => (
          <section key={c.path}>
            <div className="flex items-center gap-2 mb-6">
              <Settings className="w-5 h-5 text-zinc-500" />
              <h2 className="text-lg font-semibold text-zinc-200">{c.path}</h2>
              <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700">{c.level}</Badge>
            </div>

            {/* Agents */}
            <div className="mb-8">
              <SectionTitle icon={Zap} title="Agents" subtitle={`${Object.keys(c.data.agents || {}).length} configured`} />
              <div className="space-y-3">
                {Object.entries(c.data.agents || {}).map(([name, cfg]: [string, any]) => {
                  const fallbacks: string[] = (cfg.fallback_models || []).map((f: any) => typeof f === 'string' ? f : f.model);
                  const modelPending = pending.find((p) => p.jsonPath.join('.') === `agents.${name}.model`);
                  const currentValue = modelPending ? modelPending.newValue : (cfg.model ?? '');
                  const provider = String(currentValue).split('/')[0] || '';
                  const tier = models.find((m) => m.id === currentValue)?.priceTier || '';
                  const suggestion = suggestionResult[name];

                  return (
                    <Card key={name}>
                      <div className="p-5">
                        <div className="flex items-start gap-4">
                          {/* Agent info */}
                          <div className="w-64 shrink-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-zinc-100">{name}</h3>
                              {fallbacks.length > 0 && (
                                <Badge className="bg-zinc-800 text-zinc-500 border-zinc-700">
                                  <GitBranch className="w-3 h-3" />
                                  {fallbacks.length}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{getAgentRoleDescription(name)}</p>
                          </div>

                          {/* Controls */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <Select
                                  value={String(currentValue)}
                                  onChange={(e) => addChange(c.path, ['agents', name, 'model'], cfg.model ?? '', e.target.value, `${name} model`)}
                                >
                                  <option value="">-- select model --</option>
                                  {modelsByProvider.map(([prov, ms]) => (
                                    <optgroup key={prov} label={prov}>
                                      {ms.map((m) => (
                                        <option key={m.id} value={m.id}>{m.id} ({m.priceTier})</option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </Select>
                              </div>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => aiSuggest(name, c.path, cfg.model ?? '')}
                                disabled={suggestingFor === name || !ollamaAvailable || !selectedOllamaModel}
                              >
                                {suggestingFor === name ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Sparkles className="w-4 h-4" />
                                )}
                                AI
                              </Button>
                            </div>

                            {provider && (
                              <div className="flex items-center gap-2 mt-2">
                                <Badge className={getProviderBadge(provider)}>{provider}</Badge>
                                {tier && <Badge className={getTierBadge(tier)}>{tier}</Badge>}
                              </div>
                            )}

                            {suggestion && (
                              <div className="mt-3 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                                <div className="flex items-center gap-2 text-sm">
                                  <Brain className="w-4 h-4 text-indigo-400" />
                                  <span className="text-indigo-300 font-medium">{suggestion.suggestedValue}</span>
                                  <span className="text-zinc-500">({Math.round(suggestion.confidence * 100)}%)</span>
                                </div>
                                <p className="text-xs text-zinc-500 mt-1">{suggestion.reason}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Fallbacks — always visible */}
                        <div className="mt-4 pt-4 border-t border-zinc-800">
                          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Fallback Models</p>
                          {fallbacks.length === 0 ? (
                            <p className="text-sm text-zinc-600">No fallbacks configured</p>
                          ) : (
                            <div className="flex flex-wrap gap-2 mb-3">
                              {fallbacks.map((fb, idx) => (
                                <Badge key={idx} className="bg-zinc-800 text-zinc-400 border-zinc-700">
                                  <GitBranch className="w-3 h-3" />
                                  {fb}
                                  <button
                                    onClick={() => {
                                      const newFallbacks = fallbacks.filter((_, i) => i !== idx);
                                      addChange(c.path, ['agents', name, 'fallback_models'], JSON.stringify(fallbacks), JSON.stringify(newFallbacks), `${name} fallback remove`);
                                    }}
                                    className="ml-1 text-zinc-600 hover:text-red-400 transition-colors cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-2 max-w-xs">
                            <Plus className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                            <Select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  const newFallbacks = [...fallbacks, e.target.value];
                                  addChange(c.path, ['agents', name, 'fallback_models'], JSON.stringify(fallbacks), JSON.stringify(newFallbacks), `${name} fallback`);
                                }
                              }}
                            >
                              <option value="">-- add fallback model --</option>
                              {modelsByProvider.map(([prov, ms]) => (
                                <optgroup key={prov} label={prov}>
                                  {ms.map((m) => (
                                    <option key={m.id} value={m.id}>{m.id}</option>
                                  ))}
                                </optgroup>
                              ))}
                            </Select>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Categories */}
            <div className="mb-8">
              <SectionTitle icon={Layers} title="Categories" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(c.data.categories || {}).map(([name, cfg]: [string, any]) => {
                  const modelPending = pending.find((p) => p.jsonPath.join('.') === `categories.${name}.model`);
                  const currentValue = modelPending ? modelPending.newValue : (cfg.model ?? '');
                  const provider = String(currentValue).split('/')[0] || '';
                  const tier = models.find((m) => m.id === currentValue)?.priceTier || '';
                  const suggestion = suggestionResult[name];

                  return (
                    <Card key={name}>
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-zinc-200">{name}</h3>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => aiSuggest(name, c.path, cfg.model ?? '', 'category')}
                              disabled={suggestingFor === name || !ollamaAvailable || !selectedOllamaModel}
                              className="px-2 py-1 text-xs"
                            >
                              {suggestingFor === name ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="w-3.5 h-3.5" />
                              )}
                              AI
                            </Button>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {provider && <Badge className={getProviderBadge(provider)}>{provider}</Badge>}
                            {tier && <Badge className={getTierBadge(tier)}>{tier}</Badge>}
                          </div>
                        </div>
                        <Select
                          value={String(currentValue)}
                          onChange={(e) => addChange(c.path, ['categories', name, 'model'], cfg.model ?? '', e.target.value, `${name} category`)}
                        >
                          <option value="">-- select model --</option>
                          {modelsByProvider.map(([prov, ms]) => (
                            <optgroup key={prov} label={prov}>
                              {ms.map((m) => (
                                <option key={m.id} value={m.id}>{m.id} ({m.priceTier})</option>
                              ))}
                            </optgroup>
                          ))}
                        </Select>

                        {suggestion && (
                          <div className="mt-3 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                            <div className="flex items-center gap-2 text-sm">
                              <Brain className="w-4 h-4 text-indigo-400" />
                              <span className="text-indigo-300 font-medium">{suggestion.suggestedValue}</span>
                              <span className="text-zinc-500">({Math.round(suggestion.confidence * 100)}%)</span>
                            </div>
                            <p className="text-xs text-zinc-500 mt-1">{suggestion.reason}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </section>
        ))}

        {/* OpenCode Config */}
        {configs?.opencode.map((c) => (
          <section key={c.path}>
            <div className="flex items-center gap-2 mb-6">
              <Settings className="w-5 h-5 text-zinc-500" />
              <h2 className="text-lg font-semibold text-zinc-200">{c.path}</h2>
              <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700">{c.level}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {['model', 'small_model'].map((field) => {
                const modelPending = pending.find((p) => p.jsonPath.join('.') === field);
                const currentValue = modelPending ? modelPending.newValue : (c.data[field] ?? '');
                const provider = String(currentValue).split('/')[0] || '';
                const tier = models.find((m) => m.id === currentValue)?.priceTier || '';

                return (
                  <Card key={field}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-zinc-200">{field}</h3>
                        <div className="flex items-center gap-1.5">
                          {provider && <Badge className={getProviderBadge(provider)}>{provider}</Badge>}
                          {tier && <Badge className={getTierBadge(tier)}>{tier}</Badge>}
                        </div>
                      </div>
                      <Select
                        value={String(currentValue)}
                        onChange={(e) => addChange(c.path, [field], c.data[field] ?? '', e.target.value, `OpenCode ${field}`)}
                      >
                        <option value="">-- select model --</option>
                        {modelsByProvider.map(([prov, ms]) => (
                          <optgroup key={prov} label={prov}>
                            {ms.map((m) => (
                              <option key={m.id} value={m.id}>{m.id} ({m.priceTier})</option>
                            ))}
                          </optgroup>
                        ))}
                      </Select>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}

        {/* Pending Changes */}
        {pending.length > 0 && (
          <section>
            <SectionTitle icon={GitBranch} title="Pending Changes" subtitle={`${pending.length} change${pending.length > 1 ? 's' : ''} to apply`} />
            <div className="space-y-2">
              {pending.map((p, idx) => (
                <Card key={idx} className="border-amber-500/20">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <ArrowRight className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-sm text-zinc-300 truncate">{p.display}</span>
                        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 shrink-0">
                          {String(p.oldValue) || 'none'} → {String(p.newValue)}
                        </Badge>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removePending(p.filePath, p.jsonPath)} className="px-2 shrink-0 text-zinc-500">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="mt-4">
              <Button onClick={applyChanges} className="bg-emerald-600 hover:bg-emerald-500">
                <Check className="w-4 h-4" />
                Apply All Changes
              </Button>
            </div>
          </section>
        )}
      </main>

      {/* Snapshots Modal */}
      {showSnapshotsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col">
            <CardHeader>
              <div className="flex items-center gap-3">
                <HardDrive className="w-5 h-5 text-indigo-400" />
                <h3 className="font-semibold text-zinc-100">Snapshots</h3>
                <span className="text-xs text-zinc-500">{snapshots.length} saved</span>
              </div>
              <button onClick={() => setShowSnapshotsModal(false)} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </CardHeader>
            <CardContent className="overflow-y-auto space-y-4">
              <div className="flex items-center gap-3">
                <Button onClick={() => { setShowSnapshotsModal(false); setShowSaveModal(true); }}>
                  <Save className="w-4 h-4" />
                  Save New Snapshot
                </Button>
              </div>
              {snapshots.length > 0 ? (
                <div className="space-y-2">
                  {snapshots.map((s) => (
                    <div key={s.name} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-800">
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-200">{s.name}</p>
                        {s.description && <p className="text-xs text-zinc-500 mt-0.5">{s.description}</p>}
                        <p className="text-xs text-zinc-600 mt-1">{new Date(s.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-4">
                        <Button variant="secondary" size="sm" onClick={() => { setShowSnapshotsModal(false); loadSnapshot(s.name); }}>
                          <RefreshCw className="w-3.5 h-3.5" />
                          Load
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => deleteSnapshot(s.name)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-600">No snapshots saved yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Save Snapshot Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <h3 className="font-semibold text-zinc-100">Save Snapshot</h3>
              <button onClick={() => setShowSaveModal(false)} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Name</label>
                <input
                  type="text"
                  value={snapshotName}
                  onChange={(e) => setSnapshotName(e.target.value)}
                  placeholder="e.g. Production Setup"
                  className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Description (optional)</label>
                <input
                  type="text"
                  value={snapshotDesc}
                  onChange={(e) => setSnapshotDesc(e.target.value)}
                  placeholder="e.g. Before experimenting with Claude"
                  className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setShowSaveModal(false)}>Cancel</Button>
                <Button onClick={saveSnapshot} disabled={!snapshotName.trim()}>Save Snapshot</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Profiles Modal */}
      {showProfilesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col">
            <CardHeader>
              <div className="flex items-center gap-3">
                <FolderOpen className="w-5 h-5 text-indigo-400" />
                <h3 className="font-semibold text-zinc-100">Profiles</h3>
                <span className="text-xs text-zinc-500">{profiles.length} saved</span>
              </div>
              <button onClick={() => setShowProfilesModal(false)} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </CardHeader>
            <CardContent className="overflow-y-auto space-y-4">
              <div className="flex items-center gap-3">
                <Button onClick={() => { setProfileAction('save'); setProfileName(''); setProfileDesc(''); setRenameTarget(''); }}>
                  <Save className="w-4 h-4" />
                  Save Current as Profile
                </Button>
              </div>

              {/* Save Profile Form */}
              {profileAction === 'save' && (
                <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-800 space-y-3">
                  <p className="text-sm font-medium text-zinc-300">Save current model assignments as a named profile</p>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Name</label>
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="e.g. Economy Mode"
                      className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Description (optional)</label>
                    <input
                      type="text"
                      value={profileDesc}
                      onChange={(e) => setProfileDesc(e.target.value)}
                      placeholder="e.g. Cheapest models for everyday work"
                      className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setProfileAction('save')}>Cancel</Button>
                    <Button size="sm" onClick={saveProfileAction} disabled={!profileName.trim()}>Save Profile</Button>
                  </div>
                </div>
              )}

              {/* Rename Profile Form */}
              {profileAction === 'rename' && renameTarget && (
                <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-800 space-y-3">
                  <p className="text-sm font-medium text-zinc-300">Rename "{renameTarget}"</p>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">New name</label>
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="New profile name"
                      className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
                      autoFocus
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setRenameTarget('')}>Cancel</Button>
                    <Button size="sm" onClick={() => { renameProfileAction(renameTarget, profileName); setRenameTarget(''); setProfileName(''); }} disabled={!profileName.trim()}>Rename</Button>
                  </div>
                </div>
              )}

              {profiles.length > 0 ? (
                <div className="space-y-2">
                  {profiles.map((p) => (
                    <div key={p.name} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-800">
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-200">{p.name}</p>
                        {p.description && <p className="text-xs text-zinc-500 mt-0.5">{p.description}</p>}
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge className="bg-zinc-800 text-zinc-500 border-zinc-700">
                            <Zap className="w-3 h-3" />
                            {Object.keys(p.assignments.agents).length} agents
                          </Badge>
                          <Badge className="bg-zinc-800 text-zinc-500 border-zinc-700">
                            <Layers className="w-3 h-3" />
                            {Object.keys(p.assignments.categories).length} categories
                          </Badge>
                          <span className="text-xs text-zinc-600">{new Date(p.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-4">
                        <Button variant="secondary" size="sm" onClick={() => { setShowProfilesModal(false); applyProfileAction(p.name); }}>
                          <RefreshCw className="w-3.5 h-3.5" />
                          Apply
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setProfileAction('rename'); setRenameTarget(p.name); setProfileName(p.name); }}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => deleteProfileAction(p.name)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-600">No profiles saved yet. Save your current model assignments as a profile to quickly switch between configurations.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
