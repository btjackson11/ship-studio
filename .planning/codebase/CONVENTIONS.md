# Coding Conventions

**Analysis Date:** 2026-02-28

## Naming Patterns

**Files:**
- React components: PascalCase (e.g., `BranchIndicator.tsx`, `OnboardingScreen.tsx`)
- Utilities/modules: camelCase (e.g., `polling.ts`, `logger.ts`, `git.ts`)
- Tests: same as source with `.test.ts` or `.test.tsx` suffix
- Rust modules: snake_case (e.g., `git/mod.rs`, `sync.rs`, `status.rs`)

**Functions:**
- JavaScript/TypeScript: camelCase (e.g., `getChangedFiles()`, `startPolling()`)
- Rust: snake_case (e.g., `git_has_uncommitted_changes()`, `get_current_branch_sync()`)
- Public functions in Rust marked with `pub`

**Variables:**
- camelCase throughout: `selectedBranch`, `isSubmitting`, `projectPath`
- Boolean flags prefixed with `is` or `has`: `isLoading`, `hasUncommittedChanges`
- Unused parameters prefixed with underscore: `projectPath: _projectPath` to satisfy TypeScript strict rules

**Types:**
- Interfaces: PascalCase (e.g., `BranchSelectorModalProps`, `PollingOptions`, `AgentConfig`)
- Type aliases: PascalCase (e.g., `ChangeStatus`, `LogLevel`)
- Exported constants: UPPER_SNAKE_CASE (e.g., `CLAUDE_CODE`, `ALL_AGENTS`, `WIZARD_STEPS`)

## Code Style

**Formatting:**
- Tool: Prettier 3.8.1
- Semicolons: required
- Single quotes for strings
- Tab width: 2 spaces
- Max line width: 100 characters
- Trailing commas: ES5 style (objects/arrays, but not function params)
- Arrow function parentheses: always required (even single param)
- Bracket spacing: true (spaces in `{ key: value }`)
- Line ending: LF

**Linting:**
- Tool: ESLint 9.39.2 with TypeScript support
- Config: `eslint.config.js` (flat config format)
- Key enforced rules:
  - `@typescript-eslint/no-floating-promises` - all promises must be awaited or void
  - `@typescript-eslint/no-unsafe-call/assignment/member-access` - strict type safety
  - `@typescript-eslint/no-explicit-any` - never use `any` type
  - `@typescript-eslint/no-unused-vars` - unused vars forbidden except `_`-prefixed
  - `react-hooks/set-state-in-effect` - error on invalid setState in effects
  - `no-console` - logging only via `console.warn` or `console.error` (allow list); use logger module instead

**Run commands:**
```bash
pnpm lint              # Check all style issues
pnpm lint:strict       # Strict mode (max-warnings 0)
pnpm lint:fix          # Auto-fix issues
pnpm format            # Run Prettier
pnpm format:check      # Check Prettier compliance
pnpm typecheck         # TypeScript strict checking
```

## Import Organization

**Order:**
1. React and React-related imports (`react`, `@testing-library/react`)
2. Third-party libraries (`@tauri-apps/api`, `vitest`, etc.)
3. Local module imports (`../lib/`, `../components/`)
4. Type-only imports (when mixed with values)

**Path Aliases:**
- `@/*` resolves to `src/*` (defined in `tsconfig.json`)
- Use alias imports for deep module references: `import { logger } from '@/lib/logger'`
- Full relative paths OK for shallow moves (same directory)

**Example:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExponentialPoller } from './polling';
import { logger } from '@/lib/logger';
```

## Error Handling

**Frontend Patterns:**
- Most functions return `Promise<T>` and throw on error; caller must `.catch()` or use try/catch
- Tauri invoke calls throw via Tauri's built-in error propagation
- No custom error classes; use `new Error('message')` and chain context in logger if needed
- Logger provides `logger.logError(error)` to capture stack traces

**Example:**
```typescript
try {
  const result = await someAsyncFunction();
} catch (error) {
  logger.logError(error instanceof Error ? error : new Error(String(error)), {
    context: 'operation-name',
  });
}
```

**Rust Patterns:**
- Functions return `Result<T, String>` where `String` contains error message
- Use `.map_err(|e| e.to_string())` to convert standard errors
- Check `status.success()` on command output and return error if false
- Use `?` operator to propagate errors up the call stack

**Example:**
```rust
let output = create_command("git")
  .args(["status"])
  .output()
  .map_err(|e| e.to_string())?;

if !output.status.success() {
  return Err(String::from_utf8_lossy(&output.stderr).to_string());
}
```

## Logging

**Framework:** Custom `logger` module (`src/lib/logger.ts`)

**Levels:**
- `logger.debug()` - verbose development info
- `logger.info()` - normal operations
- `logger.warn()` - potential issues
- `logger.error()` - failures
- `logger.logError(error)` - Error objects with stack traces

**Patterns:**
```typescript
logger.debug('Starting operation', { interval: 1000, maxRetries: 3 });
logger.info('Setup complete');
logger.warn('Fallback strategy activated');
logger.error('Operation failed', { code: 'AUTH_FAILED', attempt: 3 });
logger.logError(error, { context: 'git-pull', projectPath });
```

**Child logger for preset context:**
```typescript
const log = logger.child({ module: 'BranchManager' });
log.info('Branch switched'); // includes module context
```

**Frontend logging sends errors to Rust backend immediately; other levels buffer every 10 seconds**

**No `console.log()` allowed** — use logger module. ESLint enforces this. Exception: internal logger.ts may use `console.warn/error` for bootstrap logging.

## Comments

**When to Comment:**
- Complex algorithms or business logic (non-obvious intent)
- Workarounds for bugs or limitations
- Important assumptions (e.g., "must be called after initialization")
- Do NOT comment obvious code (e.g., `let count = 0; // initialize count`)

**JSDoc/TSDoc:**
- Required for public module exports and component props
- Format: Standard JSDoc with `/**...*/` blocks
- Include `@param`, `@returns`, `@example` tags where helpful
- Module-level docs: `@module path/to/module`

**Example:**
```typescript
/**
 * Exponential backoff poller class.
 *
 * Polls a fetcher function at exponentially increasing intervals,
 * with optional jitter to prevent thundering herd.
 *
 * @example
 * const poller = new ExponentialPoller(
 *   () => fetch('/status'),
 *   (result) => console.log(result),
 *   { initialInterval: 1000, maxInterval: 30000 }
 * );
 * poller.start();
 */
export class ExponentialPoller<T> {
  // ...
}
```

## Function Design

**Size:**
- Keep functions <50 lines when possible
- Use helper functions to break up complex logic
- Prefer small, composable utilities over monolithic functions

**Parameters:**
- Max 3-4 positional params; use object destructuring for options
- Always use interfaces for object params with JSDoc

**Example:**
```typescript
// Bad: too many params
function create(name, branch, owner, access, description, isPrivate) { }

// Good: structured params
interface CreateOptions {
  name: string;
  branch: string;
  owner: string;
  access: 'public' | 'private';
  description?: string;
}

function create(options: CreateOptions) { }
```

**Return Values:**
- Prefer explicit return types (TypeScript `strict: true` enforces this)
- Return `Promise<T>` for async; never bare `Promise`
- Use discriminated unions for complex returns: `{ type: 'success'; data: T } | { type: 'error'; message: string }`

## Module Design

**Exports:**
- Export only public API; keep helpers private
- Use named exports for clarity; default exports only for components

**Barrel Files:**
- Located at `index.ts` or module `mod.rs`
- Re-export public items for cleaner imports
- Example: `src/lib/index.ts` could re-export setup, polling, logger

**Example from codebase:**
```typescript
// src/lib/git.ts — exports types and public functions
export type ChangeStatus = 'modified' | 'added' | 'deleted' | ...;
export interface ChangedFile { path: string; status: ChangeStatus; }
export async function getChangedFiles(projectPath: string): Promise<ChangedFile[]> { }

// Consumer imports cleanly
import { getChangedFiles, type ChangeStatus } from '@/lib/git';
```

---

*Convention analysis: 2026-02-28*
