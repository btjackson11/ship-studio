# Codebase Concerns

**Analysis Date:** 2026-02-28

## Tech Debt

**Global Node.prototype patch for OverlayScrollbars:**
- Issue: `Node.prototype.removeChild` is patched globally to handle nodes relocated by OverlayScrollbars, but this masks real DOM bugs elsewhere
- Files: `src/main.tsx:30-40`
- Impact: Makes debugging DOM mutations harder; changes affect all code, not just OverlayScrollbars containers
- Fix approach: Scope patch to OverlayScrollbars containers only using a `WeakMap` of patched nodes or replace with OverlayScrollbars lifecycle hooks

**Fragile substring class matching for modal/overlay detection:**
- Issue: `el.closest('[class*="-modal"], [class*="-overlay"], [class*="-dropdown"]')` uses substring matching which could false-positive on unrelated classes like `bimodal-chart`
- Files: `src/main.tsx:50-51`
- Impact: Unintended scrollbar initialization on elements; maintenance burden when adding new component patterns
- Fix approach: Use explicit class lists (e.g., `data-os-init-exclude` attribute) or hardcoded selectors instead of substring patterns

**Hard-coded theme colors in PR card styles:**
- Issue: PR card styles use hard-coded `#3b82f6` (Tailwind blue) instead of CSS variable `var(--accent)`
- Files: `src/styles/branches.css:1341, 1347` (`.pr-card-checked-out`, `.pr-card-current-label`)
- Impact: Theme inconsistency; colors won't update when accent changes; breaks custom theme support
- Fix approach: Replace both instances with `var(--accent)` CSS variable

**Arbitrary timeout for dev server restart:**
- Issue: 1.5s timeout used to chain `handleBranchSwitch` with `handleRestartDevServer`, but branch switch may take longer or shorter
- Files: `src/components/WorkspaceView.tsx:836-837, 1067`
- Impact: Race condition risk; dev server may not restart in time, or restarts before switch completes
- Fix approach: Wait for `handleBranchSwitch` promise to settle before calling `handleRestartDevServer`

**Sparse test coverage for critical backend logic:**
- Issue: Several high-risk library modules lack test files:
  - `src/lib/project.ts` (613 lines) - project creation, env parsing, server management
  - `src/lib/github.ts` - GitHub operations
  - `src/lib/conflicts.ts` - merge conflict resolution
  - `src/lib/assets.ts` - file operations
  - `src/lib/external-projects.ts` - external project registration
- Files: Multiple in `src/lib/`
- Impact: Bugs in project operations, env handling, or git operations may not be caught until production
- Fix approach: Add unit tests for core logic in these modules; prioritize `project.ts` and `github.ts`

## Known Bugs

**OverlayScrollbars DOM relocation handling:**
- Symptoms: Potential crashes when React unmounts components after OverlayScrollbars has moved their children
- Files: `src/main.tsx:26-40`
- Trigger: Rapid unmount of scrollable containers while OverlayScrollbars has relocated children nodes
- Workaround: None; relies on the global patch to catch and handle gracefully

## Performance Bottlenecks

**Path extension caching may become stale:**
- Problem: `get_extended_path()` caches extended PATH for 60 seconds, but environment may change (new tools installed, NVM version switched)
- Files: `src-tauri/src/utils.rs:31-62`
- Cause: Static 60-second TTL doesn't account for user environment changes during a session
- Improvement path: Detect environment changes (e.g., NVM switched) or allow manual cache invalidation; consider shorter TTL or event-driven invalidation

**Git cache TTL may cause stale data:**
- Problem: Git branch cache has 30s TTL, status cache has 5s TTL, but concurrent operations may see inconsistent states
- Files: `src-tauri/src/cache.rs:40-44`
- Cause: Different TTLs for different caches; branch may be cached as "main" while status shows changes from a different branch
- Improvement path: Use coordinated invalidation across all caches, or reduce branch TTL to match status TTL

**Page list refresh polling runs every 5 seconds:**
- Problem: `PAGE_REFRESH_INTERVAL_MS = 5000` in `usePreviewConnection` may cause UI jank on slower systems
- Files: `src/hooks/usePreviewConnection.ts:16`
- Cause: Fixed interval doesn't adapt to system load or network latency
- Improvement path: Use exponential backoff or adaptive polling based on response time

**Plugin dynamic import timeout is generous (10 seconds):**
- Problem: 10-second timeout for plugin module loading may cause UI to feel unresponsive if plugins are slow
- Files: `src/lib/plugin-loader.ts:32`
- Cause: No progress feedback to user while waiting; may load malicious/bloated plugins
- Improvement path: Add plugin load progress indicator, or implement resource limits on plugins

## Fragile Areas

**Plugin lifecycle hooks can fail silently:**
- Files: `src/lib/plugin-loader.ts:97-106, 124-133`
- Why fragile: `onActivate`/`onDeactivate` exceptions are caught and logged but don't prevent plugin from being used; app continues even if plugin is broken
- Safe modification: Add plugin validation step before loading; consider quarantining broken plugins
- Test coverage: Plugin error handling needs integration tests

**Workspace View component is large and multipurpose:**
- Files: `src/components/WorkspaceView.tsx` (1245 lines)
- Why fragile: Contains terminal, preview, branches, PRs, and modal orchestration; many interdependent state updates; hard to reason about flow
- Safe modification: Extract modal orchestration to separate component; split branch/PR tabs into smaller modules
- Test coverage: Only has integration tests; lacks unit tests for individual features

**Project lifecycle is tightly coupled to state management:**
- Files: `src/hooks/useProjectLifecycle.ts` (529 lines)
- Why fragile: Manages project selection, dev server, terminal, screenshot, branches, and plugins in one hook; errors in one domain cascade to others
- Safe modification: Break into domain-specific hooks (`useDevServerLifecycle`, `useTerminalLifecycle`, etc.)
- Test coverage: Only `useProjectLifecycle.ts` itself is tested, not integration with App state

**Preview connection polling has multiple race conditions:**
- Files: `src/hooks/usePreviewConnection.ts:119-150`
- Why fragile: Page list polling restarts when visibility changes, but ongoing requests may race with new interval; `isDevServerRestarting` flag may miss rapid restarts
- Safe modification: Use AbortController to cancel in-flight requests; queue page list loads instead of overlapping them
- Test coverage: Needs tests for concurrent polling scenarios

**Branch switch + dev server restart choreography:**
- Files: `src/components/WorkspaceView.tsx:834-838`
- Why fragile: Uses `setTimeout` to sequence operations; no error handling if branch switch fails; dev server may restart before switch completes
- Safe modification: Await branch switch completion before restarting; add error boundaries
- Test coverage: This flow isn't tested end-to-end

## Security Considerations

**Path traversal validation exists but may need hardening:**
- Risk: External projects can be registered anywhere; if registration is compromised, arbitrary paths could be accessed
- Files: `src-tauri/src/utils.rs:345-363` (validate_project_path)
- Current mitigation: Path must be canonical and either in `~/ShipStudio` or in registered external projects list
- Recommendations: Add rate limiting to external project registration; audit external project paths periodically; log all path validation failures

**Plugin modules are loaded via Blob URLs with cache-busting:**
- Risk: Plugins could inject malicious code; no signature verification or manifest validation
- Files: `src/lib/plugin-loader.ts:52-115`
- Current mitigation: Blob URLs are same-origin; dynamic import is in app context (not isolated)
- Recommendations: Add plugin manifest validation (name, permissions); consider sandboxing plugins with Web Workers or iframe; validate onActivate/onDeactivate are functions

**Environment variables can be read/modified without encryption:**
- Risk: `.env` files stored in plaintext in project directories; sensitive values at rest are not encrypted
- Files: `src/lib/env*` (frontend), `src-tauri/src/commands/env.rs` (backend)
- Current mitigation: None; relies on file system permissions
- Recommendations: Consider encrypting sensitive env vars in `.shipstudio/project.json`; warn users about plaintext storage; add support for local .env.local (gitignored)

**Git commands are constructed from user input (branch names, etc.):**
- Risk: Branch names or commit messages with shell metacharacters could escape quoting
- Files: `src-tauri/src/commands/git/` (all git operations)
- Current mitigation: Likely using proper arg passing (not shell concatenation), but needs verification
- Recommendations: Audit all `git` command invocations for shell injection; use structured arg passing only (not `sh -c`)

## Test Coverage Gaps

**Backend git operations lack integration tests:**
- What's not tested: Branch switching, conflict detection, stash operations, complex merge scenarios
- Files: `src-tauri/src/commands/git/`
- Risk: Git integration breaks silently in production; user loses work due to bad merge handling
- Priority: High

**Plugin system lacks error scenario tests:**
- What's not tested: Plugin load timeout, plugin onActivate exception, plugin slot rendering error
- Files: `src/lib/plugin-loader.ts`, `src/hooks/usePlugins.ts`
- Risk: Plugin errors crash workspace; no way to recover or disable broken plugin
- Priority: High

**Preview server connection lacks race condition tests:**
- What's not tested: Rapid dev server restarts, page list polling during visibility change, concurrent navigation
- Files: `src/hooks/usePreviewConnection.ts`
- Risk: UI shows stale pages; page list gets out of sync; health check fails silently
- Priority: Medium

**Environment variable editing lacks validation tests:**
- What's not tested: Large env files, env vars with special characters, concurrent edits, invalid syntax
- Files: `src/hooks/useEnvEditor.ts`, `src/components/EnvEditor.tsx`
- Risk: User corrupts `.env` file; app continues using broken env
- Priority: Medium

**External project registration lacks security tests:**
- What's not tested: Path traversal attempts, symlink attacks, concurrent registrations
- Files: `src-tauri/src/commands/external_projects.rs`
- Risk: Malicious user or script registers arbitrary paths as projects
- Priority: Medium

## Missing Critical Features

**No plugin unload recovery mechanism:**
- Problem: If a plugin fails to load after being registered, it's permanently broken until manually removed
- Blocks: Users can't work around broken plugins; requires manual file editing

**No offline mode or fallback for GitHub/Vercel:**
- Problem: App depends on GitHub and Vercel APIs being available; no graceful degradation
- Blocks: Work on branches/deployment during network outages

**No dev server output streaming to file:**
- Problem: If dev server crashes, terminal output is lost; can't review logs
- Blocks: Debugging production deploy issues from logs

## Dependencies at Risk

**OverlayScrollbars integration is fragile:**
- Risk: Global Node.prototype patch; relies on internal behavior that may change
- Impact: Scrolling may break; DOM operations may crash
- Migration plan: Consider switching to native scrollbar styling (`scrollbar-gutter: stable`) for supported browsers, or use Svelte Scroller

**xterm.js may require CSP null (known gotcha):**
- Risk: CSP = null is required for terminal fonts; production builds won't render JetBrains Mono fonts with non-null CSP
- Impact: Terminal falls back to system fonts; user experience degrades
- Migration plan: Test CSP with alternative terminal libraries (e.g., hterm, terminado) or find CSP-compliant font injection method

---

*Concerns audit: 2026-02-28*
