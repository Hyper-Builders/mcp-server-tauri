# AGENTS.md

## Project Overview

MCP server for Tauri v2 application development. Provides tools for CLI execution, configuration management, mobile device/emulator management, native UI automation, and debugging.

**Monorepo packages:**

- `packages/mcp-server/` - Main MCP server implementation
- `packages/tauri-plugin-mcp-bridge/` - Tauri plugin for automation bridge (Rust)
- `packages/test-app/` - Test application for E2E testing

## Setup Commands

```bash
npm install              # Install all dependencies
npm run build            # Build all packages
npm test                 # Run tests (requires build first)
npm run standards        # Run commitlint + eslint
```

## Code Style

- **TypeScript**: Strict mode, ESM with `.js` extensions in imports, ES2022 target
- **Naming**: camelCase for functions/variables, PascalCase for classes, kebab-case for files
- **Acronyms**: All lowercase or all caps, never mixed (e.g., `url` or `URL`, never `Url`)
- **Avoid**: `any` type, magic numbers, deeply nested blocks
- **Prefer**: Early returns, higher-order functions, immutability (`readonly`, `as const`)
- **Functions**: Arrow for simple (<3 instructions), named otherwise; use RO-RO pattern
- **JSDoc**: Document public classes and methods

## Adding New MCP Tools

All tools are defined in `packages/mcp-server/src/tools-registry.ts`:

1. Add Zod schema + handler in the appropriate module (`manager/`, `driver/`, `monitor/`)
2. Import and add entry to `TOOLS` array in `tools-registry.ts`
3. Add E2E test in `packages/mcp-server/tests/e2e/`

Tool categories: `PROJECT_MANAGEMENT`, `MOBILE_DEVELOPMENT`, `UI_AUTOMATION`, `IPC_PLUGIN`

## Testing Instructions

- Always build before testing: `npm run build`
- E2E tests launch `test-app` and connect via WebSocket
- Tests located in `packages/mcp-server/tests/e2e/`
- Prefer E2E tests over unit tests
- CI timeout is 8 minutes; local is 1 minute

## Session Management

- Call `tauri_driver_session` with `action: 'start'` before using driver tools
- Always call with `action: 'stop'` to clean up
- WebSocket port range: 9223-9322

## Git Commits

Follow: https://raw.githubusercontent.com/silvermine/standardization/refs/heads/master/commitlint.js

## Rust Code

Run `cargo fmt` and `cargo clippy` after changes in `packages/tauri-plugin-mcp-bridge/`.

## NPM Dependencies

Always use `--save-exact` flag when installing.

## Key Files

- `packages/mcp-server/src/tools-registry.ts` - Single source of truth for all MCP tools
- `packages/mcp-server/src/index.ts` - MCP server entry point
- `packages/mcp-server/src/driver/session-manager.ts` - WebSocket session management
- `packages/tauri-plugin-mcp-bridge/src/lib.rs` - Plugin entry point and WebSocket server setup
- `specs/` - Architecture docs, release process, and design decisions
