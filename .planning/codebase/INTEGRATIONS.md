# External Integrations

**Analysis Date:** 2025-02-28

## APIs & External Services

**Analytics & Telemetry:**
- **PostHog** - Product analytics and event tracking
  - SDK/Client: `reqwest` HTTP client (Rust backend)
  - Endpoint: `https://us.i.posthog.com`
  - Auth: `phc_i1C5azXcz9MsnM8mQBni7qq5shiNS8JVFkcyXBjuBkr` (API key in `src-tauri/src/commands/analytics.rs`)
  - Flow: Events sent from Rust backend via IPC, never exposed to frontend webview
  - Events tracked: user actions, errors, feature usage, search queries
  - Device ID generated on first launch and persisted
  - User-configurable via `set_analytics_enabled`

**Version Management:**
- **GitHub Releases** - Auto-update mechanism
  - Update endpoint: `https://github.com/ship-studio/releases/releases/latest/download/latest.json`
  - Signature verification: Minisign public key in `tauri.conf.json`
  - Cross-repo strategy: Main source (`ship-studio/ship-studio` private) → Updates published to `ship-studio/releases` public

## Data Storage

**Databases:**
- **Local file-based storage only** - No remote database
  - Project metadata: `.shipstudio/project.json` (per-project TOML with timestamps, publish records)
  - Vercel config: `.vercel/project.json` (managed by Vercel CLI)
  - App state: `~/ShipStudio/.app-state.json` (analytics opt-out, device ID, default agent)
  - Logs: `~/Library/Logs/ShipStudio/` (structured JSON logs via `tracing`)

**File Storage:**
- **Local filesystem only** - User's `~/ShipStudio` directory
  - Project files: User-created repos and imports
  - Public assets: `/public` folder in projects (managed via `src-tauri/src/commands/assets.rs`)
  - No cloud storage integration

**Caching:**
- **In-memory TTL cache** (`src-tauri/src/cache.rs`)
  - Git status, branch info: 60-second TTL
  - Extended PATH resolution: 60-second TTL
  - Purpose: Reduce subprocess calls for CLI operations

## Authentication & Identity

**Auth Provider:**
- **GitHub CLI (gh)** - Primary identity and authorization
  - Implementation: `gh auth status`, `gh auth login` (browser-based flow)
  - Scope: repo, user, workflow access
  - Verified by: `src-tauri/src/commands/github.rs` (check_github_cli_status)
  - Used for: PR creation, repo management, GitHub integration checks

**AI Agent Authentication:**
- **Claude Code** - AI assistant integration
  - Auth: `claude auth login` (managed by Claude CLI, persisted locally)
  - Check: `claude --version` to verify installation and auth
  - Used for: PR description generation, AI capabilities
- **Cursor** (alternative agent)
  - Auth: Similar to Claude Code
  - Check: Version detection and auth validation
- Implementation: `src-tauri/src/commands/claude.rs`, `src-tauri/src/commands/setup/auth.rs`

**Vercel Authentication:**
- **Vercel CLI** - Deployment service auth
  - Auth: `vercel login` (browser-based)
  - Check: `vercel whoami`
  - Used for: Project linking, staging/production deployment
  - Implementation: `src-tauri/src/commands/publishing.rs`

## Monitoring & Observability

**Error Tracking:**
- **PostHog error events** - No dedicated error service
  - Errors tracked via `trackError()` in `src/lib/analytics.ts`
  - Includes: error message (capped 500 chars), error type, action context
  - No stack traces or sensitive data sent

**Logs:**
- **Structured JSON logging** via `tracing` crate
  - Location: `~/Library/Logs/ShipStudio/`
  - Format: JSON with timestamp, level, module, message, context
  - Lifetime: Persisted until manually cleared
  - Implementation: `src-tauri/src/logging.rs`

**Frontend Error Handling:**
- No remote error reporting
- Errors captured for PostHog event tracking only
- UI toast notifications for user-facing errors

## CI/CD & Deployment

**Hosting:**
- **GitHub Pages/Releases** - Auto-update bundles
  - Primary endpoint: `github.com/ship-studio/releases`
  - Contains: Latest version metadata (`latest.json`), signed bundles (`.tar.gz` + `.sig`), DMGs
  - Published by: GitHub Actions (private repo CI)

**Update Bundles:**
- Platform-specific builds:
  - macOS ARM64: `ShipStudio_darwin-aarch64.dmg`
  - macOS Intel: `ShipStudio_darwin-x86_64.dmg`
  - Windows: `ShipStudio_windows-x86_64.nsis.zip`
- Signed with: Minisign (update signature verification)
- Hosted: `https://github.com/ship-studio/releases/releases/latest/download/`

**CI Pipeline:**
- **GitHub Actions** (private repo)
  - Build: Multi-target (macOS ARM64/x86_64, Windows)
  - Sign: Apple Developer ID certificate
  - Notarize: App Store Connect API (macOS requirements)
  - Publish: Draft release in main repo → Auto-publish to releases repo
- Secrets required: Apple certs, API keys, signing keys (see CLAUDE.md)

**Local User Deployments:**
- **Vercel CLI integration** for user projects
  - `publish_to_staging` - Deploy to Vercel staging environment
  - `publish_to_production` - Deploy to Vercel main environment
  - Push to GitHub via git CLI, Vercel auto-deploys via webhook
  - Results saved: `publish_records` in `.shipstudio/project.json`

## Environment Configuration

**Required env vars for development:**
- None hardcoded in `.env` (all integrations handled via CLI tools)
- Local development uses actual CLI tools (git, gh, vercel, claude)
- Testing uses mocks via `SHIPSTUDIO_FORCE_SETUP` flags

**App Configuration:**
- App state: `~/.ShipStudio/.app-state.json` (persisted via `src-tauri/src/commands/setup.rs`)
  - `device_id`: UUID generated on first launch
  - `analytics_enabled`: Boolean, defaults true
  - `default_agent_id`: Selected AI agent (claude/codex)
  - `setup_complete`: Onboarding completion flag

**Secrets location:**
- **Not stored locally** - CLI tools manage their own auth tokens
  - GitHub: `~/.config/gh/hosts.yml` (gh CLI managed)
  - Vercel: `~/.vercel/` (vercel CLI managed)
  - Claude: `~/.claude/` (claude CLI managed)
  - PostHog API key: In Rust binary only (never exposed to frontend)

## Webhooks & Callbacks

**Incoming:**
- **None** - Ship Studio is a desktop app, no incoming webhooks
- No server component or webhook handling

**Outgoing:**
- **Git Push to GitHub** - Triggered by `publish_to_github`, `publish_to_staging`, `publish_to_production`
  - Implementation: `src-tauri/src/commands/publishing.rs`
  - Uses: `git push` CLI (authenticated via gh CLI)
  - Vercel auto-deploys via GitHub webhook (user configures on Vercel dashboard)

**Analytics Events:**
- Sent to PostHog via HTTP POST
- Endpoint: `https://us.i.posthog.com/capture`
- Non-blocking, fire-and-forget (async spawned)
- Never blocks app or user operations

## External CLI Tools Used

**Required (Core):**
- **git** - Version control (`src-tauri/src/commands/git.rs`)
- **gh** (GitHub CLI) - GitHub operations (`src-tauri/src/commands/github.rs`)
  - Branch management, PR creation, repo status

**Optional (AI Agents):**
- **claude** (Claude Code) - AI generation (`src-tauri/src/commands/claude.rs`, `src-tauri/src/commands/ai.rs`)
  - PR title/description generation
  - Context gathered: diff (max 40KB), commits, branch name, diff stats
- **cursor** (Cursor IDE) - Alternative AI agent with same capabilities

**Optional (Deployment):**
- **vercel** (Vercel CLI) - Deployment (`src-tauri/src/commands/publishing.rs`)
  - Project linking, staging/production push
  - Environment checks: `vercel whoami`, `vercel project` status

**Optional (Package Managers):**
- **npm**, **yarn**, **pnpm** - Detected and used to run user projects
  - Detected via: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
  - Implementation: `src-tauri/src/commands/projects/detection.rs`

**Installation (Setup Wizard):**
- **homebrew** - macOS package manager installation
  - Installs: git, node, gh, vercel (if needed)
  - Implementation: `src-tauri/src/commands/setup/install.rs`
- **winget** (Windows) - Parallel to homebrew
- Uses curl to fetch and execute: `https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh`

## Skills & MCP Servers

**Claude Skills Registry:**
- Endpoint: `skills.sh` (queried via claude CLI)
- Integration: `src-tauri/src/commands/skills.rs`
- Allows users to search and install Claude skills
- No direct API integration; CLI-based

**MCP Servers:**
- **Model Context Protocol** support
- Managed via claude CLI
- Integration: `src-tauri/src/commands/mcp.rs`
- Allows extensibility through Claude's MCP protocol

## Plugin System

**Plugin Loading:**
- **Web-based plugins** - Bundled as HTML/JS/CSS archives
- Storage: `~/.ShipStudio/plugins/` (per-plugin directory)
- Manifest: `plugin.json` per plugin
- No external plugin registry; plugins installed locally or from GitHub URLs
- Implementation: `src-tauri/src/commands/plugins/`

---

*Integration audit: 2025-02-28*
