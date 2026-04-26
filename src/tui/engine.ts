import { intro, outro, select, confirm, isCancel, multiselect, text } from '@clack/prompts';
import type { ConfigState, Change } from '../types';
import { discoverConfigs, discoverModelOwners } from '../core/config-loader';
import { ModelRegistry } from '../core/model-registry';
import { SuggestionEngine } from '../core/suggestion-engine';
import { JSONCWriter } from '../core/jsonc-writer';
import { generateDiff } from '../core/diff-preview';
import { signalReload, formatReloadMessage } from '../core/reload-signaler';
import { detectOmOVersion, formatVersionWarning } from '../core/version-detector';
import {
  listProfiles,
  saveProfile,
  deleteProfile,
  applyProfile,
} from '../core/profile-manager';

export async function runTUI(cwd?: string, dryRun = false): Promise<void> {
  intro('🔧 ocforge — OpenCode Model Configurator');

  const versionInfo = detectOmOVersion();
  const versionWarning = formatVersionWarning(versionInfo);
  if (versionWarning) {
    console.log(versionWarning);
    console.log();
  }

  const configs = discoverConfigs({ cwd });
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
      { value: 'profiles', label: '💾 Manage Profiles' },
      { value: 'exit', label: '❌ Exit' },
    ],
  });

  if (isCancel(action) || action === 'exit') {
    outro('No changes made.');
    return;
  }

  if (action === 'smart') {
    await runSmartUpdate(configs, registry, dryRun);
  } else if (action === 'profiles') {
    await runProfiles(configs, dryRun);
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
  const ownedModels = discoverModelOwners();
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

    console.log('\n📋 Model assignments in this file:');
    const fileOwned = ownedModels.filter((m) => m.owner.configPath === file.path);
    for (const owned of fileOwned) {
      console.log(`  • ${owned.name} (${owned.role}): ${owned.currentModel ?? 'none'}`);
    }
    console.log();

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

    console.log('\n📋 Model assignments in this file:');
    const fileOwned = ownedModels.filter((m) => m.owner.configPath === file.path);
    for (const owned of fileOwned) {
      console.log(`  • ${owned.name} (${owned.role}): ${owned.currentModel ?? 'none'}`);
    }
    console.log();

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

    const verification = writer.verifyChanges(path, fileChanges);
    if (!verification.verified) {
      console.log(`⚠️  Verification failed for ${path}:`);
      for (const m of verification.mismatches) {
        console.log(`   - ${m}`);
      }
    }
  }

  const reloadResult = await signalReload();
  console.log(formatReloadMessage(reloadResult));
}

async function runProfiles(configs: ConfigState, dryRun = false): Promise<void> {
  const profiles = listProfiles();

  const profileAction = await select({
    message: 'Profile management:',
    options: [
      { value: 'list', label: '📋 List profiles' },
      { value: 'save', label: '💾 Save current as profile' },
      { value: 'apply', label: '▶️ Apply profile' },
      { value: 'delete', label: '🗑️ Delete profile' },
      { value: 'back', label: '← Back' },
    ],
  });

  if (isCancel(profileAction) || profileAction === 'back') return;

  if (profileAction === 'list') {
    if (profiles.length === 0) {
      console.log('No profiles saved yet.');
      return;
    }
    console.log(`\n${profiles.length} profile(s):\n`);
    for (const p of profiles) {
      const agentCount = Object.keys(p.assignments.agents).length;
      const catCount = Object.keys(p.assignments.categories).length;
      console.log(`  • ${p.name}`);
      if (p.description) console.log(`    ${p.description}`);
      console.log(`    ${agentCount} agents, ${catCount} categories — ${new Date(p.updatedAt).toLocaleDateString()}`);
    }
    console.log();
    return;
  }

  if (profileAction === 'save') {
    const name = await text({
      message: 'Profile name:',
      placeholder: 'e.g. Economy Mode',
    });
    if (isCancel(name) || !name) return;

    const desc = await text({
      message: 'Description (optional):',
      placeholder: 'e.g. Cheapest models for everyday work',
    });

    const omoFile = configs.omo[0];
    if (!omoFile) {
      console.log('No OmO config found.');
      return;
    }

    const profile = saveProfile(name, omoFile.data as import('../types').OmOConfig, isCancel(desc) ? undefined : desc || undefined);
    console.log(`✅ Profile "${profile.name}" saved (${Object.keys(profile.assignments.agents).length} agents, ${Object.keys(profile.assignments.categories).length} categories)`);
    return;
  }

  if (profileAction === 'apply') {
    if (profiles.length === 0) {
      console.log('No profiles saved yet.');
      return;
    }

    const name = await select({
      message: 'Select profile to apply:',
      options: profiles.map((p) => ({ value: p.name, label: p.name })),
    });
    if (isCancel(name)) return;

    const omoFile = configs.omo[0];
    if (!omoFile) {
      console.log('No OmO config found.');
      return;
    }

    if (dryRun) {
      console.log(`🚫 Dry run — would apply profile "${name}"`);
      return;
    }

    const result = applyProfile(name, omoFile.path, omoFile.data as import('../types').OmOConfig);
    if (result.success) {
      console.log(`✅ ${result.message}`);
    } else {
      console.log(`❌ ${result.message}`);
    }
    return;
  }

  if (profileAction === 'delete') {
    if (profiles.length === 0) {
      console.log('No profiles saved yet.');
      return;
    }

    const name = await select({
      message: 'Select profile to delete:',
      options: profiles.map((p) => ({ value: p.name, label: p.name })),
    });
    if (isCancel(name)) return;

    const ok = await confirm({ message: `Delete profile "${name}"?`, initialValue: false });
    if (isCancel(ok) || !ok) return;

    const deleted = deleteProfile(name);
    if (deleted) {
      console.log(`✅ Profile "${name}" deleted.`);
    } else {
      console.log(`❌ Profile "${name}" not found.`);
    }
  }
}
