import { invoke } from "@tauri-apps/api/core";

export interface ClaudeCliStatus {
  installed: boolean;
  version: string | null;
}

export async function checkClaudeCliStatus(): Promise<ClaudeCliStatus> {
  return invoke<ClaudeCliStatus>("check_claude_cli_status");
}

export async function installClaudeCli(): Promise<void> {
  return invoke("install_claude_cli");
}
