#!/usr/bin/env bun
import { Command } from 'commander';
import { runTUI } from './tui/engine';
import { runExtendedTUI } from './tui/extended';
import { startWebServer } from './web/server';

const program = new Command();

program
  .name('ocforge')
  .description('OpenCode Agent & Model Configurator')
  .version('0.1.0');

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

program.parse();
