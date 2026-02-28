# Architecture

**Analysis Date:** 2025-02-28

## Pattern Overview

**Overall:** Full-stack Tauri desktop application with React frontend and Rust backend using command-response pattern (IPC).

**Key Characteristics:**
- **Multi-window support** - Main window for projects list, separate project windows for workspaces
- **Command-driven backend** - All Rust operations exposed as Tauri commands invoked from frontend
- **State isolation per window** - Project windows are independent, with global registry to prevent duplicates
- **Terminal & PTY management** - Embedded Claude Code terminal via pseudo-terminal spawning
- **Pub/Sub for UI updates** - Backend emits events for git status, shell output, dev server logs
- **Resource pooling** - Shared port reservation, cached git operations, screenshot capture buffers

## Layers

**Frontend (React/TypeScript):**
- Purpose: User interface for project management, workspace controls, terminal, git operations
- Location: `src/`
- Contains: Components, hooks, utility functions, styling
- Depends on: Tauri API, @xterm.js, Tauri plugins
- Used by: User interactions, orchestrates backend commands

**Backend (Rust/Tauri):**
- Purpose: System-level operations, process management, file I/O, git/GitHub integration, analytics
- Location: `src-tauri/src/`
- Contains: Command handlers, domain logic, external process runners, state management
- Depends on: Tauri plugins, git/vercel CLI, Rust stdlib
- Used by: Frontend via command invocation

**Entry Point (Frontend):**
- Location: `src/main.tsx`
- Triggers: Application startup, mounts React app to DOM
- Responsibilities: Initialize logger, expose globals for plugins, set up scrollbar management, parse URL params for project windows

**Entry Point (Backend):**
- Location: `src-tauri/src/lib.rs::run()`
- Triggers: Application launch
- Responsibilities: Initialize logging, clean up orphaned processes, register Tauri plugins, register command handlers, set up window event listeners

## Data Flow

**Project Opening Flow:**

1. User clicks project in ProjectsView (`src/components/ProjectsView.tsx`)
2. Frontend calls `Project.open()` → `open_project_in_new_window` command
3. Backend registers window + project path in global OPEN_PROJECT_WINDOWS state (`src-tauri/src/state.rs`)
4. Backend opens new Tauri window with `?project=<path>` URL param
5. New window mounts App.tsx with initialProjectPath from URL param
6. useProjectLifecycle hook calls `mark_project_opened` command → updates last_opened timestamp in `.shipstudio/project.json`
7. Dev server auto-starts via useDevServer hook

**Terminal Output Flow:**

1. User types in Terminal component (`src/components/Terminal.tsx`)
2. Component sends text via terminal ref (xterm.js)
3. PTY pseudo-terminal (`tauri_pty`) writes to process stdin
4. Backend emits `pty_output` event via Tauri event system
5. Frontend listen() unsubscribe handler receives event data
6. useTerminalManagement updates terminal state, re-renders output

**Git Operations Flow:**

1. User performs git action (create branch, commit, etc.)
2. Frontend calls git wrapper function in `src/lib/git.ts` (e.g., `createBranch()`)
3. Function invokes backend command via Tauri IPC (e.g., `create_branch`)
4. Backend command in `src-tauri/src/commands/git/` runs actual git CLI with caching
5. Response returns to frontend, updates component state
6. useBranchManagement hook triggers UI updates
7. Branch status polling refreshes via exponential backoff (`src/lib/polling.ts`)

**Dev Server & Preview Flow:**

1. useDevServer hook spawns PTY for dev server (Next.js, Astro, etc.)
2. Project type auto-detected via `detect_project_type_command`
3. Dev server output buffered in devServerOutputRef
4. Frontend preview panel connects to `http://localhost:<port>` via preview proxy
5. Backend preview proxy (`src-tauri/src/proxy/`) forwards requests to dev server
6. Screenshot capture reads iframe content via Playwright plugin

**State Management:**

- Frontend: Custom hooks (useTerminalManagement, useDevServer, useBranchManagement, etc.) extract state from App.tsx for testability
- Backend: Global registries (OPEN_PROJECT_WINDOWS, RESERVED_PORTS, agent cache) via LazyLock<Mutex<>>
- Project metadata: Persisted in `.shipstudio/project.json` per project (publish records, preferences)
- App state: Persisted in `~/.config/ShipStudio/app_state.json` (default agent, setup completion)

## Key Abstractions

**Project:**
- Purpose: Represents a single web project in ~/ShipStudio
- Examples: `src/lib/project.ts`, `src-tauri/src/commands/projects/`
- Pattern: Encapsulates project metadata (name, path, git status, deploy URLs), handles directory I/O, metadata persistence

**Terminal/PTY:**
- Purpose: Spawns and manages pseudo-terminal processes (dev server, git commands)
- Examples: `src/components/Terminal.tsx`, `src-tauri/src/commands/pty.rs`
- Pattern: Uses tauri_pty plugin to spawn subprocess, emits output events to frontend, tracks process by window

**Branch & Git Operations:**
- Purpose: Abstracts git CLI with caching and error handling
- Examples: `src/lib/branches.ts`, `src-tauri/src/commands/git/`
- Pattern: Wraps git commands with TTL-based caching, detects conflicts, parses diffs, manages stash

**Tauri Commands:**
- Purpose: Type-safe RPC bridge between frontend and backend
- Examples: All handlers in `src-tauri/src/commands/`
- Pattern: Each command validates inputs (paths sanitized to ~/ShipStudio), returns serializable Rust structs, emits events for async updates

**Agent/Integration:**
- Purpose: Manages Claude Code and Codex availability and auth
- Examples: `src/lib/agent.ts`, `src-tauri/src/agent.rs`
- Pattern: Singleton default agent, with per-tab agent assignment in terminal

## Entry Points

**App.tsx:**
- Location: `src/App.tsx`
- Triggers: After React renders root element in main.tsx
- Responsibilities: Orchestrates all view states (loading, setup, projects, workspace), coordinates hooks for terminal/dev server/git/plugins, handles window close cleanup

**ProjectsView:**
- Location: `src/components/ProjectsView.tsx`
- Triggers: When app view === 'projects'
- Responsibilities: Displays project cards with last_opened/git status, handles project creation/import/deletion

**WorkspaceView:**
- Location: `src/components/WorkspaceView.tsx`
- Triggers: When app view === 'workspace' with currentProject set
- Responsibilities: Main workspace layout (terminal, preview, panels), coordinates tabs, modals, notifications

**OnboardingScreen:**
- Location: `src/components/setup/OnboardingScreen.tsx`
- Triggers: When app view === 'setup'
- Responsibilities: Guides user through tool installation (homebrew, node, git, GitHub CLI, Claude Code), validates prerequisites

## Error Handling

**Strategy:** Three-tier error handling with fallbacks.

**Patterns:**

- **IPC Errors:** Frontend wraps command invocations in try-catch, displays toast notifications via useToasts hook
- **Git Operation Errors:** Caught in `src/lib/git.ts` wrappers, displayed in GitErrorHandler modal component, offers recover actions (stash, discard)
- **PTY/Terminal Errors:** Logged to terminal output, allows retry via terminal restart button
- **Setup Validation Errors:** OnboardingScreen catches prerequisite check failures, retries with exponential backoff
- **Promise Rejections:** Global ErrorBoundary in main.tsx catches React component errors, renders fallback UI

## Cross-Cutting Concerns

**Logging:**
- Frontend: Structured logging via `src/lib/logger.ts` (dispatch pattern), events sent to `/events/log` endpoint
- Backend: Structured logging via `tracing` crate, stored at `~/Library/Logs/ShipStudio/`, initialized in `logging.rs`

**Validation:**
- Path validation: All backend commands validate paths are under ~/ShipStudio (security boundary)
- Type safety: TypeScript interfaces on frontend, serde structs on backend for IPC serialization
- User input: Environment variables validated for duplicate keys, git messages checked for empty content

**Authentication:**
- GitHub: Check via `gh auth status`, browser-based OAuth flow, stored in system credential manager
- Claude: Check via `claude --version`, browser-based login, auth happens in Claude CLI
- Vercel: Check via `vercel whoami`, stored in ~/.vercel/auth.json

**Analytics:**
- Backend: PostHog integration via `commands/analytics.rs`, device_id generated on first launch
- Frontend: Tracked events via `src/lib/analytics.ts`, includes screen name and event data
- Privacy: Users can opt-out, toggle stored in `~/.config/ShipStudio/app_state.json`

---

*Architecture analysis: 2025-02-28*
