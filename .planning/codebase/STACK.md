# Technology Stack

**Analysis Date:** 2025-02-28

## Languages

**Primary:**
- **TypeScript** ~5.8.3 - Frontend codebase (React components, utilities, hooks)
- **Rust** 2021 edition - Backend (Tauri commands, system integration)

**Runtime Support:**
- **JavaScript** (ES2020+) - Transpiled from TypeScript via Vite

## Runtime

**Environment:**
- **Node.js** 22.x (specified in `.nvmrc`)
- **Tauri** 2.x - Cross-platform desktop framework (macOS primary target with Windows support)

**Package Manager:**
- **pnpm** - Workspaces and monorepo management
- **npm** - Used within projects managed by Ship Studio
- Lockfile: `pnpm-lock.yaml` present

## Frameworks

**Core UI:**
- **React** 19.1.0 - Component-based UI framework
- **React DOM** 19.1.0 - Browser rendering

**Desktop Framework:**
- **Tauri** 2.x - Native desktop application framework
  - Features enabled: `macos-private-api`, `protocol-asset`, `unstable`
  - macOS optimizations enabled via `NSString`, `objc2` for WebKit evaluation

**Terminal/UI Widgets:**
- **xterm.js** 6.0.0 - Terminal emulator for embedded Claude Code
  - `@xterm/addon-fit` 0.11.0 - Terminal resizing
  - `@xterm/addon-unicode11` 0.9.0 - Unicode support
- **Tauri PTY Plugin** 0.2.0 - Pseudo-terminal spawning for terminal sessions
- **OverlayScrollbars** 2.14.0 - Custom scrollbar styling
- **React Tooltip** 5.30.0 - Tooltip components

**Syntax Highlighting:**
- **Shiki** 3.22.0 - Code syntax highlighting with TextMate grammars

**GitHub Integration UI:**
- **React GitHub Calendar** 5.0.5 - GitHub contribution calendar display

## Key Dependencies

**Critical - System Integration:**
- **reqwest** 0.12 - HTTP client for PostHog analytics (Rust backend)
- **tokio** 1.x - Async runtime with multi-threaded executor
  - Features: `rt-multi-thread`, `time`, `macros`, `process`, `io-util`, `net`
- **tauri-plugin-shell** 2.x - Execute shell commands (git, gh, vercel CLIs)
- **tauri-plugin-opener** 2.x - Open files and URLs
- **tauri-plugin-fs** 2.x - File system operations
- **tauri-plugin-dialog** 2.x - Native file/folder dialogs

**Infrastructure:**
- **serde** 1.x + **serde_json** 1.x - JSON serialization for IPC
- **tracing** 0.1 + **tracing-subscriber** 0.3 - Structured logging to `~/Library/Logs/ShipStudio/`
- **tracing-appender** 0.2 - Log file writing
- **chrono** 0.4 - Date/time handling
- **uuid** 1.x - Device ID generation for analytics

**Terminal/PTY:**
- **tauri-pty** 0.2.0 - Native PTY management (xterm.js integration)
- **tauri-plugin-screenshots** 2.2.0 - Screenshot capture for project thumbnails

**Development Tools:**
- **Vite** 7.0.4 - Frontend build tool with hot module reload
- **@vitejs/plugin-react** 4.6.0 - React JSX transform
- **Vitest** 3.0.5 - Unit test runner (Vite-native)
- **@vitest/coverage-v8** 3.0.5 - Code coverage reporting

**Testing:**
- **@testing-library/react** 16.3.0 - Component testing utilities
- **@testing-library/jest-dom** 6.6.3 - DOM matchers
- **@testing-library/user-event** 14.6.1 - User interaction simulation
- **jsdom** 26.0.0 - DOM implementation for Node.js tests
- **@tauri-apps/api/mocks** - Official Tauri IPC mocking

**Linting & Formatting:**
- **ESLint** 9.39.2 (flat config via `eslint.config.js`)
  - **@eslint/js** - Base recommended config
  - **typescript-eslint** 8.54.0 - TypeScript-aware rules
  - **eslint-plugin-react** 7.37.5 - React-specific rules
  - **eslint-plugin-react-hooks** 7.0.1 - React hooks validation
  - **eslint-config-prettier** 10.1.8 - Disables conflicting style rules
- **Prettier** 3.8.1 - Code formatter
  - Config: 2-space tabs, single quotes, trailing commas, 100 char line width

**Development Utilities:**
- **husky** 9.1.7 - Git hooks manager
- **lint-staged** 16.2.7 - Run linters on staged files
- **@tauri-apps/cli** 2.x - Tauri build and dev server
- **Cargo** (Rust package manager) - Backend dependencies

## Configuration

**Environment:**
- **Development:** `.nvmrc` (Node 22.x)
- **Tauri Config:** `src-tauri/tauri.conf.json`
  - CSP: `null` (required for xterm.js dynamic styles)
  - App ID: `com.memberstack.shipstudio`
  - Asset protocol scope: `$HOME/ShipStudio/**`
  - Frontend dev server: `http://localhost:1420`
  - Build output: `dist/`

**Frontend Build:**
- Vite config: `vite.config.ts` (inferred from npm scripts)
- TypeScript config: `tsconfig.json` (strict mode enabled)

**Backend Build:**
- Cargo manifest: `src-tauri/Cargo.toml`
- Build target: Tauri-controlled multi-target (macOS ARM64/x86_64, Windows)

**Code Quality:**
- ESLint flat config: `eslint.config.js`
- Prettier config: `.prettierrc`

## Platform Requirements

**Development:**
- macOS 11+ or Windows 10+ (primary target macOS 12+)
- Rust toolchain (via `rustup`)
- Xcode Command Line Tools (macOS)
- Node.js 22.x (via nvm or direct install)
- pnpm for package management

**Production:**
- **macOS**: Universal binary (ARM64 + Intel x86_64), signed and notarized
  - Requires Apple Developer ID certificate
  - Notarization via App Store Connect API
- **Windows**: NSIS installer with auto-update support
- **Update mechanism**: Tauri updater checking `https://github.com/ship-studio/releases/releases/latest/download/latest.json`

**Runtime Dependencies (User Machine):**
- **git** CLI - Core version control
- **gh** (GitHub CLI) - GitHub integration
- **Node.js** - For running user projects
- **npm/yarn/pnpm** - Project package managers (detected and used)
- **Claude Code** or **Cursor** - AI agent support
- **Homebrew** (macOS) - Package installation
- **Vercel CLI** (optional) - Deployment features

---

*Stack analysis: 2025-02-28*
