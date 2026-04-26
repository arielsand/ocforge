#!/usr/bin/env bun
import { Command } from 'commander';
import { runTUI } from './tui/engine';
import { runExtendedTUI } from './tui/extended';
import { startWebServer } from './web/server';
import { discoverConfigs } from './core/config-loader';
import {
  listProfiles,
  saveProfile,
  deleteProfile,
  renameProfile,
  applyProfile,
} from './core/profile-manager';

const program = new Command();

program
  .name('ocforge')
  .description('OpenCode Agent & Model Configurator')
  .version('0.2.0');

program
  .option('--config <path>', 'custom config directory')
  .option('--web', 'launch web UI')
  .option('--tui', 'launch rich terminal UI (dashboard mode)')
  .option('--dry-run', 'show diff without applying changes')
  .action(async (options) => {
    if (options.web) {
      await startWebServer(3456, options.config);
    } else if (options.tui) {
      runExtendedTUI();
    } else {
      await runTUI(options.config, options.dryRun);
    }
  });

// Profiles subcommand
const profilesCmd = program.command('profiles').description('Manage named model assignment profiles');

profilesCmd
  .command('list')
  .description('List all saved profiles')
  .action(() => {
    const profiles = listProfiles();
    if (profiles.length === 0) {
      console.log('No profiles saved yet.');
      return;
    }
    console.log(`\n${profiles.length} profile(s) saved:\n`);
    for (const p of profiles) {
      const agentCount = Object.keys(p.assignments.agents).length;
      const catCount = Object.keys(p.assignments.categories).length;
      console.log(`  • ${p.name}`);
      if (p.description) console.log(`    ${p.description}`);
      console.log(`    ${agentCount} agents, ${catCount} categories — updated ${new Date(p.updatedAt).toLocaleDateString()}`);
      console.log();
    }
  });

profilesCmd
  .command('save')
  .argument('<name>', 'profile name')
  .option('-d, --description <desc>', 'profile description')
  .description('Save current model assignments as a profile')
  .action((name: string, options: { description?: string }) => {
    const configs = discoverConfigs();
    const omoFile = configs.omo[0];
    if (!omoFile) {
      console.error('Error: No Oh My OpenAgent config found.');
      process.exit(1);
    }
    const profile = saveProfile(name, omoFile.data as import('./types').OmOConfig, options.description);
    console.log(`✅ Profile "${profile.name}" saved (${Object.keys(profile.assignments.agents).length} agents, ${Object.keys(profile.assignments.categories).length} categories)`);
  });

profilesCmd
  .command('apply')
  .argument('<name>', 'profile name')
  .description('Apply a profile to current config')
  .action((name: string) => {
    const configs = discoverConfigs();
    const omoFile = configs.omo[0];
    if (!omoFile) {
      console.error('Error: No Oh My OpenAgent config found.');
      process.exit(1);
    }
    const result = applyProfile(name, omoFile.path, omoFile.data as import('./types').OmOConfig);
    if (result.success) {
      console.log(`✅ ${result.message}`);
      if (result.changes.length > 0) {
        console.log(`   ${result.changes.length} change(s) applied to ${omoFile.path}`);
      }
      if (!result.verified) {
        console.log('⚠️  Verification: some changes may not have been applied correctly.');
      }
      console.log('⚠️  Run /reload in OpenCode or restart to apply changes.');
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
  });

profilesCmd
  .command('delete')
  .argument('<name>', 'profile name')
  .description('Delete a profile')
  .action((name: string) => {
    const deleted = deleteProfile(name);
    if (deleted) {
      console.log(`✅ Profile "${name}" deleted.`);
    } else {
      console.error(`❌ Profile "${name}" not found.`);
      process.exit(1);
    }
  });

profilesCmd
  .command('rename')
  .argument('<old>', 'current name')
  .argument('<new>', 'new name')
  .description('Rename a profile')
  .action((oldName: string, newName: string) => {
    const renamed = renameProfile(oldName, newName);
    if (renamed) {
      console.log(`✅ Profile "${oldName}" renamed to "${newName}".`);
    } else {
      console.error(`❌ Could not rename "${oldName}" to "${newName}".`);
      process.exit(1);
    }
  });

program.parse();
