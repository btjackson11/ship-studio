//! # PTY Terminal Commands
//!
//! Commands for pseudo-terminal management and port operations.

use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::Emitter;
use crate::types::SpawnPtyOptions;

/// Counter for generating unique PTY IDs
static PTY_ID_COUNTER: AtomicU32 = AtomicU32::new(1);

/// Spawns a command in a pseudo-terminal (PTY) and streams output to the frontend.
///
/// This is used to run Claude Code CLI in an interactive terminal environment.
/// The function:
/// 1. Generates a unique PTY ID for tracking
/// 2. Spawns the command in a separate thread to avoid blocking
/// 3. Streams stdout/stderr to the frontend via `pty-output` events
/// 4. Emits `pty-exit` event when the process terminates
///
/// Events emitted:
/// - `pty-output`: `{ id: u32, data: string }` - output chunks from the process
/// - `pty-exit`: `{ id: u32, code: i32 }` - process exit code
#[tauri::command]
pub async fn spawn_pty(app: tauri::AppHandle, options: SpawnPtyOptions) -> Result<u32, String> {
    let id = PTY_ID_COUNTER.fetch_add(1, Ordering::SeqCst);
    let app_handle = app.clone();

    std::thread::spawn(move || {
        let result = (|| -> Result<i32, String> {
            let mut child = Command::new(&options.command)
                .args(&options.args)
                .current_dir(&options.cwd)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| e.to_string())?;

            let stdout = child.stdout.take();
            let stderr = child.stderr.take();

            // Read stdout in a thread
            let app_for_stdout = app_handle.clone();
            let stdout_handle = if let Some(stdout) = stdout {
                Some(std::thread::spawn(move || {
                    let reader = BufReader::new(stdout);
                    for line in reader.lines() {
                        if let Ok(line) = line {
                            let _ = app_for_stdout.emit("pty-output", serde_json::json!({
                                "id": id,
                                "data": format!("{}\r\n", line)
                            }));
                        }
                    }
                }))
            } else {
                None
            };

            // Read stderr in a thread
            let app_for_stderr = app_handle.clone();
            let stderr_handle = if let Some(stderr) = stderr {
                Some(std::thread::spawn(move || {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines() {
                        if let Ok(line) = line {
                            let _ = app_for_stderr.emit("pty-output", serde_json::json!({
                                "id": id,
                                "data": format!("{}\r\n", line)
                            }));
                        }
                    }
                }))
            } else {
                None
            };

            // Wait for output threads
            if let Some(h) = stdout_handle {
                let _ = h.join();
            }
            if let Some(h) = stderr_handle {
                let _ = h.join();
            }

            // Wait for process to exit
            let status = child.wait().map_err(|e| e.to_string())?;
            Ok(status.code().unwrap_or(-1))
        })();

        // Emit exit event
        let exit_code = result.unwrap_or(-1);
        let _ = app_handle.emit("pty-exit", serde_json::json!({
            "id": id,
            "code": exit_code
        }));
    });

    Ok(id)
}

/// Kill any process listening on a specific port
#[tauri::command]
pub async fn kill_port(port: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        // Use lsof to find the PID listening on the port, then kill it
        let output = Command::new("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output()
            .map_err(|e| e.to_string())?;

        if output.status.success() {
            let pids = String::from_utf8_lossy(&output.stdout);
            for pid in pids.lines() {
                if let Ok(pid_num) = pid.trim().parse::<i32>() {
                    // Kill the process and its children
                    let _ = Command::new("kill")
                        .args(["-9", &pid_num.to_string()])
                        .output();
                }
            }
        }
    }

    #[cfg(not(unix))]
    {
        // Windows: use netstat and taskkill
        let _ = Command::new("cmd")
            .args(["/C", &format!("for /f \"tokens=5\" %a in ('netstat -aon ^| findstr :{} ^| findstr LISTENING') do taskkill /F /PID %a", port)])
            .output();
    }

    // Give processes time to die
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    Ok(())
}
