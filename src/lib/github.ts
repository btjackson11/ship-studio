import { invoke } from "@tauri-apps/api/core";

export interface GitHubCliStatus {
  installed: boolean;
  authenticated: boolean;
}

export interface ProjectGitHubStatus {
  is_git_repo: boolean;
  has_remote: boolean;
  github_repo: string | null;
  github_url: string | null;
}

export async function checkGitHubCliStatus(): Promise<GitHubCliStatus> {
  return invoke<GitHubCliStatus>("check_github_cli_status");
}

export async function getGitHubUsername(): Promise<string> {
  return invoke<string>("get_github_username");
}

export async function getProjectGitHubStatus(projectPath: string): Promise<ProjectGitHubStatus> {
  return invoke<ProjectGitHubStatus>("get_project_github_status", { projectPath });
}

export async function checkGitHasChanges(projectPath: string): Promise<boolean> {
  return invoke<boolean>("check_git_has_changes", { projectPath });
}

export async function initGitRepo(projectPath: string): Promise<void> {
  return invoke("init_git_repo", { projectPath });
}

export interface PushToGitHubOptions {
  projectPath: string;
  repoName: string;
  isPrivate: boolean;
}

export async function pushToGitHub(options: PushToGitHubOptions): Promise<string> {
  return invoke<string>("push_to_github", { options });
}

export async function publishToGitHub(projectPath: string, commitMessage?: string): Promise<void> {
  return invoke("publish_to_github", { projectPath, commitMessage });
}
