use headless_chrome::{Browser, LaunchOptions};
use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::Command;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

struct AppState {
    sessions: Mutex<HashMap<u32, Arc<Mutex<PtySession>>>>,
    next_id: Mutex<u32>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            next_id: Mutex::new(1),
        }
    }
}

#[derive(Clone, Serialize)]
struct PtyOutput {
    id: u32,
    data: String,
}

#[derive(Clone, Serialize)]
struct PtyExit {
    id: u32,
    code: Option<u32>,
}

#[tauri::command]
async fn spawn_pty(
    app: AppHandle,
    state: State<'_, AppState>,
    cwd: String,
    command: Option<String>,
    args: Option<Vec<String>>,
    rows: Option<u16>,
    cols: Option<u16>,
) -> Result<u32, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: rows.unwrap_or(24),
            cols: cols.unwrap_or(80),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let cmd_name = command.unwrap_or_else(|| {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    });

    let mut cmd = CommandBuilder::new(&cmd_name);
    if let Some(ref args_vec) = args {
        for arg in args_vec {
            cmd.arg(arg);
        }
    }
    cmd.cwd(&cwd);

    // Inherit environment
    for (key, value) in std::env::vars() {
        cmd.env(key, value);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_ALL", "en_US.UTF-8");
    cmd.env("LC_CTYPE", "en_US.UTF-8");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;

    // Get reader before moving master
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    // Get writer before moving master
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let id = {
        let mut next_id = state.next_id.lock();
        let id = *next_id;
        *next_id += 1;
        id
    };

    let session = Arc::new(Mutex::new(PtySession {
        master: pair.master,
        writer,
        child,
    }));

    {
        let mut sessions = state.sessions.lock();
        sessions.insert(id, Arc::clone(&session));
    }

    // Spawn reader thread
    let app_clone = app.clone();
    let session_clone = Arc::clone(&session);
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit("pty-output", PtyOutput { id, data });
                }
                Err(_) => break,
            }
        }

        // Process exited, get exit code
        let exit_code = {
            let mut session = session_clone.lock();
            session.child.wait().ok().map(|s| s.exit_code())
        };

        let _ = app_clone.emit("pty-exit", PtyExit { id, code: exit_code });
    });

    Ok(id)
}

#[tauri::command]
async fn write_pty(
    state: State<'_, AppState>,
    id: u32,
    data: String,
) -> Result<(), String> {
    let session = {
        let sessions = state.sessions.lock();
        sessions.get(&id).cloned()
    };

    match session {
        Some(session) => {
            let mut session = session.lock();
            session.writer
                .write_all(data.as_bytes())
                .map_err(|e| e.to_string())?;
            session.writer.flush().map_err(|e| e.to_string())?;
            Ok(())
        }
        None => Err(format!("PTY session {} not found", id)),
    }
}

#[tauri::command]
async fn resize_pty(
    state: State<'_, AppState>,
    id: u32,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let session = {
        let sessions = state.sessions.lock();
        sessions.get(&id).cloned()
    };

    match session {
        Some(session) => {
            let session = session.lock();
            session
                .master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        None => Err(format!("PTY session {} not found", id)),
    }
}

#[tauri::command]
async fn kill_pty(state: State<'_, AppState>, id: u32) -> Result<(), String> {
    let session = {
        let mut sessions = state.sessions.lock();
        sessions.remove(&id)
    };

    match session {
        Some(session) => {
            let mut session = session.lock();
            session.child.kill().map_err(|e| e.to_string())?;
            Ok(())
        }
        None => Err(format!("PTY session {} not found", id)),
    }
}

#[derive(Serialize)]
struct PrerequisiteCheck {
    name: String,
    available: bool,
    path: Option<String>,
}

#[tauri::command]
async fn check_prerequisites() -> Vec<PrerequisiteCheck> {
    let commands = vec!["node", "npm", "git", "claude"];
    let mut results = Vec::new();

    for cmd in commands {
        let (available, path) = match which::which(cmd) {
            Ok(p) => (true, Some(p.to_string_lossy().to_string())),
            Err(_) => (false, None),
        };
        results.push(PrerequisiteCheck {
            name: cmd.to_string(),
            available,
            path,
        });
    }

    results
}

#[tauri::command]
async fn get_maros_dir() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let maros_dir = home.join("MarOS");
    Ok(maros_dir.to_string_lossy().to_string())
}

#[tauri::command]
async fn ensure_maros_dir() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let maros_dir = home.join("MarOS");

    if !maros_dir.exists() {
        std::fs::create_dir_all(&maros_dir).map_err(|e| e.to_string())?;
    }

    Ok(maros_dir.to_string_lossy().to_string())
}

#[derive(Serialize)]
struct ProjectInfo {
    name: String,
    path: String,
    thumbnail: Option<String>,
}

#[tauri::command]
async fn delete_project(path: String) -> Result<(), String> {
    let project_path = std::path::Path::new(&path);

    // Safety check: only allow deleting from MarOS directory
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let maros_dir = home.join("MarOS");

    if !project_path.starts_with(&maros_dir) {
        return Err("Can only delete projects from MarOS directory".to_string());
    }

    if !project_path.exists() {
        return Err("Project not found".to_string());
    }

    std::fs::remove_dir_all(project_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
struct PageInfo {
    route: String,
    file_path: String,
}

#[tauri::command]
async fn list_pages(project_path: String) -> Result<Vec<PageInfo>, String> {
    let project = std::path::Path::new(&project_path);
    let app_dir = project.join("app");

    if !app_dir.exists() {
        // Try src/app for projects with src directory
        let src_app_dir = project.join("src").join("app");
        if !src_app_dir.exists() {
            return Ok(Vec::new());
        }
        return scan_pages(&src_app_dir, &src_app_dir);
    }

    scan_pages(&app_dir, &app_dir)
}

fn scan_pages(dir: &std::path::Path, base_dir: &std::path::Path) -> Result<Vec<PageInfo>, String> {
    let mut pages = Vec::new();

    if !dir.exists() {
        return Ok(pages);
    }

    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.is_dir() {
            // Skip special Next.js directories
            let dir_name = entry.file_name().to_string_lossy().to_string();
            if dir_name.starts_with('_') || dir_name.starts_with('.') || dir_name == "api" {
                continue;
            }

            // Recursively scan subdirectories
            let mut sub_pages = scan_pages(&path, base_dir)?;
            pages.append(&mut sub_pages);
        } else {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name == "page.tsx" || file_name == "page.js" || file_name == "page.jsx" {
                // Calculate route from path
                let parent = path.parent().unwrap_or(&path);
                let relative = parent.strip_prefix(base_dir).unwrap_or(parent);
                let route = if relative.as_os_str().is_empty() {
                    "/".to_string()
                } else {
                    format!("/{}", relative.to_string_lossy().replace('\\', "/"))
                };

                // Handle dynamic routes - convert [param] to :param for display
                let display_route = route
                    .replace('[', ":")
                    .replace(']', "");

                pages.push(PageInfo {
                    route: display_route,
                    file_path: path.to_string_lossy().to_string(),
                });
            }
        }
    }

    // Sort pages alphabetically, with "/" first
    pages.sort_by(|a, b| {
        if a.route == "/" { return std::cmp::Ordering::Less; }
        if b.route == "/" { return std::cmp::Ordering::Greater; }
        a.route.cmp(&b.route)
    });

    Ok(pages)
}

#[tauri::command]
async fn list_projects() -> Result<Vec<ProjectInfo>, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let maros_dir = home.join("MarOS");

    if !maros_dir.exists() {
        return Ok(Vec::new());
    }

    let mut projects = Vec::new();
    let entries = std::fs::read_dir(&maros_dir).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            // Check if it's a valid project (has package.json)
            if path.join("package.json").exists() {
                // Check for thumbnail
                let thumbnail_path = path.join(".maros").join("thumbnail.png");
                let thumbnail = if thumbnail_path.exists() {
                    Some(thumbnail_path.to_string_lossy().to_string())
                } else {
                    None
                };

                projects.push(ProjectInfo {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: path.to_string_lossy().to_string(),
                    thumbnail,
                });
            }
        }
    }

    Ok(projects)
}

#[tauri::command]
async fn capture_project_thumbnail(project_path: String, url: String) -> Result<String, String> {
    let project = std::path::Path::new(&project_path);
    let maros_dir = project.join(".maros");

    // Ensure .maros directory exists
    if !maros_dir.exists() {
        std::fs::create_dir_all(&maros_dir).map_err(|e| e.to_string())?;
    }

    let thumbnail_path = maros_dir.join("thumbnail.png");

    // Launch headless browser and capture screenshot
    let launch_options = LaunchOptions::default_builder()
        .headless(true)
        .window_size(Some((1200, 800)))
        .build()
        .map_err(|e| e.to_string())?;

    let browser = Browser::new(launch_options).map_err(|e| e.to_string())?;
    let tab = browser.new_tab().map_err(|e| e.to_string())?;

    // Navigate to the URL
    tab.navigate_to(&url).map_err(|e| e.to_string())?;

    // Wait for page to load
    tab.wait_until_navigated().map_err(|e| e.to_string())?;
    std::thread::sleep(Duration::from_millis(1500)); // Extra time for JS rendering

    // Capture screenshot
    let screenshot = tab
        .capture_screenshot(
            headless_chrome::protocol::cdp::Page::CaptureScreenshotFormatOption::Png,
            None,
            None,
            true,
        )
        .map_err(|e| e.to_string())?;

    // Save to file
    std::fs::write(&thumbnail_path, &screenshot).map_err(|e| e.to_string())?;

    Ok(thumbnail_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn get_project_thumbnail(project_path: String) -> Result<Option<String>, String> {
    let project = std::path::Path::new(&project_path);
    let thumbnail_path = project.join(".maros").join("thumbnail.png");

    if thumbnail_path.exists() {
        // Return as base64 data URL for easy display
        use base64::Engine;
        let data = std::fs::read(&thumbnail_path).map_err(|e| e.to_string())?;
        let base64_data = base64::engine::general_purpose::STANDARD.encode(&data);
        Ok(Some(format!("data:image/png;base64,{}", base64_data)))
    } else {
        Ok(None)
    }
}

// ============ GitHub Integration ============

#[derive(Serialize)]
struct GitHubCliStatus {
    installed: bool,
    authenticated: bool,
}

#[tauri::command]
async fn check_github_cli_status() -> GitHubCliStatus {
    // Check if gh CLI is installed
    let installed = which::which("gh").is_ok();

    if !installed {
        return GitHubCliStatus {
            installed: false,
            authenticated: false,
        };
    }

    // Check if authenticated
    let authenticated = Command::new("gh")
        .args(["auth", "status"])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);

    GitHubCliStatus {
        installed,
        authenticated,
    }
}

#[tauri::command]
async fn get_github_username() -> Result<String, String> {
    let output = Command::new("gh")
        .args(["api", "user", "--jq", ".login"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err("Failed to get GitHub username".to_string());
    }

    let username = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(username)
}

#[derive(Serialize)]
struct ProjectGitHubStatus {
    is_git_repo: bool,
    has_remote: bool,
    github_repo: Option<String>,  // e.g., "username/repo-name"
    github_url: Option<String>,   // e.g., "https://github.com/username/repo-name"
}

#[tauri::command]
async fn get_project_github_status(project_path: String) -> ProjectGitHubStatus {
    let project = std::path::Path::new(&project_path);
    let git_dir = project.join(".git");

    // Check if it's a git repo
    if !git_dir.exists() {
        return ProjectGitHubStatus {
            is_git_repo: false,
            has_remote: false,
            github_repo: None,
            github_url: None,
        };
    }

    // Check for GitHub remote
    let output = Command::new("git")
        .args(["remote", "-v"])
        .current_dir(&project_path)
        .output();

    match output {
        Ok(output) => {
            let remotes = String::from_utf8_lossy(&output.stdout);

            // Look for github.com in remotes
            if remotes.contains("github.com") {
                // Extract repo name from remote URL
                // Handles both HTTPS and SSH formats:
                // https://github.com/user/repo.git
                // git@github.com:user/repo.git
                let repo = remotes.lines()
                    .find(|line| line.contains("github.com") && line.contains("(push)"))
                    .and_then(|line| {
                        // Try HTTPS format first
                        if let Some(start) = line.find("github.com/") {
                            let rest = &line[start + 11..];
                            let end = rest.find(".git").unwrap_or(rest.find(' ').unwrap_or(rest.len()));
                            return Some(rest[..end].to_string());
                        }
                        // Try SSH format
                        if let Some(start) = line.find("github.com:") {
                            let rest = &line[start + 11..];
                            let end = rest.find(".git").unwrap_or(rest.find(' ').unwrap_or(rest.len()));
                            return Some(rest[..end].to_string());
                        }
                        None
                    });

                let github_url = repo.as_ref().map(|r| format!("https://github.com/{}", r));

                ProjectGitHubStatus {
                    is_git_repo: true,
                    has_remote: true,
                    github_repo: repo,
                    github_url,
                }
            } else {
                ProjectGitHubStatus {
                    is_git_repo: true,
                    has_remote: false,
                    github_repo: None,
                    github_url: None,
                }
            }
        }
        Err(_) => ProjectGitHubStatus {
            is_git_repo: true,
            has_remote: false,
            github_repo: None,
            github_url: None,
        },
    }
}

#[tauri::command]
async fn init_git_repo(project_path: String) -> Result<(), String> {
    // Initialize git repo
    let output = Command::new("git")
        .args(["init"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    // Stage all files
    let output = Command::new("git")
        .args(["add", "-A"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    // Create initial commit
    let output = Command::new("git")
        .args(["commit", "-m", "Initial commit from MarOS"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[tauri::command]
async fn check_git_has_changes(project_path: String) -> Result<bool, String> {
    let project = std::path::Path::new(&project_path);
    let git_dir = project.join(".git");

    // Not a git repo = no changes to track
    if !git_dir.exists() {
        return Ok(false);
    }

    // Check for uncommitted changes (staged or unstaged)
    let status = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| e.to_string())?;

    let has_uncommitted = !String::from_utf8_lossy(&status.stdout).trim().is_empty();

    if has_uncommitted {
        return Ok(true);
    }

    // Check for unpushed commits
    let unpushed = Command::new("git")
        .args(["log", "@{u}..", "--oneline"])
        .current_dir(&project_path)
        .output();

    // If this fails (no upstream), check if there are any commits at all
    match unpushed {
        Ok(output) => {
            let has_unpushed = !String::from_utf8_lossy(&output.stdout).trim().is_empty();
            Ok(has_unpushed)
        }
        Err(_) => {
            // No upstream set, check if we have commits
            let commits = Command::new("git")
                .args(["log", "--oneline", "-1"])
                .current_dir(&project_path)
                .output()
                .map_err(|e| e.to_string())?;

            Ok(!String::from_utf8_lossy(&commits.stdout).trim().is_empty())
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PushToGitHubOptions {
    project_path: String,
    repo_name: String,
    is_private: bool,
}

#[tauri::command]
async fn push_to_github(options: PushToGitHubOptions) -> Result<String, String> {
    let project_path = &options.project_path;
    let repo_name = &options.repo_name;
    let visibility = if options.is_private { "--private" } else { "--public" };

    // Check if it's already a git repo, if not initialize
    let git_dir = std::path::Path::new(project_path).join(".git");
    if !git_dir.exists() {
        init_git_repo(project_path.clone()).await?;
    } else {
        // Make sure all changes are committed
        let _ = Command::new("git")
            .args(["add", "-A"])
            .current_dir(project_path)
            .output();

        let status = Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(project_path)
            .output()
            .map_err(|e| e.to_string())?;

        if !String::from_utf8_lossy(&status.stdout).trim().is_empty() {
            let _ = Command::new("git")
                .args(["commit", "-m", "Update from MarOS"])
                .current_dir(project_path)
                .output();
        }
    }

    // Create GitHub repo and push
    let output = Command::new("gh")
        .args([
            "repo", "create", repo_name,
            visibility,
            "--source", ".",
            "--remote", "origin",
            "--push",
        ])
        .current_dir(project_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(stderr.to_string());
    }

    // Return the repo URL
    Ok(format!("https://github.com/{}", repo_name))
}

#[tauri::command]
async fn publish_to_github(project_path: String, commit_message: Option<String>) -> Result<(), String> {
    let message = commit_message.unwrap_or_else(|| "Update from MarOS".to_string());

    // Get current branch name
    let branch_output = Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| e.to_string())?;

    let branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();
    let branch = if branch.is_empty() { "main".to_string() } else { branch };

    // Pull latest changes first (rebase to keep history clean)
    let pull_output = Command::new("git")
        .args(["pull", "--rebase", "origin", &branch])
        .current_dir(&project_path)
        .output();

    // Ignore pull errors (might be first push, or no tracking branch yet)
    if let Ok(output) = pull_output {
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Only fail if it's not a "no tracking" or "couldn't find remote" error
            if !stderr.contains("no tracking")
                && !stderr.contains("Couldn't find remote ref")
                && !stderr.contains("There is no tracking information") {
                // Log but don't fail - we'll try to push anyway
            }
        }
    }

    // Stage all changes
    let output = Command::new("git")
        .args(["add", "-A"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    // Check if there are changes to commit
    let status = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| e.to_string())?;

    let has_changes = !String::from_utf8_lossy(&status.stdout).trim().is_empty();

    if has_changes {
        // Commit changes
        let output = Command::new("git")
            .args(["commit", "-m", &message])
            .current_dir(&project_path)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
    }

    // Push to origin
    let output = Command::new("git")
        .args(["push", "-u", "origin", &branch])
        .current_dir(&project_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Check if it's a "nothing to push" situation (which isn't really an error)
        if !stderr.contains("Everything up-to-date") {
            return Err(stderr.to_string());
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            spawn_pty,
            write_pty,
            resize_pty,
            kill_pty,
            check_prerequisites,
            get_maros_dir,
            ensure_maros_dir,
            list_projects,
            list_pages,
            delete_project,
            capture_project_thumbnail,
            get_project_thumbnail,
            // GitHub integration
            check_github_cli_status,
            get_github_username,
            get_project_github_status,
            check_git_has_changes,
            init_git_repo,
            push_to_github,
            publish_to_github,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
