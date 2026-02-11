//! # Agent Configuration
//!
//! Defines the agent abstraction layer. All agent-specific values (binary names,
//! flags, auth indicators, etc.) are centralized here so the rest of the codebase
//! is agent-agnostic.
//!
//! Currently only Claude Code is supported. Additional agents (Codex, Opencode,
//! Gemini CLI) can be added by defining new `AgentConfig` consts and updating
//! `get_active_agent()`.

/// Configuration for an AI coding agent integrated with Ship Studio.
pub struct AgentConfig {
    /// Unique identifier (e.g., "claude-code")
    pub id: &'static str,
    /// Human-readable name (e.g., "Claude Code")
    pub display_name: &'static str,
    /// Binary name to search for in PATH (e.g., "claude")
    pub binary_name: &'static str,
    /// Process name for `pgrep`/`pkill` (e.g., "claude")
    pub process_name: &'static str,
    /// Flag to check version (e.g., "--version")
    pub version_flag: &'static str,
    /// Flags for non-interactive print mode (e.g., ["--print", "-p"])
    pub print_mode_flags: &'static [&'static str],
    /// Flag to skip permission prompts, if supported
    pub auto_accept_flag: Option<&'static str>,
    /// Args to trigger authentication (e.g., ["--print", "hello"])
    pub auth_trigger_args: &'static [&'static str],
    /// Config directory under home (e.g., ".claude")
    pub auth_config_dir: &'static str,
    /// Files/dirs whose existence indicates authentication (e.g., ["settings.json", "statsig", "projects"])
    pub auth_indicators: &'static [&'static str],
    /// Agent ID for the skills CLI `--agent` flag
    pub skills_agent_id: Option<&'static str>,
    /// Subdirectory name for skills within the config dir
    pub skills_dir_name: Option<&'static str>,
    /// Unix install command (piped to bash)
    pub install_command_unix: Option<&'static str>,
    /// Windows install message (manual download)
    pub install_message_windows: Option<&'static str>,
    /// Setup item IDs: (binary_id, auth_id)
    pub setup_item_ids: (&'static str, &'static str),
    /// Setup display names: (binary_name, auth_name)
    pub setup_display_names: (&'static str, &'static str),
}

/// Claude Code agent configuration.
pub const CLAUDE_CODE: AgentConfig = AgentConfig {
    id: "claude-code",
    display_name: "Claude Code",
    binary_name: "claude",
    process_name: "claude",
    version_flag: "--version",
    print_mode_flags: &["--print", "-p"],
    auto_accept_flag: Some("--dangerously-skip-permissions"),
    auth_trigger_args: &["--print", "hello"],
    auth_config_dir: ".claude",
    auth_indicators: &["settings.json", "statsig", "projects"],
    skills_agent_id: Some("claude-code"),
    skills_dir_name: Some("skills"),
    install_command_unix: Some("curl -fsSL https://claude.ai/install.sh | bash"),
    install_message_windows: Some(
        "Please download Claude Code from https://claude.ai and run the installer.",
    ),
    setup_item_ids: ("claude", "claude_auth"),
    setup_display_names: ("Claude Code", "Claude Account"),
};

/// Codex agent configuration.
pub const CODEX: AgentConfig = AgentConfig {
    id: "codex",
    display_name: "Codex",
    binary_name: "codex",
    process_name: "codex",
    version_flag: "--version",
    print_mode_flags: &[],
    auto_accept_flag: Some("--yolo"),
    auth_trigger_args: &[],
    auth_config_dir: ".codex",
    auth_indicators: &["auth.json"],
    skills_agent_id: Some("codex"),
    skills_dir_name: Some("skills"),
    install_command_unix: Some("npm install -g @openai/codex"),
    install_message_windows: Some("Install Codex: npm install -g @openai/codex"),
    setup_item_ids: ("codex", "codex_auth"),
    setup_display_names: ("Codex", "Codex Account"),
};

/// Returns the currently active agent configuration.
///
/// For now this always returns `CLAUDE_CODE`. In the future, this could read
/// from a config file or environment variable to support multiple agents.
pub fn get_active_agent() -> &'static AgentConfig {
    &CLAUDE_CODE
}

/// Look up an agent by its unique ID. Falls back to `CLAUDE_CODE` if unrecognized.
pub fn get_agent_by_id(id: &str) -> &'static AgentConfig {
    match id {
        "codex" => &CODEX,
        _ => &CLAUDE_CODE,
    }
}
