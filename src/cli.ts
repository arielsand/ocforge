#!/usr/bin/env bun
import { Command } from 'commander';
import { runTUI } from './tui/engine';
import { startWebServer } from './web/server';

const program = new Command();

program
  .name('ocforge')
  .description('OpenCode Agent & Model Configurator')
  .version('0.1.0');

program
  .option('--config <path>', 'custom config directory')
  .option('--web', 'launch web UI')
  .action(async (options) => {
    if (options.web) {
      await startWebServer(3456);
    } else {
      await runTUI(options.config);
    }
  });

program.parse();
