# Codebase Structure

**Analysis Date:** 2025-02-28

## Directory Layout

```
shipstudio/
├── src/                          # React/TypeScript frontend
│   ├── components/               # React UI components
│   │   ├── CompactMode/          # Compact terminal UI mode
│   │   ├── icons/                # SVG icon components
│   │   ├── setup/                # Onboarding wizard screens
│   │   └── *.tsx                 # Top-level workspace components
│   ├── hooks/                    # Custom React hooks for state
│   ├── lib/                      # Tauri IPC wrappers & utilities
│   ├── contexts/                 # React context providers
│   ├── styles/                   # CSS files (one per component)
│   ├── test/                     # Test setup & fixtures
│   ├── main.tsx                  # React app entry point
│   ├── App.tsx                   # Root component & state orchestration
│   └── vite-env.d.ts             # Vite type declarations
│
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── commands/             # Tauri command handlers (domain organized)
│   │   │   ├── git/              # Git operations (branches, status, stash, sync)
│   │   │   ├── projects/         # Project CRUD & metadata
│   │   │   ├── setup/            # Onboarding & prerequisite checks
│   │   │   ├── ide/              # IDE launcher, webview, screenshots
│   │   │   ├── plugins/          # Plugin system management
│   │   │   ├── *.rs              # Single-file domains (ai, github, publishing, pty, etc.)
│   │   ├── lib.rs                # Tauri builder, command registration, window event handlers
│   │   ├── state.rs              # Global state (open windows, reserved ports)
│   │   ├── agent.rs              # Agent (Claude/Codex) detection & caching
│   │   ├── cache.rs              # TTL-based operation caching
│   │   ├── types.rs              # Shared data types for IPC
│   │   ├── utils.rs              # Helper functions (path validation, CLI runners)
│   │   ├── logging.rs            # Structured logging setup
│   │   ├── static_server.rs       # File serving for dev server
│   │   └── proxy/                # Preview proxy forwarding
│   ├── tauri.conf.json           # Tauri app config
│   ├── Cargo.toml                # Rust dependencies
│   └── icons/                    # App icons for bundling
│
├── public/                       # Static assets (copied to bundle)
│   ├── fonts/                    # Custom fonts for terminal
│   └── sounds/                   # Audio files (notification sounds)
│
├── packages/                     # Shared packages
│   └── plugin-sdk/               # Plugin development SDK
│
├── test-plugins/                 # Test plugin implementations
│   └── hello-world/              # Example plugin
│
├── .planning/codebase/           # GSD documents (generated)
├── .github/workflows/            # CI/CD pipelines
├── .husky/                       # Git hooks (pre-commit linting)
├── scripts/                      # Build & release scripts
├── dist/                         # Built frontend (prod)
└── node_modules/                 # npm dependencies
```

## Directory Purposes

**`src/`:**
- Purpose: React frontend application code
- Contains: Components, hooks, utilities, styling
- Key files: `main.tsx` (entry), `App.tsx` (root), `vite-env.d.ts` (type defs)

**`src/components/`:**
- Purpose: All UI components organized functionally
- Contains: 60+ React components (modals, panels, tabs, buttons, etc.)
- Key directories: `setup/` (onboarding), `CompactMode/` (terminal mode), `icons/` (SVG icons)
- Key files: `WorkspaceView.tsx` (main workspace), `ProjectsView.tsx` (dashboard), `Terminal.tsx` (xterm wrapper)

**`src/hooks/`:**
- Purpose: Custom hooks for state management (extracted from App.tsx for testability)
- Contains: 27 hooks managing terminal, dev server, git, plugins, notifications, UI layout
- Examples: `useTerminalManagement.ts`, `useDevServer.ts`, `useBranchManagement.ts`

**`src/lib/`:**
- Purpose: Tauri command wrappers and utility functions
- Contains: Functions wrapping backend commands, polling utilities, logging, analytics, project metadata
- Examples: `git.ts`, `branches.ts`, `project.ts`, `setup.ts`, `agent.ts`

**`src/contexts/`:**
- Purpose: React context providers for shared state across component tree
- Contains: Plugin context for accessing plugin API
- Key file: `PluginContext.tsx`

**`src/styles/`:**
- Purpose: CSS files for all components (co-located naming)
- Contains: 39 CSS files, base theme variables in `base.css`
- Pattern: Component name + `.css` (e.g., `branches.css` for `BranchesTab.tsx`)

**`src/test/`:**
- Purpose: Test infrastructure and fixtures
- Contains: Test setup (Vitest config), mocks for Tauri plugins, test data fixtures
- Key files: `setup.ts`, `fixtures/setup.ts`, `mocks/` (tauri-pty, screenshots)

**`src-tauri/src/`:**
- Purpose: Rust backend implementation
- Contains: Command handlers, state, types, utilities, logging

**`src-tauri/src/commands/`:**
- Purpose: Tauri command handlers (exported to frontend via IPC)
- Contains: 28 command files organized by domain
- Domain modules: `git/`, `projects/`, `setup/`, `ide/`, `plugins/`
- Single-file domains: `ai.rs`, `github.rs`, `publishing.rs`, `pty.rs`, `vercel.rs`, `claude.rs`, `skills.rs`, `mcp.rs`, etc.

**`src-tauri/src/commands/git/`:**
- Purpose: All git-related operations with caching
- Contains: `mod.rs` (command registry), `branches.rs`, `status.rs`, `stash.rs`, `sync.rs`
- Key functions: create_branch, switch_branch, get_branch_status, get_file_diff, apply_stash

**`src-tauri/src/commands/projects/`:**
- Purpose: Project listing, creation, metadata management
- Contains: Project CRUD, template extraction, window registry
- Key functions: list_projects, read_project_metadata, detect_project_type_command

**`src-tauri/src/commands/setup/`:**
- Purpose: Onboarding setup checks and tool installation
- Contains: Prerequisite detection, tool installation runners, setup state persistence
- Key functions: get_full_setup_status, check_prerequisites, install_tool_command

**`src-tauri/src/commands/plugins/`:**
- Purpose: Plugin system (install, load, execute)
- Contains: Plugin manifest parsing, bundling, storage, shell execution
- Key functions: list_plugins, install_plugin, exec_plugin_shell

**`public/`:**
- Purpose: Static assets bundled with app
- Contains: Terminal font (JetBrains Mono NF), notification sounds
- Key files: `fonts/JetBrainsMonoNerdFontMono-Regular.woff2`, `sounds/`

**`packages/plugin-sdk/`:**
- Purpose: TypeScript SDK for plugin developers
- Contains: Plugin API types, utilities, scaffolding

**`test-plugins/hello-world/`:**
- Purpose: Example plugin demonstrating API usage
- Contains: Plugin manifest, sample commands, storage usage

**`.planning/codebase/`:**
- Purpose: GSD-generated architecture/structure documentation
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md

## Key File Locations

**Entry Points:**
- `src/main.tsx`: React app entry, mounts App component, sets up scrollbar management
- `src-tauri/src/lib.rs`: Tauri builder, plugin registration, command handlers
- `src/App.tsx`: Root React component, state orchestration, view routing

**Configuration:**
- `package.json`: Frontend dependencies, npm scripts
- `src-tauri/Cargo.toml`: Rust dependencies
- `src-tauri/tauri.conf.json`: Tauri window config, CSP (must be null), capabilities
- `vite.config.ts`: Vite build config (if present)
- `tsconfig.json`: TypeScript config

**Core Logic:**
- `src/lib/project.ts`: Project management wrapper functions
- `src/lib/git.ts`: Git operations wrapper
- `src/lib/branches.ts`: Branch management and PR status
- `src/lib/setup.ts`: Setup wizard state, step definitions
- `src-tauri/src/state.rs`: Global window/port registry
- `src-tauri/src/cache.rs`: TTL-based operation caching

**Testing:**
- `src/**/*.test.tsx`: Component tests (React Testing Library + Vitest)
- `src/**/*.test.ts`: Hook/function tests (Vitest)
- `src/test/setup.ts`: Vitest config
- `src/test/mocks/`: Tauri plugin mocks
- `src/test/fixtures/`: Test data (setup wizard scenarios)

## Naming Conventions

**Files:**

- **React Components:** PascalCase (e.g., `ProjectsView.tsx`, `BranchesTab.tsx`)
- **CSS Files:** kebab-case matching component (e.g., `branches.css` for `BranchesTab.tsx`)
- **Hooks:** camelCase starting with `use` (e.g., `useTerminalManagement.ts`)
- **Utilities:** camelCase (e.g., `git.ts`, `polling.ts`)
- **Rust modules:** snake_case (e.g., `commands/git/branches.rs`, `pull_requests.rs`)
- **Test files:** Same name + `.test.tsx` or `.test.ts` (e.g., `BranchIndicator.test.tsx`)

**Directories:**

- **Feature directories:** camelCase (e.g., `CompactMode/`, `setup/`)
- **Rust command modules:** snake_case (e.g., `commands/git/`, `commands/pull_requests/`)
- **Domain directories:** Plural nouns (e.g., `components/`, `hooks/`, `styles/`)

**Variables & Functions:**

- **Variables:** camelCase (e.g., `currentProject`, `terminalTabs`)
- **Functions:** camelCase verbs (e.g., `createBranch()`, `listProjects()`)
- **Constants:** UPPER_SNAKE_CASE (e.g., `MAX_TERMINAL_TABS`, `DEFAULT_PORT`)
- **React Props Interfaces:** `<Component>Props` (e.g., `TerminalProps`, `AppProps`)
- **React Return Interfaces:** `Use<Hook>Return` (e.g., `UseTerminalManagementReturn`)

**Types:**

- **TypeScript interfaces:** PascalCase (e.g., `Project`, `DashboardProject`, `TerminalTab`)
- **Rust structs:** PascalCase (e.g., `ProjectInfo`, `PublishRecord`)
- **Enums:** PascalCase variants, e.g., `ProjectType::Nextjs`

## Where to Add New Code

**New Feature:**

- **Feature UI components:** `src/components/<FeatureName>.tsx` + corresponding `src/styles/<feature-name>.css`
- **Feature hooks:** `src/hooks/use<FeatureName>.ts` (if managing state)
- **Feature backend:** New file in `src-tauri/src/commands/<domain>.rs` or subdirectory if complex (e.g., `commands/git/branches.rs`)
- **Tests:** `src/components/<FeatureName>.test.tsx` or `src/hooks/<Hook>.test.ts`

**New Component/Module:**

- **UI Component:** Create in `src/components/<ComponentName>.tsx`
- **Styling:** Add `src/styles/<component-name>.css`
- **Shared utilities:** Add function to existing module in `src/lib/` or create new module if standalone
- **Tauri command:** Add handler in appropriate `src-tauri/src/commands/` file or subdirectory

**Utilities:**

- **Shared frontend helpers:** `src/lib/<domain>.ts` (e.g., `git.ts`, `polling.ts`)
- **Shared backend logic:** `src-tauri/src/<module>.rs` (e.g., `cache.rs`, `utils.rs`)
- **Backend utility functions:** Add to `src-tauri/src/utils.rs` or dedicated module

**Styles:**

- **Component-specific CSS:** Create co-located file `src/styles/<component-name>.css`, import in component
- **Global variables/resets:** Add to `src/styles/base.css` only (shared API for plugins)
- **Theme tokens:** Define as CSS variables in `:root` in `base.css`

## Special Directories

**`src-tauri/gen/`:**
- Purpose: Auto-generated Tauri type bindings (from command functions)
- Generated: Yes (during build via tauri CLI)
- Committed: No (rebuild each time)
- When to touch: Never directly; regenerated from command function signatures

**`src-tauri/icons/`:**
- Purpose: App icons for bundling (macOS, Windows, Linux)
- Generated: No (checked in)
- Committed: Yes
- When to touch: During branding/icon updates

**`dist/`:**
- Purpose: Built frontend (output of `vite build`)
- Generated: Yes (during build)
- Committed: No
- When to touch: Never; use `pnpm build` to regenerate

**`node_modules/` & `src-tauri/target/`:**
- Purpose: Dependencies installed by npm and cargo
- Generated: Yes
- Committed: No
- When to touch: Never; use package managers

---

*Structure analysis: 2025-02-28*
