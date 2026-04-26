# 🔧 ocforge

OpenCode Agent & Model Configurator

## Install

```bash
bun add -g ocforge
```

## Usage

### CLI (TUI)

```bash
ocforge                    # Launch interactive TUI
ocforge --web              # Launch web UI at http://localhost:3456
```

### OpenCode Plugin

Add to your `opencode.json`:

```json
{
  "plugin": ["ocforge"]
}
```

Then run `/config-models` inside OpenCode.

## Features

- 📁 Browse and edit OpenCode and Oh My OpenAgent configs
- 🧠 Smart model suggestions based on agent roles
- 💾 JSONC-safe edits (preserves comments and formatting)
- 🔄 Automatic backups before every change
- 🌐 Optional web UI for visual configuration

## License

MIT
