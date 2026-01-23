//! # Setup/Onboarding Commands
//!
//! Commands for the setup wizard and onboarding flow.

use std::collections::HashSet;
use std::process::Command;
use std::sync::Mutex;
use tauri::Emitter;
use crate::types::{FullSetupStatus, SetupItemInfo, SetupItemStatus};
use crate::utils::{find_executable, get_brew_command, check_homebrew};
use crate::commands::claude::find_claude_binary;
use crate::commands::vercel::{find_vercel_binary, get_vercel_command};
use crate::commands::github::get_gh_command;

// Mock state for testing - tracks which items have been "installed" in debug mode
lazy_static::lazy_static! {
    static ref MOCK_INSTALLED: Mutex<HashSet<String>> = Mutex::new(HashSet::new());
}

/// Check if we're in mock/debug mode
pub fn is_mock_mode() -> bool {
    std::env::var("MARKETINGSTACK_FORCE_SETUP").is_ok()
}

/// Mark an item as mock-installed (for testing)
pub fn mock_install(item_id: &str) {
    if let Ok(mut set) = MOCK_INSTALLED.lock() {
        set.insert(item_id.to_string());
    }
}

/// Check if an item is mock-installed
fn is_mock_installed(item_id: &str) -> bool {
    MOCK_INSTALLED.lock().map(|set| set.contains(item_id)).unwrap_or(false)
}

/// Get full setup status for all items
#[tauri::command]
pub async fn get_full_setup_status() -> FullSetupStatus {
    // Debug/mock mode: return mock state for testing onboarding flow
    if is_mock_mode() {
        let items = vec![
            ("homebrew", "Package Manager", None),
            ("node", "Node.js", Some("homebrew")),
            ("git", "Git", Some("homebrew")),
            ("gh", "GitHub CLI", Some("homebrew")),
            ("gh_auth", "GitHub Account", Some("gh")),
            ("claude", "Claude Code", None),
            ("claude_auth", "Claude Account", Some("claude")),
            ("vercel", "Vercel CLI", Some("node")),
            ("vercel_auth", "Vercel Account", Some("vercel")),
        ];

        let mock_items: Vec<SetupItemInfo> = items.iter().map(|(id, name, dep)| {
            let is_ready = is_mock_installed(id);
            let dep_ready = dep.map(|d| is_mock_installed(d)).unwrap_or(true);
            let is_auth = id.ends_with("_auth");

            SetupItemInfo {
                id: id.to_string(),
                friendly_name: name.to_string(),
                status: if is_ready {
                    SetupItemStatus::Ready
                } else if !dep_ready {
                    SetupItemStatus::NotInstalled
                } else if is_auth {
                    SetupItemStatus::NotAuthenticated
                } else {
                    SetupItemStatus::NotInstalled
                },
                version: if is_ready && !is_auth { Some("mock-1.0.0".to_string()) } else { None },
                username: if is_ready && is_auth { Some("mock-user".to_string()) } else { None },
                error_message: None,
            }
        }).collect();

        let all_ready = mock_items.iter().all(|i| matches!(i.status, SetupItemStatus::Ready));
        return FullSetupStatus { all_ready, items: mock_items };
    }

    let mut items = Vec::new();

    // 1. Homebrew
    let (brew_installed, brew_version) = check_homebrew();
    items.push(SetupItemInfo {
        id: "homebrew".to_string(),
        friendly_name: "Package Manager".to_string(),
        status: if brew_installed { SetupItemStatus::Ready } else { SetupItemStatus::NotInstalled },
        version: brew_version,
        username: None,
        error_message: None,
    });

    // 2. Node.js
    let node_path = find_executable("node");
    let node_version = node_path.as_ref().and_then(|p| {
        Command::new(p).args(["--version"]).output().ok().and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
    });
    items.push(SetupItemInfo {
        id: "node".to_string(),
        friendly_name: "Node.js".to_string(),
        status: if node_path.is_some() { SetupItemStatus::Ready } else { SetupItemStatus::NotInstalled },
        version: node_version,
        username: None,
        error_message: None,
    });

    // 3. Git
    let git_path = find_executable("git");
    let git_version = git_path.as_ref().and_then(|p| {
        Command::new(p).args(["--version"]).output().ok().and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
    });
    items.push(SetupItemInfo {
        id: "git".to_string(),
        friendly_name: "Git".to_string(),
        status: if git_path.is_some() { SetupItemStatus::Ready } else { SetupItemStatus::NotInstalled },
        version: git_version,
        username: None,
        error_message: None,
    });

    // 4. GitHub CLI
    let gh_path = find_executable("gh");
    let gh_version = gh_path.as_ref().and_then(|p| {
        Command::new(p).args(["--version"]).output().ok().and_then(|o| {
            if o.status.success() {
                let out = String::from_utf8_lossy(&o.stdout);
                out.lines().next().map(|s| s.trim().to_string())
            } else {
                None
            }
        })
    });
    items.push(SetupItemInfo {
        id: "gh".to_string(),
        friendly_name: "GitHub CLI".to_string(),
        status: if gh_path.is_some() { SetupItemStatus::Ready } else { SetupItemStatus::NotInstalled },
        version: gh_version,
        username: None,
        error_message: None,
    });

    // 5. GitHub Auth
    let gh_auth = if gh_path.is_some() {
        get_gh_command()
            .args(["auth", "status"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    } else {
        false
    };
    let gh_username = if gh_auth {
        get_gh_command()
            .args(["api", "user", "--jq", ".login"])
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                } else {
                    None
                }
            })
    } else {
        None
    };
    items.push(SetupItemInfo {
        id: "gh_auth".to_string(),
        friendly_name: "GitHub Account".to_string(),
        status: if gh_auth {
            SetupItemStatus::Ready
        } else if gh_path.is_some() {
            SetupItemStatus::NotAuthenticated
        } else {
            SetupItemStatus::NotInstalled
        },
        version: None,
        username: gh_username,
        error_message: None,
    });

    // 6. Claude Code
    let claude_path = find_claude_binary();
    let claude_version = claude_path.as_ref().and_then(|p| {
        Command::new(p).args(["--version"]).output().ok().and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
    });
    items.push(SetupItemInfo {
        id: "claude".to_string(),
        friendly_name: "Claude Code".to_string(),
        status: if claude_path.is_some() { SetupItemStatus::Ready } else { SetupItemStatus::NotInstalled },
        version: claude_version,
        username: None,
        error_message: None,
    });

    // 7. Claude Auth
    let claude_auth = if claude_path.is_some() {
        if let Some(home) = dirs::home_dir() {
            let claude_dir = home.join(".claude");
            claude_dir.exists() && claude_dir.join("settings.json").exists()
        } else {
            false
        }
    } else {
        false
    };
    items.push(SetupItemInfo {
        id: "claude_auth".to_string(),
        friendly_name: "Claude Account".to_string(),
        status: if claude_auth {
            SetupItemStatus::Ready
        } else if claude_path.is_some() {
            SetupItemStatus::NotAuthenticated
        } else {
            SetupItemStatus::NotInstalled
        },
        version: None,
        username: None,
        error_message: None,
    });

    // 8. Vercel CLI
    let vercel_path = find_vercel_binary();
    let vercel_version = vercel_path.as_ref().and_then(|p| {
        Command::new(p).args(["--version"]).output().ok().and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
    });
    items.push(SetupItemInfo {
        id: "vercel".to_string(),
        friendly_name: "Vercel CLI".to_string(),
        status: if vercel_path.is_some() { SetupItemStatus::Ready } else { SetupItemStatus::NotInstalled },
        version: vercel_version,
        username: None,
        error_message: None,
    });

    // 9. Vercel Auth
    let vercel_auth = if vercel_path.is_some() {
        get_vercel_command()
            .args(["whoami"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    } else {
        false
    };
    let vercel_username = if vercel_auth {
        get_vercel_command()
            .args(["whoami"])
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                } else {
                    None
                }
            })
    } else {
        None
    };
    items.push(SetupItemInfo {
        id: "vercel_auth".to_string(),
        friendly_name: "Vercel Account".to_string(),
        status: if vercel_auth {
            SetupItemStatus::Ready
        } else if vercel_path.is_some() {
            SetupItemStatus::NotAuthenticated
        } else {
            SetupItemStatus::NotInstalled
        },
        version: None,
        username: vercel_username,
        error_message: None,
    });

    let all_ready = items.iter().all(|i| matches!(i.status, SetupItemStatus::Ready));

    FullSetupStatus { all_ready, items }
}

/// Install Homebrew
#[tauri::command]
pub async fn install_homebrew(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app.emit("setup-progress", serde_json::json!({
        "itemId": "homebrew",
        "message": "Installing package manager..."
    }));

    if is_mock_mode() {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        mock_install("homebrew");
        return Ok(());
    }

    let output = Command::new("bash")
        .args(["-c", "/bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""])
        .env("NONINTERACTIVE", "1")
        .output()
        .map_err(|e| format!("Failed to run Homebrew installer: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Homebrew installation failed: {}", stderr));
    }

    Ok(())
}

/// Install Node.js via Homebrew
#[tauri::command]
pub async fn install_node_via_brew(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app.emit("setup-progress", serde_json::json!({
        "itemId": "node",
        "message": "Installing Node.js..."
    }));

    if is_mock_mode() {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        mock_install("node");
        return Ok(());
    }

    let brew = get_brew_command().ok_or("Homebrew not found")?;

    let output = Command::new(&brew)
        .args(["install", "node"])
        .output()
        .map_err(|e| format!("Failed to run brew: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to install Node.js: {}", stderr));
    }

    Ok(())
}

/// Install Git via Homebrew
#[tauri::command]
pub async fn install_git_via_brew(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app.emit("setup-progress", serde_json::json!({
        "itemId": "git",
        "message": "Installing Git..."
    }));

    if is_mock_mode() {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        mock_install("git");
        return Ok(());
    }

    let brew = get_brew_command().ok_or("Homebrew not found")?;

    let output = Command::new(&brew)
        .args(["install", "git"])
        .output()
        .map_err(|e| format!("Failed to run brew: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to install Git: {}", stderr));
    }

    Ok(())
}

/// Install GitHub CLI via Homebrew
#[tauri::command]
pub async fn install_gh_via_brew(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app.emit("setup-progress", serde_json::json!({
        "itemId": "gh",
        "message": "Installing GitHub CLI..."
    }));

    if is_mock_mode() {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        mock_install("gh");
        return Ok(());
    }

    let brew = get_brew_command().ok_or("Homebrew not found")?;

    let output = Command::new(&brew)
        .args(["install", "gh"])
        .output()
        .map_err(|e| format!("Failed to run brew: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to install GitHub CLI: {}", stderr));
    }

    Ok(())
}

/// Start GitHub authentication (opens browser)
#[tauri::command]
pub async fn start_github_auth(app: tauri::AppHandle) -> Result<String, String> {
    let _ = app.emit("setup-progress", serde_json::json!({
        "itemId": "gh_auth",
        "message": "Opening browser..."
    }));

    if is_mock_mode() {
        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
        mock_install("gh_auth");
        return Ok("Mock auth completed".to_string());
    }

    let gh_path = find_executable("gh").ok_or("GitHub CLI not installed")?;

    let child = Command::new(&gh_path)
        .args(["auth", "login", "--web", "--git-protocol", "https", "--clipboard"])
        .spawn()
        .map_err(|e| format!("Failed to start GitHub auth: {}", e))?;

    std::mem::forget(child);

    Ok("A code has been copied to your clipboard. Paste it in the browser to connect.".to_string())
}

/// Start Claude authentication
#[tauri::command]
pub async fn start_claude_auth(app: tauri::AppHandle) -> Result<String, String> {
    let _ = app.emit("setup-progress", serde_json::json!({
        "itemId": "claude_auth",
        "message": "Opening browser..."
    }));

    if is_mock_mode() {
        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
        mock_install("claude_auth");
        return Ok("Mock auth completed".to_string());
    }

    let claude_path = find_claude_binary().ok_or("Claude Code not installed")?;

    let child = Command::new(&claude_path)
        .args(["--print", "hello"])
        .spawn()
        .map_err(|e| format!("Failed to start Claude auth: {}", e))?;

    std::mem::forget(child);

    Ok("Browser opened. Log in to your Anthropic account to continue.".to_string())
}

/// Check if Claude is authenticated
#[tauri::command]
pub async fn check_claude_auth_status() -> bool {
    if is_mock_mode() {
        return is_mock_installed("claude_auth");
    }

    if find_claude_binary().is_none() {
        return false;
    }

    if let Some(home) = dirs::home_dir() {
        let settings_path = home.join(".claude").join("settings.json");
        return settings_path.exists();
    }

    false
}

/// Start Vercel authentication (opens browser)
#[tauri::command]
pub async fn start_vercel_auth(app: tauri::AppHandle) -> Result<String, String> {
    let _ = app.emit("setup-progress", serde_json::json!({
        "itemId": "vercel_auth",
        "message": "Opening browser..."
    }));

    if is_mock_mode() {
        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
        mock_install("vercel_auth");
        return Ok("Mock auth completed".to_string());
    }

    let child = get_vercel_command()
        .arg("login")
        .spawn()
        .map_err(|e| format!("Failed to start Vercel auth: {}", e))?;

    std::mem::forget(child);

    Ok("Browser opened. Log in to your Vercel account to continue.".to_string())
}
