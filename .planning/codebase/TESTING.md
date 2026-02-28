# Testing Patterns

**Analysis Date:** 2026-02-28

## Test Framework

**Runner:**
- Vitest 3.0.5
- Config: `vitest.config.ts`
- Environment: jsdom (DOM simulation for React tests)
- Globals: true (no need to import describe/it/expect)

**Assertion Library:**
- Vitest built-in `expect()` (compatible with Jest API)
- React Testing Library 16.3.0 for component testing
- jest-dom 6.6.3 for DOM matchers (e.g., `toBeInTheDocument()`)

**Run Commands:**
```bash
pnpm test              # Run all tests in watch mode
pnpm test:run          # Run tests once (CI mode)
pnpm test:coverage     # Generate coverage report (HTML in ./coverage)
pnpm test:ui           # Run with Vitest UI dashboard
```

## Test File Organization

**Location:**
- Co-located with source files: `src/components/Foo.tsx` has `src/components/Foo.test.tsx`
- Utilities/modules: `src/lib/polling.ts` has `src/lib/polling.test.ts`
- Fixtures/shared test data: `src/test/fixtures/`
- Test setup/configuration: `src/test/setup.ts`

**Naming:**
- `.test.ts` or `.test.tsx` suffix (inclusive globbed by Vitest)
- File name matches source: `polling.test.ts` for `polling.ts`
- Describe blocks match functionality: `describe('ExponentialPoller', ...)`

**Structure:**
```
src/
  lib/
    polling.ts
    polling.test.ts
  components/
    BranchIndicator.tsx
    BranchIndicator.test.tsx
  test/
    setup.ts              # Global test configuration
    fixtures/
      setup.ts            # Shared test data
      project.ts          # More fixtures
    mocks/
      tauri-pty.ts        # Module-level mocks
      tauri-plugin-screenshots-api.ts
```

## Test Structure

**Suite Organization:**

```typescript
/**
 * Tests for polling utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExponentialPoller, retryWithBackoff } from './polling';

describe('ExponentialPoller', () => {
  // Shared setup for ExponentialPoller tests
  beforeEach(() => {
    vi.useFakeTimers();  // Enable fake timers for this suite
  });

  afterEach(() => {
    vi.useRealTimers();  // Clean up
  });

  // Related tests grouped by feature
  describe('interval calculation', () => {
    it('should apply exponential backoff on errors', async () => {
      // Test code
    });

    it('should respect maxInterval', async () => {
      // Test code
    });
  });

  describe('stop behavior', () => {
    it('should stop when stop() is called', async () => {
      // Test code
    });
  });
});

describe('retryWithBackoff', () => {
  // Another top-level describe for different function
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should return result on first success', async () => {
    // Test code
  });
});
```

**Patterns:**
- One `describe()` per module or component
- Nested `describe()` blocks to group related tests by feature
- `beforeEach()` / `afterEach()` for shared setup/teardown
- Test names are complete sentences: "should apply exponential backoff on errors"

## Mocking

**Framework:** Vitest's native `vi` API

**Tauri API Mocking:**
- Global setup in `src/test/setup.ts` uses official `@tauri-apps/api/mocks`
- `mockIPC()` intercepts all `invoke()` calls
- `mockWindows()` pre-configures window mocks
- `clearMocks()` resets mocks after each test

**Setup (src/test/setup.ts):**
```typescript
import { mockIPC, mockWindows, clearMocks } from '@tauri-apps/api/mocks';

// Provide default responses for common commands
mockIPC((cmd, args) => {
  switch (cmd) {
    case 'get_current_branch':
      return 'main';
    case 'list_branches':
      return [{ name: 'main', is_current: true, ... }];
    default:
      return undefined;
  }
});

// Cleanup
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  clearMocks();
});
```

**Module-level mocks:**

Use `vi.mock()` for heavy dependencies (components, plugins):

```typescript
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn((cmd: string) => {
    // Custom invoke behavior per test
    const result = invokeResults.get(cmd);
    if (result?.error) return Promise.reject(result.error);
    return Promise.resolve(result?.value);
  }),
}));

vi.mock('./OnboardingTerminal', () => ({
  OnboardingTerminal: ({ onExit }: Props) => (
    <div data-testid="mock-terminal">
      <button onClick={() => onExit(0)}>Exit</button>
    </div>
  ),
}));

// Then use mock helper functions in tests
mockInvoke('some_command', { value: 'response' });
```

**Per-test mocks with `vi.fn()`:**

For simple mocks without module-level complexity:

```typescript
it('should call onClick when button is clicked', () => {
  const onClick = vi.fn();
  render(<BranchIndicator {...defaultProps} onClick={onClick} />);

  fireEvent.click(screen.getByRole('button'));
  expect(onClick).toHaveBeenCalledTimes(1);
});
```

**What to Mock:**
- External APIs (Tauri, plugins)
- Heavy components (terminals, modals with complex behavior)
- Third-party integrations
- File system operations

**What NOT to Mock:**
- Internal utility functions (test them directly)
- Pure data transformations
- Simple event handlers
- Core React hooks (use real hooks)

## Fixtures and Factories

**Test Data:**

Fixtures are pre-built test objects to reduce duplication:

```typescript
// src/test/fixtures/setup.ts

function item(
  id: string,
  friendlyName: string,
  status: SetupItem['status'],
  extra?: Partial<SetupItem>
): SetupItem {
  return { id, friendlyName, status, ...extra };
}

const HOMEBREW_READY = item('homebrew', 'Package Manager', 'ready', {
  version: '4.2.0',
});

export const FRESH_INSTALL_ITEMS: SetupItem[] = [
  HOMEBREW_MISSING,
  NODE_MISSING,
  // ... many items
];

export const ALL_READY_CLAUDE_ONLY: SetupItem[] = [
  HOMEBREW_READY,
  NODE_READY,
  CLAUDE_READY,
  CLAUDE_AUTH_READY,
  // ...
];
```

**Usage in tests:**
```typescript
import {
  FRESH_INSTALL_ITEMS,
  ALL_READY_CLAUDE_ONLY,
} from '../../test/fixtures/setup';

describe('areDependenciesReady', () => {
  it('returns false when deps are not met', () => {
    expect(areDependenciesReady('node', FRESH_INSTALL_ITEMS)).toBe(false);
  });

  it('returns true when all deps are ready', () => {
    expect(areDependenciesReady('node', ALL_READY_CLAUDE_ONLY)).toBe(true);
  });
});
```

**Location:**
- `src/test/fixtures/` directory
- One file per domain: `setup.ts`, `project.ts`, etc.
- Exported as named constants for clarity

## Coverage

**Requirements:** No minimum enforced, but aim for 80%+ on critical paths

**View Coverage:**
```bash
pnpm test:coverage

# Open HTML report
open coverage/index.html
```

**Coverage config (vitest.config.ts):**
- Provider: v8
- Reporters: text, json, html
- Excludes: node_modules, src/test/, *.d.ts, main.tsx

**Gaps to prioritize:**
- Integration logic (multiple modules interacting)
- Error paths and edge cases
- Setup/onboarding wizard (user-facing flow)
- Branch and git operations (critical for app)

## Test Types

**Unit Tests:**
- Test single functions/utilities in isolation
- No external dependencies
- Minimal mocking
- Fast execution

Example: `src/lib/polling.test.ts` tests `ExponentialPoller` class directly with fake timers

```typescript
it('should apply exponential backoff on errors', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('Failed'));
  const poller = new ExponentialPoller(fetcher, onResult, {
    initialInterval: 1000,
    maxInterval: 10000,
    multiplier: 2,
  });

  poller.start();
  await vi.advanceTimersByTimeAsync(0);

  expect(onResult).toHaveBeenLastCalledWith(
    expect.objectContaining({ attempt: 1, nextInterval: 2000 })
  );
});
```

**Integration Tests:**
- Test multiple modules together
- Mock external APIs (Tauri, plugins)
- Verify state transitions and side effects
- Slower but more realistic

Example: `src/components/setup/OnboardingScreen.test.tsx` tests wizard flow with mocked Tauri IPC and terminal component

```typescript
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn((cmd: string) => {
    const result = invokeResults.get(cmd);
    if (result?.error) return Promise.reject(result.error);
    return Promise.resolve(result?.value);
  }),
}));

it('should transition through steps on success', async () => {
  mockInvoke('quick_setup_check', { setup_complete_cached: false });
  mockInvoke('get_full_setup_status', { all_ready: false, items: [...] });

  const { rerender } = render(<OnboardingScreen onComplete={onComplete} />);

  // Step through wizard
  // Assertions on state transitions
});
```

**E2E Tests:** Not currently implemented in codebase

## Common Patterns

**Async Testing with Fake Timers:**

```typescript
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('should retry with backoff', async () => {
  let callCount = 0;
  const fn = vi.fn().mockImplementation(() => {
    callCount++;
    if (callCount < 3) return Promise.reject(new Error('Failed'));
    return Promise.resolve('success');
  });

  const resultPromise = retryWithBackoff(fn, {
    maxRetries: 5,
    initialDelay: 100,
    multiplier: 2,
  });

  // Advance through retries
  await vi.advanceTimersByTimeAsync(0);     // First call
  await vi.advanceTimersByTimeAsync(100);   // Wait + second call
  await vi.advanceTimersByTimeAsync(200);   // Wait + third call (success)

  const result = await resultPromise;
  expect(result).toBe('success');
  expect(fn).toHaveBeenCalledTimes(3);
});
```

**Component Testing with React Testing Library:**

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

describe('BranchIndicator', () => {
  const defaultProps = {
    currentBranch: 'feature/test',
    hasUncommittedChanges: false,
    changedFiles: [],
    projectPath: '/path/to/project',
    isOnBranchesTab: false,
    onClick: vi.fn(),
  };

  it('should render the current branch name', () => {
    render(<BranchIndicator {...defaultProps} />);
    expect(screen.getByText('feature/test')).toBeInTheDocument();
  });

  it('should show "Unsaved" badge when there are uncommitted changes', () => {
    render(
      <BranchIndicator
        {...defaultProps}
        hasUncommittedChanges={true}
        changedFiles={[{ path: 'test.txt', status: 'modified' }]}
      />
    );
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
  });

  it('should call onClick when button is clicked', () => {
    const onClick = vi.fn();
    render(<BranchIndicator {...defaultProps} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('should show changes dropdown on hover', () => {
    render(
      <BranchIndicator
        {...defaultProps}
        hasUncommittedChanges={true}
        changedFiles={[
          { path: 'src/test.ts', status: 'modified' },
          { path: 'README.md', status: 'added' },
        ]}
      />
    );

    const indicator = screen.getByText('feature/test').closest('.branch-indicator');
    if (indicator) {
      fireEvent.mouseEnter(indicator);
    }

    expect(screen.getByText('2 Unsaved Changes')).toBeInTheDocument();
    expect(screen.getByText('test.ts')).toBeInTheDocument();
  });
});
```

**Error Testing:**

```typescript
it('should throw after maxRetries', async () => {
  const fn = vi.fn().mockRejectedValue(new Error('Always fails'));

  const resultPromise = retryWithBackoff(fn, {
    maxRetries: 3,
    initialDelay: 100,
    multiplier: 2,
  });

  // Attach catch handler to prevent unhandled rejection warning
  void resultPromise.catch(() => {});

  await vi.advanceTimersByTimeAsync(0);   // First call
  await vi.advanceTimersByTimeAsync(100); // Second call
  await vi.advanceTimersByTimeAsync(200); // Third call

  // Assert on the promise rejection
  await expect(resultPromise).rejects.toThrow('Always fails');
  expect(fn).toHaveBeenCalledTimes(3);
});
```

**Testing with waitFor (for async state changes):**

```typescript
it('should show status after async load', async () => {
  mockInvoke('get_status', Promise.resolve({ ready: true }));

  render(<StatusComponent />);

  // Wait for async state to settle
  await waitFor(() => {
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
});
```

---

*Testing analysis: 2026-02-28*
