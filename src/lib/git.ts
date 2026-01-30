/**
 * Git operations wrapper for Tauri backend.
 *
 * Provides TypeScript types and functions for interacting with
 * git status and change detection.
 *
 * @module lib/git
 */

import { invoke } from '@tauri-apps/api/core';

/** Status type for a changed file */
export type ChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed';

/** A file with uncommitted changes */
export interface ChangedFile {
  /** Relative file path from project root */
  path: string;
  /** Change type */
  status: ChangeStatus;
}

/** Diff information for a single file */
export interface FileDiff {
  /** Relative file path from project root */
  filePath: string;
  /** True if this is a newly added/untracked file */
  isNewFile: boolean;
  /** True if the file was deleted */
  isDeleted: boolean;
  /** True if this is a binary file */
  isBinary: boolean;
  /** The raw diff content (or full file content for new files) */
  content: string;
  /** Number of lines added */
  additions: number;
  /** Number of lines deleted */
  deletions: number;
}

/**
 * Gets list of files with uncommitted changes in a project.
 *
 * Uses `git status --porcelain -uno` to get changed tracked files.
 *
 * @param projectPath - Absolute path to the project
 * @returns Array of changed files with their status
 */
export async function getChangedFiles(projectPath: string): Promise<ChangedFile[]> {
  return invoke<ChangedFile[]>('get_changed_files', { projectPath });
}

/**
 * Gets the diff for a single uncommitted file.
 *
 * @param projectPath - Absolute path to the project
 * @param filePath - Relative path to the file from project root
 * @returns Diff information including raw diff content
 */
export async function getFileDiff(projectPath: string, filePath: string): Promise<FileDiff> {
  return invoke<FileDiff>('get_file_diff', { projectPath, filePath });
}

/**
 * Stage all changes and create a commit.
 *
 * @param projectPath - Absolute path to the project
 * @param message - Commit message
 * @returns true if a commit was made, false if nothing to commit
 */
export async function commitChanges(projectPath: string, message: string): Promise<boolean> {
  return invoke<boolean>('commit_changes', { projectPath, message });
}
