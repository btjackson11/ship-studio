/**
 * Code Health integration utilities.
 *
 * Provides functions for:
 * - Detecting available code quality scripts from package.json
 * - Running health checks (tests, linting, type checking, formatting)
 * - Retrieving and clearing stored health check results
 *
 * All operations use Tauri backend commands.
 *
 * @module lib/health
 */

import { invoke } from '@tauri-apps/api/core';

/** Package manager detected from lockfiles */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/** Script category for health checks */
export type ScriptCategory = 'test' | 'lint' | 'typecheck' | 'format';

/** A suggestion for adding a missing script */
export interface ScriptSuggestion {
  /** The category of the suggested script */
  category: ScriptCategory;
  /** The suggested script name to add */
  scriptName: string;
  /** The suggested script command */
  scriptCommand: string;
  /** Why this is suggested (e.g., "typescript is installed") */
  reason: string;
}

/** Available scripts detected from package.json */
export interface DetectedScripts {
  /** Package manager determined from lockfiles */
  packageManager: PackageManager;
  /** Test script name if found */
  test: string | null;
  /** Lint script name if found */
  lint: string | null;
  /** Type check script name if found */
  typecheck: string | null;
  /** Format check script name if found */
  format: string | null;
  /** Whether package.json exists in the project */
  hasPackageJson: boolean;
  /** Suggestions for scripts that could be added based on installed packages */
  suggestions: ScriptSuggestion[];
}

/** Result of running a health check script */
export interface HealthCheckResult {
  /** "pass" or "fail" */
  status: 'pass' | 'fail';
  /** ISO timestamp of last run */
  lastRun: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Full stdout output */
  stdout: string;
  /** Full stderr output */
  stderr: string;
  /** Exit code from the script */
  exitCode: number;
  /** The script name that was run */
  scriptName: string;
  /** The category of the check */
  category: ScriptCategory;
}

/** Stored health check status for all categories */
export interface HealthCheckStatus {
  test: HealthCheckResult | null;
  lint: HealthCheckResult | null;
  typecheck: HealthCheckResult | null;
  format: HealthCheckResult | null;
}

/**
 * Detect available health check scripts from a project's package.json.
 * @param projectPath - Absolute path to the project directory
 * @returns Detected scripts for each category
 */
export async function detectHealthScripts(projectPath: string): Promise<DetectedScripts> {
  return invoke<DetectedScripts>('detect_health_scripts', { projectPath });
}

/**
 * Run a health check script for a specific category.
 * @param projectPath - Absolute path to the project directory
 * @param category - Script category to run
 * @param scriptName - Name of the npm script to run
 * @returns Health check result with output and status
 */
export async function runHealthScript(
  projectPath: string,
  category: ScriptCategory,
  scriptName: string
): Promise<HealthCheckResult> {
  return invoke<HealthCheckResult>('run_health_script', {
    projectPath,
    category,
    scriptName,
  });
}

/**
 * Get stored health check status from project metadata.
 * @param projectPath - Absolute path to the project directory
 * @returns Stored health check results or null if none exist
 */
export async function getHealthStatus(projectPath: string): Promise<HealthCheckStatus | null> {
  return invoke<HealthCheckStatus | null>('get_health_status', { projectPath });
}

/**
 * Clear all stored health check results for a project.
 * @param projectPath - Absolute path to the project directory
 */
export async function clearHealthStatus(projectPath: string): Promise<void> {
  return invoke('clear_health_status', { projectPath });
}

/**
 * Get the raw package.json contents for a project.
 * @param projectPath - Absolute path to the project directory
 * @returns The package.json file contents as a string
 */
export async function getPackageJson(projectPath: string): Promise<string> {
  return invoke<string>('get_package_json', { projectPath });
}

/**
 * Get a human-readable relative time string.
 * @param isoTimestamp - ISO 8601 timestamp string
 * @returns Relative time string (e.g., "2 hours ago", "just now")
 */
export function formatRelativeTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec} seconds ago`;
  if (diffMin === 1) return '1 minute ago';
  if (diffMin < 60) return `${diffMin} minutes ago`;
  if (diffHour === 1) return '1 hour ago';
  if (diffHour < 24) return `${diffHour} hours ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;

  // For older dates, show the actual date
  return date.toLocaleDateString();
}

/**
 * Get the prompt prefix for asking Claude to fix errors.
 * Prompts are assertive about fixing ALL errors, regardless of who caused them.
 * @param category - Script category
 * @returns Formatted prompt prefix
 */
export function getFixPrompt(category: ScriptCategory): string {
  const fixAllNote =
    '\n\nIMPORTANT: Fix ALL errors and warnings listed above, not just some of them. Do not skip any. Even if you did not cause these errors, you must still fix them - the codebase needs to be error-free to ship.';

  switch (category) {
    case 'test':
      return `These tests are failing. Please investigate and fix every failing test:${fixAllNote}\n\nFailing tests:`;
    case 'lint':
      return `Fix these lint errors in my project. Address every single error and warning:${fixAllNote}\n\nLint errors:`;
    case 'typecheck':
      return `Fix these TypeScript errors in my project. Resolve every type error listed:${fixAllNote}\n\nTypeScript errors:`;
    case 'format':
      return `Fix these formatting issues in my project. Format all files that need formatting:${fixAllNote}\n\nFormatting issues:`;
  }
}

/**
 * Format a duration in milliseconds to a human-readable string.
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string (e.g., "1.2s", "250ms")
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}
