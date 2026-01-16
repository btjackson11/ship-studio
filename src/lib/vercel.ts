import { invoke } from "@tauri-apps/api/core";

export interface VercelCliStatus {
  installed: boolean;
  authenticated: boolean;
}

export interface ProjectVercelStatus {
  is_linked: boolean;
  project_name: string | null;
  production_url: string | null;
}

export async function checkVercelCliStatus(): Promise<VercelCliStatus> {
  return invoke<VercelCliStatus>("check_vercel_cli_status");
}

export async function getVercelUsername(): Promise<string> {
  return invoke<string>("get_vercel_username");
}

export async function getProjectVercelStatus(projectPath: string): Promise<ProjectVercelStatus> {
  return invoke<ProjectVercelStatus>("get_project_vercel_status", { projectPath });
}

export async function installVercelCli(): Promise<void> {
  return invoke("install_vercel_cli");
}

export interface LinkToVercelOptions {
  projectPath: string;
  githubRepo: string; // e.g., "username/repo-name"
}

export async function linkToVercel(options: LinkToVercelOptions): Promise<string> {
  return invoke<string>("link_to_vercel", { options });
}

export interface DeployToVercelOptions {
  projectPath: string;
  projectName: string;
  githubRepo?: string;
}

export async function deployToVercel(options: DeployToVercelOptions): Promise<string> {
  return invoke<string>("deploy_to_vercel", { options });
}
