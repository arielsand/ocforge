import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp, measureElement } from 'ink';
import { THEME } from './theme';
import { BoxPanel, SelectableRow, KeyHint, StatusMessage } from './components';
import type { AppState, Panel } from './types';
import { OPENCODE_FIELDS } from './types';
import { discoverConfigs } from '../../core/config-loader';
import { ModelRegistry } from '../../core/model-registry';
import { SuggestionEngine } from '../../core/suggestion-engine';
import { JSONCWriter } from '../../core/jsonc-writer';
import { generateDiff } from '../../core/diff-preview';
import { listSnapshots, saveSnapshot } from '../../core/snapshot-manager';
import { listOllamaModels, generateWithOllama, buildSuggestionPrompt } from '../../core/ollama-client';
import type { ConfigState, ModelInfo, Change } from '../../types';

const PANELS: Panel[] = ['agents', 'categories', 'opencode'];

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  anthropic: '#d4a27f',
  google: '#4285f4',
  ollama: '#7c3aed',
  'ollama-cloud': '#9333ea',
  deepseek: '#0097a7',
  meta: '#0668e1',
  mistral: '#ff7000',
  cohere: '#39594f',
};

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

function getTierColor(tier: string): string {
  switch (tier) {
    case 'free': return '#4caf50';
    case 'budget': return '#8bc34a';
    case 'mid': return '#ff9800';
    case 'premium': return '#f44336';
    case 'flagship': return '#e91e63';
    default: return '#9e9e9e';
  }
}

function getProviderColor(provider: string): string {
  return PROVIDER_COLORS[provider] || '#00bcd4';
}

export default function App() {
  const { exit } = useApp();

  const [state, setState] = useState<AppState>({
    configs: { opencode: [], omo: [] },
    models: [],
    activePanel: 'agents',
    selectedAgent: 0,
    selectedCategory: 0,
    selectedOpencodeField: 0,
    pendingChanges: [],
    message: null,
    messageType: 'info',
    showModelPicker: false,
    pickerTarget: null,
    showSnapshotModal: false,
    snapshotName: '',
    snapshotDesc: '',
    snapshots: [],
    showOllamaPicker: false,
    ollamaModels: [],
    selectedOllamaModel: '',
    ollamaAvailable: false,
    aiSuggesting: null,
  });

  const [pickerScroll, setPickerScroll] = useState(0);
  const [pickerSelected, setPickerSelected] = useState(0);

  // Load data on mount
  useEffect(() => {
    (async () => {
      try {
        const configs = discoverConfigs();
        const registry = new ModelRegistry();
        const models = await registry.refresh();
        const snapshots = listSnapshots();

        let ollamaModels: { name: string; model: string }[] = [];
        let ollamaAvailable = false;
        try {
          const om = await listOllamaModels();
          ollamaAvailable = true;
          ollamaModels = om.map((m) => ({ name: m.name, model: m.model }));
        } catch {
          // Ollama not available
        }

        setState((s) => ({
          ...s,
          configs,
          models,
          snapshots,
          ollamaModels,
          ollamaAvailable,
          selectedOllamaModel: ollamaModels[0]?.model || '',
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          message: `Error loading: ${err}`,
          messageType: 'error',
        }));
      }
    })();
  }, []);

  // Keyboard handling
  useInput((input, key) => {
    // Model picker mode
    if (state.showModelPicker) {
      if (key.escape || input === 'q') {
        setState((s) => ({ ...s, showModelPicker: false, pickerTarget: null }));
        return;
      }
      if (key.upArrow) {
        setPickerSelected((s) => Math.max(0, s - 1));
        return;
      }
      if (key.downArrow) {
        setPickerSelected((s) => Math.min(state.models.length - 1, s + 1));
        return;
      }
      if (key.return) {
        const model = state.models[pickerSelected];
        if (model) handleModelPick(model.id);
        return;
      }
      return;
    }

    // Snapshot modal
    if (state.showSnapshotModal) {
      if (key.escape) {
        setState((s) => ({ ...s, showSnapshotModal: false, snapshotName: '', snapshotDesc: '' }));
        return;
      }
      if (key.return) {
        handleSaveSnapshot();
        return;
      }
      // Type name/desc
      if (input && !key.ctrl && !key.meta) {
        if (!key.return) {
          setState((s) => ({ ...s, snapshotName: s.snapshotName + input }));
        }
      }
      if (key.backspace || key.delete) {
        setState((s) => ({
          ...s,
          snapshotName: s.snapshotName.slice(0, -1),
        }));
      }
      return;
    }

    // Global shortcuts
    if (input === 'q') {
      exit();
      return;
    }

    if (input === 's') {
      setState((s) => ({ ...s, showSnapshotModal: true }));
      return;
    }

    if (input === 'a') {
      handleAiSuggest();
      return;
    }

    if (key.return) {
      handleEdit();
      return;
    }

    if (key.tab) {
      const idx = PANELS.indexOf(state.activePanel);
      const next = key.shift
        ? PANELS[(idx - 1 + PANELS.length) % PANELS.length]
        : PANELS[(idx + 1) % PANELS.length];
      setState((s) => ({ ...s, activePanel: next as Panel }));
      return;
    }

    if (key.upArrow) {
      navigate(-1);
      return;
    }

    if (key.downArrow) {
      navigate(1);
      return;
    }

    if (key.escape) {
      setState((s) => ({ ...s, message: null }));
      return;
    }
  });

  const navigate = (delta: number) => {
    setState((s) => {
      if (s.activePanel === 'agents') {
        const max = Math.max(0, Object.keys(s.configs.omo[0]?.data.agents ?? {}).length - 1);
        return { ...s, selectedAgent: Math.max(0, Math.min(max, s.selectedAgent + delta)) };
      }
      if (s.activePanel === 'categories') {
        const max = Math.max(0, Object.keys(s.configs.omo[0]?.data.categories ?? {}).length - 1);
        return { ...s, selectedCategory: Math.max(0, Math.min(max, s.selectedCategory + delta)) };
      }
      if (s.activePanel === 'opencode') {
        const max = OPENCODE_FIELDS.length - 1;
        return { ...s, selectedOpencodeField: Math.max(0, Math.min(max, s.selectedOpencodeField + delta)) };
      }
      return s;
    });
  };

  const handleEdit = () => {
    const { activePanel, configs } = state;
    const omo = configs.omo[0];
    const oc = configs.opencode[0];

    if (activePanel === 'agents' && omo) {
      const agents = Object.entries(omo.data.agents ?? {});
      const [name, cfg] = agents[state.selectedAgent] || [];
      if (!name) return;
      setState((s) => ({
        ...s,
        showModelPicker: true,
        pickerTarget: { type: 'agent', name, filePath: omo.path, currentValue: (cfg as any)?.model || '' },
      }));
      setPickerSelected(0);
    } else if (activePanel === 'categories' && omo) {
      const cats = Object.entries(omo.data.categories ?? {});
      const [name, cfg] = cats[state.selectedCategory] || [];
      if (!name) return;
      setState((s) => ({
        ...s,
        showModelPicker: true,
        pickerTarget: { type: 'category', name, filePath: omo.path, currentValue: (cfg as any)?.model || '' },
      }));
      setPickerSelected(0);
    } else if (activePanel === 'opencode' && oc) {
      const field = OPENCODE_FIELDS[state.selectedOpencodeField];
      setState((s) => ({
        ...s,
        showModelPicker: true,
        pickerTarget: { type: field === 'model' ? 'opencode-model' : 'opencode-small-model', name: field, filePath: oc.path, currentValue: (oc.data as any)[field] || '' },
      }));
      setPickerSelected(0);
    }
  };

  const handleModelPick = (modelId: string) => {
    const target = state.pickerTarget;
    if (!target) return;

    const change: Change = {
      filePath: target.filePath,
      jsonPath:
        target.type === 'agent'
          ? ['agents', target.name, 'model']
          : target.type === 'category'
          ? ['categories', target.name, 'model']
          : [target.name],
      oldValue: target.currentValue,
      newValue: modelId,
    };

    setState((s) => ({
      ...s,
      showModelPicker: false,
      pickerTarget: null,
      pendingChanges: [...s.pendingChanges, change],
      message: `Queued: ${modelId} for ${target.name}`,
      messageType: 'success',
    }));
  };

  const handleSaveSnapshot = () => {
    if (!state.snapshotName.trim()) return;
    const configs = state.configs;
    const snapshotConfigs = [...configs.opencode, ...configs.omo].map((c) => ({
      path: c.path,
      type: c.type,
      content: c.content,
    }));
    saveSnapshot(state.snapshotName.trim(), snapshotConfigs, state.snapshotDesc.trim() || undefined);
    const snapshots = listSnapshots();
    setState((s) => ({
      ...s,
      showSnapshotModal: false,
      snapshotName: '',
      snapshotDesc: '',
      snapshots,
      message: `Snapshot "${state.snapshotName.trim()}" saved!`,
      messageType: 'success',
    }));
  };

  const handleAiSuggest = async () => {
    const { activePanel, configs, selectedOllamaModel, ollamaAvailable } = state;
    const omo = configs.omo[0];

    if (!ollamaAvailable || !selectedOllamaModel) {
      setState((s) => ({
        ...s,
        message: 'Ollama not available. Install from ollama.com',
        messageType: 'error',
      }));
      return;
    }
    if (!omo) {
      setState((s) => ({
        ...s,
        message: 'No OmO config loaded',
        messageType: 'error',
      }));
      return;
    }

    let agentName: string;
    let currentModel: string;
    if (activePanel === 'agents') {
      const agents = Object.entries(omo.data.agents ?? {});
      const [name, cfg] = agents[state.selectedAgent] || [];
      if (!name) return;
      agentName = name;
      currentModel = (cfg as any)?.model || '';
    } else {
      setState((s) => ({
        ...s,
        message: 'AI Suggest works on Agents panel only',
        messageType: 'warning',
      }));
      return;
    }

    setState((s) => ({ ...s, aiSuggesting: agentName }));
    try {
      const prompt = buildSuggestionPrompt(agentName, currentModel, getAgentRoleDescription(agentName), state.models);
      const response = await generateWithOllama(selectedOllamaModel, prompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      if (parsed?.model) {
        const change: Change = {
          filePath: omo.path,
          jsonPath: ['agents', agentName, 'model'],
          oldValue: currentModel,
          newValue: parsed.model,
        };
        setState((s) => ({
          ...s,
          pendingChanges: [...s.pendingChanges, change],
          message: `AI suggests ${parsed.model}: ${parsed.reason}`,
          messageType: 'success',
        }));
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        message: `AI suggest failed: ${err}`,
        messageType: 'error',
      }));
    } finally {
      setState((s) => ({ ...s, aiSuggesting: null }));
    }
  };

  // ═══════════════════════════════════════════
  // RENDER: Main dashboard view
  // ═══════════════════════════════════════════

  const renderHeader = () => (
    <Box width="100%" paddingX={1} backgroundColor="#1a1a2e">
      <Text color="#00e5ff" bold>🔧 ocforge</Text>
      <Text color="#666"> v0.1.0</Text>
      <Box width="100%" justifyContent="flex-end">
        <Text color="#9e9e9e">Models: </Text>
        <Text color="#00bcd4">{state.models.length}</Text>
        <Text color="#9e9e9e">  │ Ollama: </Text>
        <Text color={state.ollamaAvailable ? '#4caf50' : '#f44336'}>{state.ollamaAvailable ? state.ollamaModels.length : 'off'}</Text>
        {state.pendingChanges.length > 0 && (
          <Box>
            <Text color="#9e9e9e">  │ </Text>
            <Text color="#ff9800" bold>{state.pendingChanges.length} pending</Text>
          </Box>
        )}
      </Box>
    </Box>
  );

  const renderAgentsPanel = () => {
    const agents = Object.entries(state.configs.omo[0]?.data.agents ?? {});
    const focused = state.activePanel === 'agents';
    const panelColor = focused ? '#e91e63' : '#333';

    return (
      <Box flexDirection="column" width="37%" borderStyle="single" borderColor={panelColor}>
        <Box paddingX={1}>
          <Text color="#e91e63" bold>🎭 Agents</Text>
          {focused && <Text color="#666"> ← active</Text>}
        </Box>
        <Box flexDirection="column" paddingX={1}>
          {agents.map(([name, cfg]: [string, any], idx) => {
            const isSelected = focused && idx === state.selectedAgent;
            const role = getAgentRoleDescription(name);
            const model = cfg?.model || 'none';
            const fallbacks = cfg?.fallback_models || [];
            const provider = model.split('/')[0] || '';
            const tier = state.models.find(m => m.id === model)?.priceTier || '';
            return (
              <Box key={name} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text backgroundColor={isSelected ? '#263238' : undefined} color={isSelected ? '#fff' : '#e0e0e0'}>
                    {isSelected ? ' ▶ ' : '   '}
                  </Text>
                  <Text backgroundColor={isSelected ? '#263238' : undefined} color={isSelected ? '#fff' : '#e0e0e0'} bold={isSelected}>
                    {name}
                  </Text>
                </Box>
                <Box paddingLeft={3}>
                  <Text dimColor color="#888">{role.slice(0, 35)}</Text>
                </Box>
                <Box paddingLeft={3}>
                  <Text color={getProviderColor(provider)}>{model}</Text>
                  {tier && <Text color={getTierColor(tier)}> {tier}</Text>}
                  {fallbacks.length > 0 && <Text color="#666"> ⛓{fallbacks.length}</Text>}
                </Box>
              </Box>
            );
          })}
          {agents.length === 0 && (
            <Box paddingLeft={2}>
              <Text dimColor color="#666">No agents found</Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  };

  const renderCategoriesPanel = () => {
    const cats = Object.entries(state.configs.omo[0]?.data.categories ?? {});
    const focused = state.activePanel === 'categories';
    const panelColor = focused ? '#9c27b0' : '#333';

    return (
      <Box flexDirection="column" width="35%" borderStyle="single" borderColor={panelColor}>
        <Box paddingX={1}>
          <Text color="#9c27b0" bold>📂 Categories</Text>
          {focused && <Text color="#666"> ← active</Text>}
        </Box>
        <Box flexDirection="column" paddingX={1}>
          {cats.map(([name, cfg]: [string, any], idx) => {
            const isSelected = focused && idx === state.selectedCategory;
            const model = cfg?.model || 'none';
            const provider = model.split('/')[0] || '';
            const tier = state.models.find(m => m.id === model)?.priceTier || '';
            return (
              <Box key={name} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text backgroundColor={isSelected ? '#263238' : undefined} color={isSelected ? '#fff' : '#e0e0e0'}>
                    {isSelected ? ' ▶ ' : '   '}
                  </Text>
                  <Text backgroundColor={isSelected ? '#263238' : undefined} color={isSelected ? '#fff' : '#e0e0e0'} bold={isSelected}>
                    {name}
                  </Text>
                </Box>
                <Box paddingLeft={3}>
                  <Text color={getProviderColor(provider)}>{model}</Text>
                  {tier && <Text color={getTierColor(tier)}> {tier}</Text>}
                </Box>
              </Box>
            );
          })}
          {cats.length === 0 && (
            <Box paddingLeft={2}>
              <Text dimColor color="#666">No categories found</Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  };

  const renderOpenCodePanel = () => {
    const oc = state.configs.opencode[0];
    const focused = state.activePanel === 'opencode';
    const panelColor = focused ? '#00bcd4' : '#333';
    const ocData = oc?.data as Record<string, any> | undefined;

    return (
      <Box flexDirection="column" width="28%" borderStyle="single" borderColor={panelColor}>
        <Box paddingX={1}>
          <Text color="#00bcd4" bold>⚙️ OpenCode</Text>
          {focused && <Text color="#666"> ← active</Text>}
        </Box>
        <Box flexDirection="column" paddingX={1}>
          {OPENCODE_FIELDS.map((field, idx) => {
            const isSelected = focused && idx === state.selectedOpencodeField;
            const value = ocData?.[field] ?? 'none';
            const provider = String(value).split('/')[0] || '';
            const tier = state.models.find(m => m.id === value)?.priceTier || '';
            return (
              <Box key={field} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text backgroundColor={isSelected ? '#263238' : undefined} color={isSelected ? '#fff' : '#e0e0e0'}>
                    {isSelected ? ' ▶ ' : '   '}
                  </Text>
                  <Text backgroundColor={isSelected ? '#263238' : undefined} color={isSelected ? '#fff' : '#e0e0e0'} bold={isSelected}>
                    {field}
                  </Text>
                </Box>
                <Box paddingLeft={3}>
                  <Text color={getProviderColor(provider)}>{String(value)}</Text>
                  {tier && <Text color={getTierColor(tier)}> {tier}</Text>}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  };

  const renderFooter = () => (
    <Box width="100%" paddingX={1} backgroundColor="#1a1a2e" borderStyle="single" borderColor="#0d7377">
      <KeyHint shortcut="Tab" label="Switch" />
      <Text color="#333">│</Text>
      <KeyHint shortcut="↑↓" label="Navigate" />
      <Text color="#333">│</Text>
      <KeyHint shortcut="Enter" label="Edit" />
      <Text color="#333">│</Text>
      <KeyHint shortcut="S" label="Snapshot" />
      <Text color="#333">│</Text>
      <KeyHint shortcut="A" label="AI" />
      {state.pendingChanges.length > 0 && (
        <Box>
          <Text color="#333">│</Text>
          <KeyHint shortcut="Ctrl+S" label="Apply" />
        </Box>
      )}
      <Text color="#333">│</Text>
      <KeyHint shortcut="Q" label="Quit" />
    </Box>
  );

  // ═══════════════════════════════════════════
  // RENDER: Model picker screen
  // ═══════════════════════════════════════════

  const renderModelPicker = () => {
    if (!state.showModelPicker || !state.pickerTarget) return null;
    const target = state.pickerTarget;

    // Group models by provider
    const groups: Record<string, ModelInfo[]> = {};
    let flatIdx = 0;
    for (const m of state.models) {
      groups[m.provider] = groups[m.provider] || [];
      groups[m.provider].push(m);
    }

    // Build flat list for selection
    let cursor = 0;
    const lines: React.ReactNode[] = [];

    for (const [provider, models] of Object.entries(groups)) {
      lines.push(
        <Box key={`h-${provider}`} marginTop={provider === Object.keys(groups)[0] ? 0 : 1}>
          <Text color={getProviderColor(provider)} bold>{provider}</Text>
        </Box>
      );
      for (const m of models) {
        const idx = cursor++;
        const isCurrent = m.id === target.currentValue;
        const isSelected = idx === pickerSelected;
        lines.push(
          <Box key={m.id} paddingLeft={2}>
            <Text backgroundColor={isSelected ? '#263238' : undefined} color={isSelected ? '#fff' : isCurrent ? '#ff9800' : '#e0e0e0'}>
              {isSelected ? '▶ ' : '  '}
              {m.id}
            </Text>
            <Text color={getTierColor(m.priceTier)}> ({m.priceTier})</Text>
            {isCurrent && <Text color="#ff9800"> ← current</Text>}
          </Box>
        );
      }
    }

    return (
      <Box flexDirection="column" width="100%" height="100%">
        <Box width="100%" paddingX={1} backgroundColor="#1a1a2e">
          <Text color="#ff9800" bold>🎨 Select model for </Text>
          <Text color="#fff" bold>{target.name}</Text>
          <Box width="100%" justifyContent="flex-end">
            <Text color="#666">[↑↓] Navigate  [Enter] Select  [Esc] Cancel</Text>
          </Box>
        </Box>
        <Box flexDirection="column" paddingX={1}>
          {lines}
        </Box>
      </Box>
    );
  };

  // ═══════════════════════════════════════════
  // RENDER: Snapshot save modal
  // ═══════════════════════════════════════════

  const renderSnapshotModal = () => {
    if (!state.showSnapshotModal) return null;

    return (
      <Box flexDirection="column" width="100%" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text color="#ff9800" bold>💾 Save Snapshot</Text>
        </Box>
        <Box marginBottom={1}>
          <Text color="#9e9e9e">Name: </Text>
          <Text color="#e0e0e0">{state.snapshotName}</Text>
          <Text color="#00e5ff">█</Text>
        </Box>
        <Box marginBottom={1}>
          <Text color="#9e9e9e">Description: </Text>
          <Text color="#666">{state.snapshotDesc}</Text>
        </Box>
        <Box marginBottom={1}>
          <Text color="#9e9e9e">Type snapshot name and press Enter. Esc to cancel.</Text>
        </Box>
        {state.snapshots.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text color="#666" bold>Existing snapshots:</Text>
            {state.snapshots.slice(0, 5).map((s) => (
              <Box key={s.name} paddingLeft={2}>
                <Text color="#00bcd4">{s.name}</Text>
                <Text color="#666"> — {new Date(s.createdAt).toLocaleDateString()}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  };

  // ═══════════════════════════════════════════
  // RENDER: Main layout
  // ═══════════════════════════════════════════

  // If model picker is open, show it instead of the dashboard
  if (state.showModelPicker) {
    return (
      <Box flexDirection="column" backgroundColor="#1a1a2e">
        {renderModelPicker()}
      </Box>
    );
  }

  // If snapshot modal is open, show it instead of the dashboard
  if (state.showSnapshotModal) {
    return (
      <Box flexDirection="column" backgroundColor="#1a1a2e">
        {renderHeader()}
        {state.message && <StatusMessage message={state.message} type={state.messageType} />}
        {renderSnapshotModal()}
      </Box>
    );
  }

  // Default: Dashboard view
  return (
    <Box flexDirection="column" backgroundColor="#1a1a2e">
      {renderHeader()}

      {state.message && <StatusMessage message={state.message} type={state.messageType} />}

      <Box flexDirection="row" gap={0}>
        {renderAgentsPanel()}
        {renderCategoriesPanel()}
        {renderOpenCodePanel()}
      </Box>

      {state.pendingChanges.length > 0 && (
        <Box width="100%" paddingX={1} backgroundColor="#263238">
          <Text color="#ff9800">⚠ {state.pendingChanges.length} pending change(s). Press Enter to edit, then apply from web UI.</Text>
        </Box>
      )}

      {renderFooter()}
    </Box>
  );
}