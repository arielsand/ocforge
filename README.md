# 🔧 ocforge

**OpenCode Agent & Model Configurator**

Reconfigure AI models and providers across OpenCode and Oh My OpenAgent configs with a menu-driven TUI, web UI, and AI-powered suggestions.

## Features

- 🎛️ **Three interfaces**: Simple TUI, rich dashboard TUI, and web UI
- 🤖 **AI Suggestions**: Ask local Ollama for the best model per agent/category
- 🎭 **Agent-aware**: Understands roles (orchestrator, architect, explorer, etc.)
- 📂 **Provider filtering**: Show/hide providers, grouped dropdowns
- 💾 **Snapshots**: Save and restore full config states
- 👤 **Model ownership**: Shows which config file owns each assignment (opencode.json vs oh-my-openagent.json, global vs project)
- 🔄 **Auto-reload signal**: Attempts to reload OpenCode after config changes
- ✅ **Change verification**: Confirms writes succeeded before finishing
- ⚠️ **Version-aware warnings**: Detects OmO version and warns about known bugs
- 📋 **Profiles**: Save, load, and apply named model assignment profiles
- 🔄 **JSONC-safe**: Preserves comments and formatting
- 🛡️ **Backups**: Automatic `.bak.YYYY-MM-DDTHH-mm-ss` before every write
- ⚡ **Zero config**: Auto-discovers configs in standard locations

## Install

```bash
bun add -g ocforge
```

Requires [Bun](https://bun.sh) ≥ 1.3 and `opencode` CLI in PATH.

## Usage

```bash
ocforge                  # Simple interactive TUI
ocforge --tui           # Rich dashboard TUI (3-pane layout)
ocforge --web           # Web UI at http://localhost:3456
ocforge --dry-run       # Show diff without writing
```

### Profiles

Save, apply, and manage named model assignment configurations:

```bash
ocforge profiles list                    # List all saved profiles
ocforge profiles save <name>             # Save current assignments as a profile
ocforge profiles save <name> -d "desc"   # Save with a description
ocforge profiles apply <name>            # Apply a profile (with verification + reload)
ocforge profiles rename <old> <new>      # Rename a profile
ocforge profiles delete <name>           # Delete a profile
```

Profiles store agent/category model assignments (including fallback_models). Applying a profile verifies the write and signals OpenCode to reload.

### Snapshots

Full config state backup and restore (via Web UI or TUI):

- Save snapshot of all configs
- Restore snapshot (with verification)

## Architecture

```
src/
├── index.ts              # OpenCode plugin entry
├── cli.ts                # Standalone CLI entry (commander)
├── types.ts              # Shared domain types
├── core/
│   ├── config-loader.ts  # Discover + parse JSONC configs
│   ├── model-registry.ts # Query opencode models, infer capabilities
│   ├── suggestion-engine.ts # Role-based model scoring
│   ├── jsonc-writer.ts   # AST-aware JSONC edits + backups
│   ├── diff-preview.ts   # Human-readable change summaries
│   ├── reload-signaler.ts # Post-write reload signal
│   ├── version-detector.ts # OmO version detection + bug awareness
│   ├── profile-manager.ts # Save/load model assignment profiles
│   ├── snapshot-manager.ts # Save/restore full config states
│   └── ollama-client.ts  # Local Ollama integration
├── tui/
│   └── engine.ts         # @clack/prompts interactive menus
└── web/
    ├── server.ts         # Fastify REST API
    └── ui/               # React + Vite frontend
```

| Module | Responsibility |
|--------|---------------|
| `config-loader` | Discover + parse JSONC configs with precedence handling |
| `model-registry` | Query opencode models, infer capabilities and price tier |
| `suggestion-engine` | Role-based model scoring and ranking |
| `jsonc-writer` | AST-aware JSONC edits with backup and verification |
| `diff-preview` | Human-readable change summaries |
| `reload-signaler` | Post-write reload signal (CLI, signal file, user prompt) |
| `version-detector` | OmO version detection and bug awareness |
| `profile-manager` | Save/load/apply model assignment profiles |
| `snapshot-manager` | Save/restore full config states |
| `ollama-client` | Local Ollama integration for AI suggestions |

### Config Precedence

Files are discovered in this order (later wins):

1. `~/.config/opencode/opencode.json`
2. `./opencode.json` (project level)
3. `~/.config/opencode/oh-my-openagent.jsonc` (or legacy `oh-my-opencode.jsonc`)
4. `./.opencode/oh-my-openagent.jsonc` (or legacy)

## Testing

```bash
bun test    # 42 tests passing (unit + integration)
```

## Known Issues

- **Config reload**: OpenCode reads configs once at startup. After ocforge applies changes, you may need to run `/reload` in OpenCode or restart it.
- **OmO hot_reload**: The `experimental.hot_reload: true` option in OmO doesn't reload all settings (disabled_hooks, existing session models).
- **Two config files**: `opencode.json` controls build/plan/architect agents, while `oh-my-openagent.json` controls sisyphus/explore/oracle. Changes to one file don't affect agents in the other.

## License

MIT
