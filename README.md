# 🔧 ocforge

**OpenCode Agent & Model Configurator**

Reconfigure AI models and providers across OpenCode and Oh My OpenAgent configs with a menu-driven TUI, web UI, and AI-powered suggestions.

## Features

- 🎛️ **Three interfaces**: Simple TUI, rich dashboard TUI, and web UI
- 🤖 **AI Suggestions**: Ask local Ollama for the best model per agent/category
- 🎭 **Agent-aware**: Understands roles (orchestrator, architect, explorer, etc.)
- 📂 **Provider filtering**: Show/hide providers, grouped dropdowns
- 💾 **Snapshots**: Save and restore config states
- 🔄 **JSONC-safe**: Preserves comments and formatting
- 🛡️ **Backups**: Automatic `.bak` before every write
- ⚡ **Zero config**: Auto-discovers configs in standard locations

## Install

```bash
bun add -g ocforge
```

Requires [Bun](https://bun.sh) ≥ 1.3 and `opencode` CLI in PATH.

## Usage

```bash
ocforge           # Simple interactive TUI
ocforge --tui     # Rich dashboard TUI (3-pane layout)
ocforge --web     # Web UI at http://localhost:3456
```

### Web UI

The web interface provides:
- Provider filter toggles
- Per-agent model selection with AI suggest
- Fallback model editor
- Snapshot save/load/delete
- Real-time pending changes with diff preview

### AI Suggestions

Install [Ollama](https://ollama.com) locally, pull a model (e.g. `ollama pull gemma3:4b`), and click **AI** on any agent or category. Ollama will suggest the best model based on the agent's role and available models.

## License

MIT
