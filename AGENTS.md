# AGENTS.md — ocforge

## Project Overview

**ocforge** is an OpenCode plugin and standalone CLI for reconfiguring AI models and providers across OpenCode and Oh My OpenAgent (OmO) configs. It provides a menu-driven TUI, a web UI, and smart model suggestions based on agent roles.

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
│   └── diff-preview.ts   # Human-readable change summaries
├── tui/
│   └── engine.ts         # @clack/prompts interactive menus
└── web/
    ├── server.ts         # Fastify REST API
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
- `kebab-case` for file and directory names
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
`ConfigLoader` discovers configs in this precedence:
1. `~/.config/opencode/opencode.json`
2. `./opencode.json`
3. `~/.config/opencode/oh-my-openagent.json[c]` (or legacy `oh-my-opencode.json[c]`)
4. `./.opencode/oh-my-openagent.json[c]` (or legacy)

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
