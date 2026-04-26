# ocforge — OpenCode Agent & Model Configurator

**Date:** 2026-04-26  
**Status:** Design Approved  
**Author:** brainstorming session

---

## 1. Overview

`ocforge` is an OpenCode plugin and standalone CLI that lets users reconfigure AI models and providers for **OpenCode** and **Oh My OpenAgent (OmO / oh-my-opencode)** without memorizing agent names, model IDs, or provider strings.

It provides a **menu-driven TUI** experience for picking models from a curated list, and a **smart suggestion engine** that recommends the best model for each agent/category when new providers or models become available.

### Modes of Operation

| Mode | Trigger | Description |
|------|---------|-------------|
| **OpenCode Plugin** | `/config-models` command inside OpenCode chat | Launches interactive TUI inside the terminal |
| **CLI Standalone** | `ocforge` from any terminal | Same TUI, but works outside OpenCode |
| **Web UI** | `ocforge --web` | Spins up a local React UI at `localhost:3456` |

---

## 2. Goals

1. **Zero-memorization config**: Users navigate menus to pick agents, fields, and models — no need to remember `anthropic/claude-opus-4-7`.
2. **Unified config surface**: Single tool edits both `opencode.json` and `oh-my-openagent.json[c]`.
3. **Smart suggestions**: When new models are detected, suggest the best match per agent/category based on capabilities, role, and price tier.
4. **Safe edits**: Always show a diff preview before writing. Backup the original file. Preserve JSONC comments and formatting.
5. **Dual runtime**: Works as an OpenCode plugin *and* as a standalone CLI.

---

## 3. Non-Goals

- Not a general OpenCode config editor (e.g., won't edit themes, keybinds, or MCP servers).
- Not a model marketplace or downloader — it only configures references to models already available via installed providers.
- Not a cloud service — everything runs locally.

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ocforge                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │  Plugin     │    │  CLI        │    │  Web Server         │ │
│  │  Entry      │    │  Entry      │    │  (--web)            │ │
│  │  (OpenCode  │    │  (Node/Bun) │    │  Vite + React       │ │
│  │   hook)     │    │             │    │  localhost:3456     │ │
│  └──────┬──────┘    └──────┬──────┘    └──────────┬──────────┘ │
│         │                  │                       │            │
│         └──────────────────┼───────────────────────┘            │
│                            │                                    │
│                   ┌────────▼────────┐                          │
│                   │   Core Engine   │                          │
│                   │   (shared)      │                          │
│                   └────────┬────────┘                          │
│                            │                                    │
│         ┌──────────────────┼──────────────────┐                │
│         ▼                  ▼                  ▼                │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────────┐       │
│  │ ConfigLoader│   │ ModelRegistry│   │ Suggestion    │       │
│  │             │   │              │   │ Engine        │       │
│  └─────────────┘   └──────────────┘   └───────────────┘       │
│         │                  │                  │                │
│         └──────────────────┼──────────────────┘                │
│                            ▼                                   │
│                   ┌─────────────┐                              │
│                   │ JSONCWriter │                              │
│                   │ + Diff      │                              │
│                   └─────────────┘                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Core Modules

| Module | Responsibility |
|--------|---------------|
| `ConfigLoader` | Discovers, reads, and parses `opencode.json` and `oh-my-openagent.json[c]` at global and project levels. Handles precedence rules. |
| `ModelRegistry` | Lists available models: queries `opencode models`, reads configured providers, maintains a local cache at `~/.cache/ocforge/models.json`. |
| `SuggestionEngine` | Recommends models per agent/category based on role, capabilities (multimodal, reasoning, thinking), context window, and price tier. |
| `TUIEngine` | Interactive terminal UI via `@clack/prompts` with hierarchical menus. |
| `DiffPreview` | Generates human-readable diff of proposed config changes. |
| `JSONCWriter` | Applies changes while preserving JSONC comments, trailing commas, and formatting. Uses `jsonc-parser` for AST-aware edits. |
| `WebServer` | Fastify/Express + Vite dev server that exposes REST endpoints for the web UI. |

---

## 5. Data Flow

### 5.1 Discovery Phase

1. `ConfigLoader` scans for config files in this order:
   - `~/.config/opencode/opencode.json`
   - `./opencode.json`
   - `~/.config/opencode/oh-my-openagent.json[c]` (or legacy `oh-my-opencode.json[c]`)
   - `./.opencode/oh-my-openagent.json[c]` (or legacy)
2. `ModelRegistry` builds the model catalog:
   - Runs `opencode models` to get available models.
   - Extracts provider list from `opencode.json`'s `provider` and `disabled_providers`/`enabled_providers`.
   - Reads cached model metadata (capabilities, max tokens, etc.) from `~/.cache/ocforge/models.json`.
3. `SuggestionEngine` pre-computes scores for every (agent, model) and (category, model) pair.

### 5.2 Interaction Phase (TUI)

```
Main Menu
├── 📁 OpenCode Config
│   ├── model: [current] → select from ModelRegistry
│   ├── small_model: [current] → select from ModelRegistry
│   └── provider settings (view-only for now)
├── 📁 Oh My OpenAgent
│   ├── 🎭 Agents
│   │   └── Select agent → Select field (model / variant / fallback_models / temperature / ...)
│   └── 📂 Categories
│       └── Select category → Select field
└── 🧠 Smart Update
    └── "Detect new models → Suggest updates → Apply selected"
```

For **fallback_models**, the UI allows:
- Adding a new fallback model (from ModelRegistry)
- Reordering (move up/down)
- Removing
- Editing per-model settings (variant, temperature, thinking, etc.)

### 5.3 Apply Phase

1. User confirms changes.
2. `DiffPreview` shows:
   - Which files will be modified.
   - Which agents/categories change and from→to model.
   - Number of additions/removals.
3. `JSONCWriter`:
   - Creates a timestamped backup: `<file>.bak.20260426-120000`.
   - Applies AST-aware edits to the target JSONC file.
   - Preserves comments, trailing commas, and indentation.
4. `ModelRegistry` refreshes its cache if new providers were added.

---

## 6. Smart Suggestions

When `ModelRegistry` detects a model it hasn't seen before (or the user explicitly runs **Smart Update**), `SuggestionEngine` computes recommendations:

### 6.1 Scoring Dimensions

| Dimension | Weight | How it's computed |
|-----------|--------|-------------------|
| **Role Match** | High | Orchestrator agents (Sisyphus, Prometheus) → highest capability. Explorer (Explore, Librarian) → fast/cheap. |
| **Capability Match** | High | If current model uses `thinking`, only suggest models that support thinking. If agent uses vision → multimodal. |
| **Variant Mapping** | Medium | Map `max`/`high`/`medium` of old model to closest equivalent in new model family. |
| **Price Tier** | Medium | Infer from name (nano < mini < flash < sonnet < opus). Prefer same tier or one step up/down. |
| **Provider Diversity** | Low | If an agent already uses Provider A, suggest Provider B for resilience (optional toggle). |

### 6.2 Example Output

```
🧠 Smart Update Results

New models detected: openai/gpt-5.5, google/gemini-3.5-pro

Suggested changes:
┌─────────────────┬──────────────────────────┬──────────────────────┬──────────┐
│ Agent/Category  │ Current                  │ Suggested            │ Reason   │
├─────────────────┼──────────────────────────┼──────────────────────┼──────────┤
│ sisyphus        │ anthropic/claude-opus-4-7│ openai/gpt-5.5       │ Top-tier │
│ oracle          │ openai/gpt-5.4           │ openai/gpt-5.5       │ Upgrade  │
│ explore         │ openai/gpt-5.4-mini-fast │ google/gemini-3-flash│ Cheaper  │
│ quick (cat)     │ opencode/gpt-5-nano      │ (no change)          │ Best fit │
└─────────────────┴──────────────────────────┴──────────────────────┴──────────┘
```

---

## 7. File Format Support

| Feature | Strategy |
|---------|----------|
| **JSONC** | Full support via `jsonc-parser` (parse → edit AST → print). |
| **Comments** | Preserved exactly as-is. |
| **Trailing commas** | Preserved. |
| **Multiple config files** | User selects which file to edit; defaults to project-level if exists, otherwise global. |
| **Legacy OmO names** | Recognizes both `oh-my-opencode.json[c]` and `oh-my-openagent.json[c]`. Prefers the newer name when writing. |

---

## 8. Plugin Integration (OpenCode)

### 8.1 Plugin Entry

```ts
import type { Plugin } from "@opencode-ai/plugin"

export const OcForgePlugin: Plugin = async (ctx) => {
  return {
    "tui.command.execute": async (input, output) => {
      if (input.command === "config-models") {
        // Launch TUI subprocess or inline interactive session
        await launchOcForgeTUI(ctx)
        output.handled = true
      }
    },
  }
}
```

### 8.2 Command Registration

The plugin registers the `/config-models` slash command that appears in the OpenCode TUI command palette.

### 8.3 Standalone CLI

When installed globally (`bun add -g ocforge`), the `ocforge` binary runs the same Core Engine + TUIEngine without the OpenCode context.

```bash
ocforge                    # Launch TUI
ocforge --web              # Launch web UI at localhost:3456
ocforge --config ./custom  # Use custom config directory
ocforge --backup           # Force backup before any write
```

---

## 9. Web UI (`--web`)

### 9.1 Tech Stack

- **Backend:** Fastify (lightweight, bun-compatible) serving a REST API.
- **Frontend:** React + Tailwind (or plain CSS) bundled with Vite.
- **Communication:** WebSocket or Server-Sent Events for live model registry updates.

### 9.2 Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/configs` | List discovered config files with current contents |
| GET | `/api/models` | List available models from ModelRegistry |
| GET | `/api/suggestions` | Get Smart Update suggestions |
| POST | `/api/preview` | Post proposed changes, receive diff preview |
| POST | `/api/apply` | Apply changes to a specific config file |

### 9.3 UI Layout

- **Sidebar:** Tree view of configs → Agents / Categories.
- **Main Panel:** Cards for each agent showing current model, dropdown selector, and "suggested" badge.
- **Diff Drawer:** Slide-out panel showing changes before apply.
- **Toolbar:** "Smart Update" button, "Backup & Apply" button.

---

## 10. Error Handling

| Scenario | Behavior |
|----------|----------|
| JSONC parse error | Show file path + line/column. Offer to create a backup and open the file for manual repair. Abort by default. |
| Model not available | If a configured model doesn't appear in `opencode models`, show a warning icon but still allow it (it may be from a new provider not yet refreshed). |
| No write permissions | Show exact path, suggest `chmod` or running with elevated permissions. Abort. |
| OmO not installed | Detect absence of `oh-my-openagent.json[c]`. Hide OmO section or offer to scaffold a starter config. |
| Concurrent file modification | Before writing, compare on-disk content with what was read at discovery. If changed, show diff and ask user to reconcile. |
| TUI interrupted (Ctrl+C) | Graceful exit without writing anything. |

---

## 11. Caching & Performance

- **Model cache:** `~/.cache/ocforge/models.json` refreshed on demand or if older than 1 hour.
- **Suggestion cache:** Recomputed only when ModelRegistry changes.
- **Config watch:** Optional file watcher to auto-reload if external editor modifies configs while TUI is open (web mode only).

---

## 12. Testing Strategy

| Layer | Approach |
|-------|----------|
| **Unit** | `SuggestionEngine` with mocked model capability fixtures. `ConfigLoader` with temp fixture files. `JSONCWriter` round-trip tests. |
| **Integration** | Run `ocforge` CLI against a temp directory with fixture configs, verify file contents after TUI simulation (using stdin injection). |
| **Plugin** | Mock OpenCode plugin context, assert that `/config-models` triggers `launchOcForgeTUI`. |
| **Web** | Playwright tests against `ocforge --web` for critical paths (load → change model → preview → apply). |

---

## 13. Security & Safety

- Never sends API keys or config contents over the network.
- Web UI binds to `localhost` only by default.
- All file writes require explicit user confirmation (except via web UI where the diff preview serves as confirmation).
- Backups are created before every write.

---

## 14. Future Extensions (Out of Scope for V1)

- Agent creation wizard (add new custom agents to OmO).
- Provider setup wizard (configure new provider API keys via `/connect` or manual entry).
- Sync configs across machines via Git or cloud storage.
- Integration with `opencode models --json` for richer model metadata (pricing, latency).
- Plugin marketplace to discover community agent presets.

---

## 15. Package Structure

```
ocforge/
├── package.json
├── src/
│   ├── index.ts              # OpenCode plugin entry
│   ├── cli.ts                # Standalone CLI entry
│   ├── web/
│   │   ├── server.ts         # Fastify backend
│   │   └── ui/               # React frontend (Vite)
│   ├── core/
│   │   ├── config-loader.ts
│   │   ├── model-registry.ts
│   │   ├── suggestion-engine.ts
│   │   ├── jsonc-writer.ts
│   │   └── diff-preview.ts
│   ├── tui/
│   │   └── engine.ts         # @clack/prompts menus
│   └── types.ts
├── tests/
│   ├── fixtures/
│   └── *.test.ts
└── README.md
```

---

## 16. Dependencies

| Package | Purpose |
|---------|---------|
| `@clack/prompts` | Interactive TUI menus |
| `jsonc-parser` | AST-aware JSONC parsing and editing |
| `commander` | CLI argument parsing |
| `fastify` | Web UI backend |
| `react` / `vite` | Web UI frontend |
| `@opencode-ai/plugin` | Plugin types (peer dependency) |

---

## 17. Success Criteria

1. A user can run `/config-models` in OpenCode and change the model of `sisyphus` without typing the model ID.
2. A user can run `ocforge --web`, open the browser, and change a category model with a dropdown.
3. When a new model appears in `opencode models`, Smart Update suggests at least 3 meaningful changes.
4. All changes preserve JSONC comments and create backups.
5. The tool works on macOS, Linux, and Windows (where OpenCode/Bun runs).
