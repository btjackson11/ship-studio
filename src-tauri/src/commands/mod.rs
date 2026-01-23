//! # Tauri Commands
//!
//! This module re-exports all Tauri command handlers organized by category.

pub mod env;
pub mod claude;
pub mod pty;
pub mod ide;
pub mod github;
pub mod vercel;
pub mod git;
pub mod publishing;
pub mod pull_requests;
pub mod conflicts;
pub mod projects;
pub mod setup;

// Re-export all commands for easy access in lib.rs
pub use env::*;
pub use claude::*;
pub use pty::*;
pub use ide::*;
pub use github::*;
pub use vercel::*;
pub use git::*;
pub use publishing::*;
pub use pull_requests::*;
pub use conflicts::*;
pub use projects::*;
pub use setup::*;
