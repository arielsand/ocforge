import type { Plugin } from "@opencode-ai/plugin";
import { runTUI } from "./tui/engine";

export const OcForgePlugin: Plugin = async (ctx) => {
  return {
    "tui.command.execute": async (input, output) => {
      if (input.command === "config-models") {
        await runTUI(ctx.directory);
        output.handled = true;
      }
    },
  };
};
