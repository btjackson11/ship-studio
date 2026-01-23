//! # Publishing Commands
//!
//! Commands for publishing to GitHub, staging, and production.

use std::process::Command;
use crate::types::PublishResult;
use crate::utils::validate_project_path;
use crate::commands::git::git_stage_and_commit;

#[tauri::command]
pub async fn publish_to_github(project_path: String, commit_message: Option<String>) -> Result<(), String> {
    let validated_path = validate_project_path(&project_path)?;
    let message = commit_message.unwrap_or_else(|| "Update from Marketingstack".to_string());

    // Get current branch name
    let branch_output = Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(&validated_path)
        .output()
        .map_err(|e| e.to_string())?;

    let branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();
    let branch = if branch.is_empty() { "main".to_string() } else { branch };

    // Pull latest changes first (rebase to keep history clean)
    let pull_output = Command::new("git")
        .args(["pull", "--rebase", "origin", &branch])
        .current_dir(&validated_path)
        .output();

    // Ignore pull errors (might be first push, or no tracking branch yet)
    if let Ok(output) = pull_output {
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
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
        .current_dir(&validated_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    // Check if there are changes to commit
    let status = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&validated_path)
        .output()
        .map_err(|e| e.to_string())?;

    let has_changes = !String::from_utf8_lossy(&status.stdout).trim().is_empty();

    if has_changes {
        // Commit changes
        let output = Command::new("git")
            .args(["commit", "-m", &message])
            .current_dir(&validated_path)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
    }

    // Push to origin
    let output = Command::new("git")
        .args(["push", "-u", "origin", &branch])
        .current_dir(&validated_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if !stderr.contains("Everything up-to-date") {
            return Err(stderr.to_string());
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn publish_to_staging(project_path: String) -> Result<PublishResult, String> {
    let validated_path = validate_project_path(&project_path)?;

    // Stage and commit any changes
    let _ = git_stage_and_commit(&validated_path, "Update from Marketingstack");

    // Push to staging branch - Vercel auto-deploys via GitHub integration
    let push_output = Command::new("git")
        .args(["push", "-f", "origin", "HEAD:staging"])
        .current_dir(&validated_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !push_output.status.success() {
        let stderr = String::from_utf8_lossy(&push_output.stderr);
        if !stderr.contains("Everything up-to-date") {
            return Err(stderr.to_string());
        }
    }

    Ok(PublishResult {
        url: String::new(),
        state: "QUEUED".to_string(),
    })
}

#[tauri::command]
pub async fn publish_to_production(project_path: String) -> Result<PublishResult, String> {
    let validated_path = validate_project_path(&project_path)?;

    // Stage and commit any changes
    let _ = git_stage_and_commit(&validated_path, "Update from Marketingstack");

    // Push to main branch - Vercel auto-deploys to production via GitHub integration
    let push_output = Command::new("git")
        .args(["push", "-u", "origin", "HEAD:main"])
        .current_dir(&validated_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !push_output.status.success() {
        let stderr = String::from_utf8_lossy(&push_output.stderr);
        if !stderr.contains("Everything up-to-date") {
            return Err(stderr.to_string());
        }
    }

    Ok(PublishResult {
        url: String::new(),
        state: "QUEUED".to_string(),
    })
}

/// Publish (push) the current branch to origin
#[tauri::command]
pub async fn publish_branch(project_path: String, commit_message: Option<String>) -> Result<PublishResult, String> {
    let validated_path = validate_project_path(&project_path)?;
    let message = commit_message.unwrap_or_else(|| "Updates from Marketingstack".to_string());

    // Get current branch name
    let branch_output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&validated_path)
        .output()
        .map_err(|e| e.to_string())?;

    let branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();

    // Stage all changes
    let _ = Command::new("git")
        .args(["add", "-A"])
        .current_dir(&validated_path)
        .output();

    // Check if there are changes to commit
    let status = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&validated_path)
        .output()
        .map_err(|e| e.to_string())?;

    let has_changes = !String::from_utf8_lossy(&status.stdout).trim().is_empty();

    if has_changes {
        // Commit changes
        let commit_output = Command::new("git")
            .args(["commit", "-m", &message])
            .current_dir(&validated_path)
            .output()
            .map_err(|e| e.to_string())?;

        if !commit_output.status.success() {
            let stderr = String::from_utf8_lossy(&commit_output.stderr);
            return Err(format!("Failed to commit: {}", stderr));
        }
    }

    // Push to origin
    let push_output = Command::new("git")
        .args(["push", "-u", "origin", &branch])
        .current_dir(&validated_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !push_output.status.success() {
        let stderr = String::from_utf8_lossy(&push_output.stderr);
        // Check for common errors
        if stderr.contains("rejected") || stderr.contains("non-fast-forward") {
            return Err(format!("PUSH_REJECTED:{}", stderr));
        }
        if stderr.contains("Permission denied") || stderr.contains("could not read Username") {
            return Err(format!("AUTH_ERROR:{}", stderr));
        }
        if !stderr.contains("Everything up-to-date") {
            return Err(stderr.to_string());
        }
    }

    Ok(PublishResult {
        url: String::new(),
        state: "QUEUED".to_string(),
    })
}
