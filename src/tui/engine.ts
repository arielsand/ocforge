import { intro, outro, select, confirm, isCancel, multiselect } from '@clack/prompts';
import type { ConfigState, Change } from '../types';
import { discoverConfigs } from '../core/config-loader';
import { ModelRegistry } from '../core/model-registry';
import { SuggestionEngine } from '../core/suggestion-engine';
import { JSONCWriter } from '../core/jsonc-writer';
import { generateDiff } from '../core/diff-preview';

export async function runTUI(cwd?: string, dryRun = false): Promise<void> {
  intro('🔧 ocforge — OpenCode Model Configurator');

  const configs = discoverConfigs(cwd);
  const registry = new ModelRegistry();
  try {
    await registry.refresh();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    outro(`❌ Could not list models: ${message}\nMake sure opencode is installed and in your PATH.`);
    return;
  }

  const action = await select({
    message: 'What would you like to do?',
    options: [
      { value: 'browse', label: '📁 Browse & edit configs' },
      { value: 'smart', label: '🧠 Smart Update (suggest new models)' },
      { value: 'exit', label: '❌ Exit' },
    ],
  });

  if (isCancel(action) || action === 'exit') {
    outro('No changes made.');
    return;
  }

  if (action === 'smart') {
    await runSmartUpdate(configs, registry, dryRun);
  } else {
    await runBrowse(configs, registry, dryRun);
  }

  outro('Done!');
}

async function runSmartUpdate(configs: ConfigState, registry: ModelRegistry, dryRun = false): Promise<void> {
  const engine = new SuggestionEngine(registry);
  const suggestions = engine.generate(configs);

  if (suggestions.length === 0) {
    console.log('No suggestions available.');
    return;
  }

  const selected = await multiselect({
    message: 'Select suggestions to apply:',
    options: suggestions.map((s, i) => ({
      value: i,
      label: `${s.targetType} ${s.targetName}: ${s.currentValue} → ${s.suggestedValue} (${s.reason})`,
      hint: `${Math.round(s.confidence * 100)}% confidence`,
    })),
  });

  if (isCancel(selected) || selected.length === 0) {
    return;
  }

  const changes: Change[] = selected.map((idx) => {
    const s = suggestions[idx];
    const file =
      s.targetType === 'opencode-model' || s.targetType === 'opencode-small-model'
        ? configs.opencode[0]
        : configs.omo[0];

    let jsonPath: (string | number)[];
    if (s.targetType === 'opencode-model') jsonPath = ['model'];
    else if (s.targetType === 'opencode-small-model') jsonPath = ['small_model'];
    else if (s.targetType === 'agent') jsonPath = ['agents', s.targetName, 'model'];
    else jsonPath = ['categories', s.targetName, 'model'];

    return {
      filePath: file.path,
      jsonPath,
      oldValue: s.currentValue,
      newValue: s.suggestedValue,
    };
  });

  await applyChangesWithPreview(changes, dryRun);
}

function getOmOData(file: ConfigState['omo'][number]) {
  return file.data;
}

function getOpenCodeData(file: ConfigState['opencode'][number]) {
  return file.data;
}

async function runBrowse(configs: ConfigState, registry: ModelRegistry, dryRun = false): Promise<void> {
  const fileChoices = [
    ...configs.opencode.map((c) => ({ value: c.path, label: `OpenCode (${c.level}): ${c.path}` })),
    ...configs.omo.map((c) => ({ value: c.path, label: `OmO (${c.level}): ${c.path}` })),
  ];

  if (fileChoices.length === 0) {
    console.log('No config files found.');
    return;
  }

  const selectedPath = await select({
    message: 'Select a config file to edit:',
    options: fileChoices,
  });

  if (isCancel(selectedPath)) return;

  const file = [...configs.opencode, ...configs.omo].find((c) => c.path === selectedPath);
  if (!file) return;

  const isOmO = file.type === 'omo';
  const models = registry.list().map((m) => m.id);

  let jsonPath: (string | number)[];
  let oldValue: unknown;

  if (isOmO) {
    const omoData = getOmOData(file as ConfigState['omo'][number]);
    const agentOrCategory = await select({
      message: 'Edit agents or categories?',
      options: [
        { value: 'agents', label: '🎭 Agents' },
        { value: 'categories', label: '📂 Categories' },
      ],
    });
    if (isCancel(agentOrCategory)) return;

    type ItemConfig = { model?: string };
    const collection = (agentOrCategory === 'agents' ? omoData.agents : omoData.categories) as Record<string, ItemConfig> | undefined;
    const names = Object.keys(collection ?? {});
    const name = await select({
      message: `Select ${agentOrCategory.slice(0, -1)}:`,
      options: names.map((n) => ({ value: n, label: n })),
    });
    if (isCancel(name)) return;

    jsonPath = [agentOrCategory, name as string, 'model'];
    oldValue = collection?.[name as string]?.model;
  } else {
    const ocData = getOpenCodeData(file as ConfigState['opencode'][number]);
    const field = await select({
      message: 'Select field:',
      options: [
        { value: 'model', label: 'model' },
        { value: 'small_model', label: 'small_model' },
      ],
    });
    if (isCancel(field)) return;
    jsonPath = [field as string];
    oldValue = ocData[field as 'model' | 'small_model'];
  }

  const newModel = await select({
    message: `Select new model (current: ${oldValue ?? 'none'}):`,
    options: models.map((m) => ({ value: m, label: m })),
  });
  if (isCancel(newModel)) return;

  const change: Change = {
    filePath: file.path,
    jsonPath,
    oldValue,
    newValue: newModel,
  };

  await applyChangesWithPreview([change], dryRun);
}

async function applyChangesWithPreview(changes: Change[], dryRun = false): Promise<void> {
  for (const change of changes) {
    const diff = generateDiff(change.filePath, [change]);
    console.log(diff.summary);
  }

  if (dryRun) {
    console.log('\n🚫 Dry run — no changes were applied.');
    return;
  }

  const ok = await confirm({
    message: 'Apply these changes?',
    initialValue: false,
  });

  if (isCancel(ok) || !ok) {
    console.log('Aborted.');
    return;
  }

  const writer = new JSONCWriter();
  const byFile = new Map<string, Change[]>();
  for (const c of changes) {
    const arr = byFile.get(c.filePath) ?? [];
    arr.push(c);
    byFile.set(c.filePath, arr);
  }

  for (const [path, fileChanges] of byFile) {
    writer.applyChanges(path, fileChanges, true);
    console.log(`✅ Updated ${path}`);
  }
}
