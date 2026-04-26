# AGENTS.md — ocforge

## Project Overview

**ocforge** is an OpenCode plugin and standalone CLI for reconfiguring AI models and providers across OpenCode and Oh My OpenAgent (OmO) configs. It provides a menu-driven TUI, a web UI, and smart model suggestions based on agent roles.

## Architecture

```
src/
├── index.ts              # OpenCode plugin entry
├── cli.ts                # Standalone CLI entry (commander)
├── types.ts              # Shared domain types (includes ModelOwnership, OwnedModel, ReloadResult)
├── core/
│   ├── config-loader.ts  # Discover + parse JSONC configs (DiscoverOptions, discoverModelOwners, fixed precedence)
│   ├── model-registry.ts # Query opencode models, infer capabilities
│   ├── suggestion-engine.ts # Role-based model scoring
│   ├── jsonc-writer.ts   # AST-aware JSONC edits + backups + verification (verifyChanges)
│   ├── diff-preview.ts   # Human-readable change summaries
│   ├── reload-signaler.ts # Post-write reload signal (opencode reload CLI, signal file, user prompt)
│   ├── version-detector.ts # OmO version detection and bug awareness (#1573)
│   ├── profile-manager.ts # Save/load/apply profiles of model assignments (with verification + reload)
│   ├── snapshot-manager.ts # Save/restore full config states
│   └── ollama-client.ts    # Ollama integration for AI suggestions
├── tui/
│   └── engine.ts         # @clack/prompts interactive menus (shows ownership + version warnings + reload)
└── web/
    ├── server.ts         # Fastify REST API (with /api/reload, verification in /api/apply)
    └── ui/               # React + Vite frontend

tests/
├── core/                 # Unit tests per core module
├── integration.test.ts   # End-to-end pipeline test
└── fixtures/             # Sample JSONC configs
```

## Tech Stack

- **Runtime:** Bun (only — never npm/yarn)
- **Language:** TypeScript, strict mode, ESNext, bundler moduleResolution
- **JSONC:** `jsonc-parser` for AST-aware parsing and editing
- **TUI:** `@clack/prompts`
- **Web:** Fastify backend + React/Vite frontend
- **CLI:** `commander`
- **Tests:** `bun:test` (co-located `*.test.ts`)

## Conventions

### File Organization
- One file = one clear responsibility
- No catch-all files (`utils.ts`, `helpers.ts`, `service.ts`)
- Barrel exports (`index.ts`) for module boundaries
- Co-located tests: `foo.ts` + `foo.test.ts`

### Code Style
- `camelCase` for variables/functions
- `PascalCase` for classes/interfaces
- Prefer explicit types over `any`
- Never suppress TypeScript errors (`@ts-ignore`, `@ts-expect-error`)

### Imports
- Relative imports within module
- Barrel imports across modules
- No path aliases (`@/`) — relative only

### Error Handling
- TUI: Wrap subprocess calls in `try/catch`, show friendly messages via `outro()`
- File writes: Detect concurrent modification in `JSONCWriter`
- Always create backups before writes
- Never swallow errors silently

## Testing

```bash
bun test              # Run all tests
bun test <path>       # Run specific test file
bun run typecheck     # tsc --noEmit
```

### Test Patterns
- Mock external dependencies (subprocess, filesystem) when testing logic
- Integration test uses real temp files to validate full pipeline
- TUI/Web tests are placeholders — tested manually

## Key Interfaces

### Config Discovery
`ConfigLoader` discovers configs in this precedence (highest first per directory level):
1. `~/.config/opencode/opencode.json`
2. `./opencode.json`
3. `~/.config/opencode/oh-my-openagent.json[c]` (or legacy `oh-my-opencode.json[c]`)
4. `./.opencode/oh-my-openagent.json[c]` (or legacy)

Legacy `oh-my-opencode.*` files are listed **first** per directory level (index 0 = highest precedence), matching OmO's documented behavior. Deduplication with `break` keeps only the highest-precedence file per level.

#### DiscoverOptions
`ConfigLoader` accepts an options object instead of a plain `cwd` string:
```typescript
interface DiscoverOptions {
  cwd?: string;       // Working directory for local config search
  globalDir?: string; // Override for ~/.config/opencode (useful in tests)
}
```

#### Model Ownership Discovery
`discoverModelOwners(options?)` returns `OwnedModel[]` showing which config file owns each model assignment. Used by TUI to display ownership badges.

### Model Registry
- Runs `opencode models` to get available models
- Infers capabilities (`multimodal`, `thinking`, `reasoning`) and `priceTier` from model ID
- Caches results for 60s in web mode

### Smart Suggestions
The `SuggestionEngine` scores models per agent/category using:
- **Role:** orchestrator → top-tier; fast → cheap models
- **Capabilities:** thinking, reasoning, multimodal matching
- **Price tier:** nano < mini < flash < sonnet < opus
- **Provider diversity:** optional cross-provider resilience

### JSONC Writing
- Uses `jsonc-parser`'s `modify()` + `applyEdits()`
- Preserves comments, trailing commas, formatting
- Creates `.bak.YYYY-MM-DDTHH-mm-ss` backups
- Detects concurrent modification via re-read before write
- `verifyChanges(filePath, changes)`: re-reads file after write and validates values match. Returns `boolean`.

### Profile Management
`ProfileManager` saves/loads/appies named profiles of model assignments:
- `saveProfile(name, changes)`: persists a named profile
- `loadProfile(name)`: retrieves a profile
- `applyProfile(profile)`: applies changes from a profile (with `verifyChanges` + `signalReload`)
- Returns `{ applied: boolean; verified: boolean }`

### Reload Signaling
After applying changes, `ReloadSignaler.signalReload()` ensures OpenCode picks up the new config:
1. Tries `opencode reload` CLI command
2. Falls back to writing `~/.config/opencode/.reload-requested` signal file
3. Falls back to prompting user to restart

`formatReloadMessage()` provides user-facing output for TUI.

### Version Detection
`VersionDetector` detects OmO version and known bugs:
- `detectOmOVersion()`: returns version string or `unknown`
- `hasBug1573Fix()`: checks if OmO has the `uiSelectedModel` cache bug fix (conservatively returns `false`)
- `formatVersionWarning()`: returns warning message for TUI when bug is present

### Ollama Integration
`OllamaClient` queries local Ollama for AI-powered model suggestions:
- `askForSuggestion(agentRole, availableModels)`: returns suggested model ID
- Falls back gracefully when Ollama is unavailable

### Snapshot Management
`SnapshotManager` saves and restores full config states:
- `saveSnapshot(name)`: captures current state of all discovered configs
- `listSnapshots()`: returns saved snapshot names with timestamps
- `restoreSnapshot(name)`: applies a saved snapshot (with verification + reload)

## Known Config Propagation Issues

OpenCode and OmO have known issues where config changes may not take effect immediately:

| Issue | Description | Status |
|-------|-------------|--------|
| Startup cache | OpenCode reads config once at startup | Must `/reload` or restart |
| Hot reload limitations | OmO `experimental.hot_reload: true` doesn't reload `disabled_hooks`; existing sessions keep stale models | Known limitation |
| Precedence bug #472 | `builtinAgents` can override user config | Partially fixed |
| Model format bug #641 | Runtime passes string where SDK expects object | Unfixed |
| Cache bug #1573 | `uiSelectedModel` overriding `userModel` | Fixed Feb 2026, PR #1578 |
| Dual config files | `opencode.json` + `oh-my-openagent.json` separate; changes to one don't affect agents in the other | By design |

## When Adding Features

### Adding a new core module
1. Create `src/core/<name>.ts`
2. Create `tests/core/<name>.test.ts` with TDD
3. Export from `src/core/` (add to barrel if one exists)
4. Update `src/tui/engine.ts` if TUI needs it
5. Update `src/web/server.ts` if API needs it

### Adding a new CLI option
1. Add to `src/cli.ts` via `commander`
2. Pass through to `runTUI()` or `startWebServer()`
3. Document in README and `--help`

### Adding a new web endpoint
1. Add route in `src/web/server.ts`
2. Wire React component in `src/web/ui/App.tsx`
3. Keep frontend state minimal — server is source of truth

## Dependencies

See `package.json` for full list. Key ones:
- `jsonc-parser` — never substitute; this is the only JSONC parser we use
- `@clack/prompts` — for TUI only; don't use for non-interactive flows
- `fastify` — web server; keep routes RESTful
- `commander` — CLI parsing

## Environment

- Requires Bun >= 1.3
- Requires `opencode` CLI in PATH for model discovery
- Optional: `@opencode-ai/plugin` types (peer dependency)
- Web UI binds to `127.0.0.1` only

## Notes

- The TUI is **interactive** — it can't be used in non-TTY environments. Use `--web` or the OpenCode plugin instead.
- The plugin entry (`src/index.ts`) is minimal — it just bridges OpenCode's `tui.command.execute` hook to `runTUI()`.
- Web UI model cache is in-memory only (no filesystem cache yet).
- All file paths are resolved via `path.resolve()` — works cross-platform.
