# Product Requirements Document: ocforge

**Version:** 1.0  
**Date:** 2026-04-26  
**Status:** Shipped  
**Author:** AI-assisted development  

---

## 1. Overview

**ocforge** is a developer tool that eliminates the friction of reconfiguring AI model assignments for OpenCode and Oh My OpenAgent (OmO). Instead of manually editing JSONC config files and memorizing model IDs like `anthropic/claude-opus-4-7`, developers use an interactive menu-driven interface to browse, select, and apply model changes safely.

When new providers or models become available, ocforge's **Smart Suggestion Engine** recommends the best model for each agent or category based on role, capabilities, and price tier — so developers stay current without research overhead.

---

## 2. Problem Statement

Configuring AI agents in OpenCode and OmO requires:
- Memorizing 11+ agent names and 8+ category names
- Knowing exact model IDs (`provider/model-id` format)
- Editing JSONC files by hand across multiple config locations (`~/.config/opencode/`, `.opencode/`)
- Manually updating fallback model chains when new models release
- Risking syntax errors or losing JSONC comments during edits

This friction discourages experimentation with new models and increases the time to adopt better/cheaper providers.

---

## 3. Goals

1. **Zero-memorization configuration** — navigate menus to pick agents, fields, and models
2. **Unified config surface** — edit both `opencode.json` and `oh-my-openagent.json[c]` from one tool
3. **Smart model recommendations** — suggest best matches when new models are available
4. **Safe edits** — always preview changes, backup originals, preserve JSONC comments
5. **Multiple interfaces** — work inside OpenCode, from the terminal, or via browser

---

## 4. Non-Goals

- Not a general OpenCode config editor (themes, keybinds, MCP servers out of scope)
- Not a model marketplace or downloader — only configures references to existing models
- Not a cloud service — everything runs locally

---

## 5. User Personas

### Persona A: The Model Hopper
**Alex** switches between providers frequently (free tiers, new releases, regional availability). Alex wants to reassign all agents to a new provider in under 2 minutes without opening a text editor.

### Persona B: The Optimizer
**Blake** wants to reduce API costs. Blake uses Smart Update to discover cheaper models that still match each agent's capability needs, with confidence scores to decide.

### Persona C: The Visual Configurator
**Casey** prefers GUIs. Casey runs `ocforge --web` and uses dropdown selectors in the browser to change models, seeing pending changes in a diff panel before applying.

---

## 6. Features

### 6.1 Menu-Driven TUI
- **Browse & Edit**: Navigate hierarchically — Config File → Agent/Category → Field → Model dropdown
- **Smart Update**: One-shot "detect new models → score → suggest → apply selected"
- **Diff Preview**: Every change shows `old → new` before write
- **Safe Apply**: Requires explicit confirmation; creates `.bak.YYYY-MM-DDTHH-mm-ss` backups

### 6.2 Smart Suggestion Engine
| Dimension | How it decides |
|-----------|----------------|
| **Role Match** | Orchestrator agents → highest capability; Explorer → fast/cheap |
| **Capability Match** | If current model uses `thinking`, only suggest thinking-capable replacements |
| **Variant Mapping** | Maps `max`/`high`/`medium` to closest equivalent in new model family |
| **Price Tier** | Infers from name: nano < mini < flash < sonnet < opus |
| **Provider Diversity** | Optional: suggest different providers for resilience |

### 6.3 JSONC-Safe Editing
- Preserves comments (`//`, `/* */`)
- Preserves trailing commas
- Maintains indentation and formatting
- Uses `jsonc-parser` AST-aware `modify()` + `applyEdits()`

### 6.4 Web UI (`ocforge --web`)
- Fastify backend with REST API (`/api/configs`, `/api/models`, `/api/suggestions`, `/api/apply`)
- React frontend with editable dropdowns per agent/category
- Pending changes panel with Apply button
- Success/error toast notifications

### 6.5 OpenCode Plugin
- Registers `/config-models` slash command
- Hooks into `tui.command.execute` event
- Runs same TUI engine within OpenCode's terminal context

---

## 7. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        ocforge                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐│
│  │  Plugin     │    │  CLI        │    │  Web Server     ││
│  │  (OpenCode) │    │  (terminal) │    │  (--web)        ││
│  └──────┬──────┘    └──────┬──────┘    └────────┬────────┘│
│         │                  │                     │         │
│         └──────────────────┼─────────────────────┘         │
│                            │                               │
│                   ┌────────▼────────┐                      │
│                   │   Core Engine   │                      │
│                   │   (shared)      │                      │
│                   └────────┬────────┘                      │
│                            │                               │
│         ┌──────────────────┼──────────────────┐            │
│         ▼                  ▼                  ▼            │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────────┐  │
│  │ ConfigLoader│   │ ModelRegistry│   │ Suggestion    │  │
│  │             │   │              │   │ Engine        │  │
│  └─────────────┘   └──────────────┘   └───────────────┘  │
│         │                  │                  │            │
│         └──────────────────┼──────────────────┘            │
│                            ▼                               │
│                   ┌─────────────┐                          │
│                   │ JSONCWriter │                          │
│                   │ + Diff      │                          │
│                   └─────────────┘                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Core Modules

| Module | Responsibility |
|--------|---------------|
| `ConfigLoader` | Discovers configs at global + project levels; parses JSONC |
| `ModelRegistry` | Lists available models via `opencode models`; infers capabilities & price tier |
| `SuggestionEngine` | Recommends models per agent/category based on role scoring |
| `JSONCWriter` | AST-aware edits with concurrent-modification detection & backups |
| `DiffPreview` | Human-readable change summaries |
| `TUIEngine` | `@clack/prompts` interactive menus |
| `WebServer` | Fastify REST API serving React frontend |

---

## 8. Data Flow

### Discovery
1. `ConfigLoader` scans `~/.config/opencode/` and `./.opencode/` for `opencode.json`, `oh-my-openagent.json[c]`, and legacy `oh-my-opencode.json[c]`
2. `ModelRegistry` runs `opencode models`, parses output into structured `ModelInfo[]`
3. `SuggestionEngine` pre-computes (agent, model) scores

### Interaction (TUI)
```
Main Menu
├── 📁 Browse & edit configs
│   ├── Select config file
│   ├── Select agent/category (OmO) or field (OpenCode)
│   └── Select model from dropdown
└── 🧠 Smart Update
    └── Select from suggested upgrades → Preview → Confirm
```

### Apply
1. `DiffPreview` generates human-readable summary
2. `JSONCWriter`:
   - Creates timestamped backup
   - Re-reads file to detect concurrent modification
   - Applies AST-aware edits
3. Success confirmation

---

## 9. Configuration Support

| Feature | Strategy |
|---------|----------|
| JSONC | Full support via `jsonc-parser` |
| Comments | Preserved exactly |
| Trailing commas | Preserved |
| Multiple config files | User selects target; defaults to project-level |
| Legacy OmO names | Recognizes both `oh-my-opencode` and `oh-my-openagent` |
| Precedence | Global configs discovered alongside project configs |

---

## 10. CLI Interface

```bash
ocforge                    # Launch interactive TUI
ocforge --web              # Launch web UI at localhost:3456
ocforge --config ./myproj  # Use custom config directory
ocforge --dry-run          # Show diff without writing
ocforge --help             # Show usage
```

---

## 11. Plugin Interface

Add to `opencode.json`:
```json
{
  "plugin": ["ocforge"]
}
```

Then run `/config-models` inside OpenCode.

---

## 12. Web UI Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/configs` | Discovered configs with contents |
| GET | `/api/models` | Cached available models (60s TTL) |
| GET | `/api/suggestions` | Smart Update suggestions |
| POST | `/api/preview` | Post changes, receive diff |
| POST | `/api/apply` | Apply changes to files |

---

## 13. Error Handling

| Scenario | Behavior |
|----------|----------|
| `opencode models` fails | TUI shows friendly error, suggests checking PATH |
| JSONC parse error | Shows line/column, offers backup + abort |
| Concurrent file modification | `JSONCWriter` detects and throws before write |
| No write permissions | Shows path, suggests elevated permissions |
| OmO not installed | Hides OmO section or offers scaffold |
| TUI interrupted (Ctrl+C) | Graceful exit, no writes |
| Web fetch fails | UI shows error state instead of infinite loading |

---

## 14. Testing

| Layer | Count | Coverage |
|-------|-------|----------|
| Unit tests | 13 | ConfigLoader, ModelRegistry, SuggestionEngine, JSONCWriter, DiffPreview |
| Integration test | 1 | Full pipeline: discover → suggest → diff → apply |
| TUI/Web tests | 2 | Placeholder (interactive, tested manually) |
| **Total** | **14 tests** | **All passing** |

---

## 15. Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Bun |
| Language | TypeScript |
| JSONC parsing | `jsonc-parser` |
| TUI | `@clack/prompts` |
| CLI args | `commander` |
| Web server | `fastify` |
| Web frontend | React + Vite |
| Plugin types | `@opencode-ai/plugin` (peer dependency, optional) |

---

## 16. Success Criteria

- [x] User can run `/config-models` in OpenCode and change a model without typing the ID
- [x] User can run `ocforge --web` and edit models via dropdowns
- [x] Smart Update suggests meaningful changes when new models are available
- [x] All changes preserve JSONC comments and create backups
- [x] Tool works on macOS, Linux, and Windows (where Bun/OpenCode run)

---

## 17. Future Roadmap

| Feature | Priority | Notes |
|---------|----------|-------|
| Fallback model editor | High | Reorder, add, remove fallback chains |
| Provider setup wizard | Medium | Configure new provider API keys |
| Model capability cache | Medium | Refresh from `models.dev` API |
| Config sync across machines | Low | Git-based or cloud storage |
| Plugin marketplace | Low | Community agent presets |
| Agent creation wizard | Low | Add new custom agents to OmO |

---

## 18. Changelog

### v0.1.0 — 2026-04-26
- Initial release
- TUI with Browse & Smart Update modes
- Web UI with editable dropdowns
- Smart Suggestion Engine with role-based scoring
- JSONC-safe edits with backups
- OpenCode plugin integration
- `--dry-run` CLI flag
- Concurrent modification detection
