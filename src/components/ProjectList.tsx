import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { GitHubState } from "../App";

interface Project {
  name: string;
  path: string;
  thumbnail: string | null;
}

interface ProjectWithThumbnail extends Project {
  thumbnailData: string | null;
}

interface ProjectListProps {
  onSelectProject: (project: Project) => void;
  onCreateProject: () => void;
  githubState: GitHubState;
  onGitHubConnect: () => void;
}

export function ProjectList({
  onSelectProject,
  onCreateProject,
  githubState,
  onGitHubConnect,
}: ProjectListProps) {
  const [projects, setProjects] = useState<ProjectWithThumbnail[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadProjects = async () => {
    try {
      const projectList = await invoke<Project[]>("list_projects");

      // Load thumbnails for each project
      const projectsWithThumbnails = await Promise.all(
        projectList.map(async (project) => {
          let thumbnailData: string | null = null;
          if (project.thumbnail) {
            try {
              thumbnailData = await invoke<string | null>("get_project_thumbnail", {
                projectPath: project.path,
              });
            } catch (e) {
              console.error("Failed to load thumbnail for", project.name, e);
            }
          }
          return { ...project, thumbnailData };
        })
      );

      setProjects(projectsWithThumbnails);
    } catch (error) {
      console.error("Failed to load projects:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleDelete = async (project: Project) => {
    setDeleting(true);
    try {
      await invoke("delete_project", { path: project.path });
      setDeleteConfirm(null);
      await loadProjects();
    } catch (error) {
      console.error("Failed to delete project:", error);
      alert("Failed to delete project: " + error);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="project-list-loading">
        <div className="spinner" />
        <p>Loading projects...</p>
      </div>
    );
  }

  return (
    <div className="project-list">
      <div className="project-list-header">
        <h1>MarOS</h1>
        <p>Build AI native marketing sites easily with SOTA technology.</p>
      </div>

      <div className="project-list-actions">
        <button className="btn-primary" onClick={onCreateProject}>
          + New Project
        </button>

        {/* GitHub Status */}
        <div className="github-status">
          {!githubState.cliStatus.installed ? (
            <button
              className="github-status-btn not-installed"
              onClick={() => openUrl("https://cli.github.com/")}
            >
              <GitHubIcon /> Install GitHub CLI
            </button>
          ) : !githubState.cliStatus.authenticated ? (
            <button
              className="github-status-btn not-connected"
              onClick={() => {
                openUrl("https://github.com/login/device");
                // Poll for auth status
                const pollAuth = async () => {
                  for (let i = 0; i < 60; i++) {
                    await new Promise((r) => setTimeout(r, 2000));
                    onGitHubConnect();
                  }
                };
                pollAuth();
              }}
            >
              <GitHubIcon /> Connect GitHub
            </button>
          ) : (
            <span className="github-status-connected">
              <GitHubIcon /> {githubState.username}
            </span>
          )}
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="project-list-empty">
          <p>No projects yet</p>
          <p className="hint">Create your first project to get started</p>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((project) => (
            <div key={project.path} className="project-card">
              <button
                className="project-card-thumbnail"
                onClick={() => onSelectProject(project)}
              >
                {project.thumbnailData ? (
                  <img
                    src={project.thumbnailData}
                    alt={project.name}
                  />
                ) : (
                  <div className="project-card-placeholder">
                    <span>No preview</span>
                  </div>
                )}
              </button>
              <div className="project-card-info">
                <div className="project-card-details">
                  <span className="project-card-name">{project.name}</span>
                  <span className="project-card-path">{project.path}</span>
                </div>
                <button
                  className="project-card-menu"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(project);
                  }}
                  title="Delete project"
                >
                  •••
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Project?</h3>
            <p>
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
            </p>
            <p className="hint">This will permanently delete all files in this project.</p>
            <div className="modal-actions">
              <button onClick={() => setDeleteConfirm(null)} disabled={deleting}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
