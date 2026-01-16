import { useState, useEffect, useCallback } from "react";
import { GitHubState } from "../App";
import { ProjectGitHubStatus, pushToGitHub, publishToGitHub, checkGitHasChanges } from "../lib/github";
import { openUrl } from "@tauri-apps/plugin-opener";

interface GitHubButtonProps {
  githubState: GitHubState;
  projectStatus: ProjectGitHubStatus | null;
  projectPath: string;
  projectName: string;
  onStatusChange: () => void;
  onGitHubConnect: () => void;
}

export function GitHubButton({
  githubState,
  projectStatus,
  projectPath,
  projectName,
  onStatusChange,
  onGitHubConnect,
}: GitHubButtonProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [repoName, setRepoName] = useState(projectName);
  const [isPrivate, setIsPrivate] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [checkingChanges, setCheckingChanges] = useState(false);

  const { cliStatus, username } = githubState;

  // Check for changes when project status changes or periodically
  const checkChanges = useCallback(async () => {
    if (!projectPath || !projectStatus?.has_remote) return;

    setCheckingChanges(true);
    try {
      const changes = await checkGitHasChanges(projectPath);
      setHasChanges(changes);
    } catch (e) {
      console.error("Failed to check changes:", e);
    } finally {
      setCheckingChanges(false);
    }
  }, [projectPath, projectStatus?.has_remote]);

  useEffect(() => {
    checkChanges();

    // Poll for changes every 5 seconds when connected to repo
    if (projectStatus?.has_remote) {
      const interval = setInterval(checkChanges, 5000);
      return () => clearInterval(interval);
    }
  }, [checkChanges, projectStatus?.has_remote]);

  // If gh CLI not installed, show install prompt
  if (!cliStatus.installed) {
    return (
      <button
        className="github-button github-install"
        onClick={() => openUrl("https://cli.github.com/")}
        title="Install GitHub CLI"
      >
        Install GitHub CLI
      </button>
    );
  }

  // If not authenticated, show connect button
  if (!cliStatus.authenticated) {
    return (
      <button
        className="github-button github-connect"
        onClick={async () => {
          try {
            await openUrl("https://github.com/login/device");
            const pollAuth = async () => {
              for (let i = 0; i < 60; i++) {
                await new Promise((r) => setTimeout(r, 2000));
                onGitHubConnect();
              }
            };
            pollAuth();
          } catch (e) {
            console.error("Failed to start GitHub auth:", e);
          }
        }}
        title="Connect your GitHub account"
      >
        Connect GitHub
      </button>
    );
  }

  // If project is connected to GitHub, show Publish button
  if (projectStatus?.has_remote && projectStatus?.github_repo) {
    return (
      <>
        <button
          className={`github-button github-publish ${!hasChanges ? 'disabled' : ''}`}
          onClick={() => {
            if (hasChanges) {
              setShowPublishModal(true);
              setError(null);
            }
          }}
          disabled={!hasChanges || isLoading || checkingChanges}
          title={hasChanges ? "Publish changes to GitHub" : "Up to date with GitHub"}
        >
          {isLoading ? "Publishing..." : checkingChanges ? "Checking..." : "Publish"}
        </button>
        {projectStatus.github_url && (
          <button
            className="github-button github-link"
            onClick={() => openUrl(projectStatus.github_url!)}
            title="Open on GitHub"
          >
            <GitHubIcon />
          </button>
        )}

        {/* Publish Confirmation Modal */}
        {showPublishModal && (
          <div className="modal-overlay" onClick={() => setShowPublishModal(false)}>
            <div className="modal github-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Publish to GitHub</h3>
              <p>
                Push your changes to <strong>{projectStatus.github_repo}</strong>?
              </p>
              {error && <p className="github-error">{error}</p>}
              <div className="modal-actions">
                <button onClick={() => setShowPublishModal(false)} disabled={isLoading}>
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={async () => {
                    setIsLoading(true);
                    setError(null);
                    try {
                      await publishToGitHub(projectPath);
                      setShowPublishModal(false);
                      setHasChanges(false);
                      onStatusChange();
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  disabled={isLoading}
                >
                  {isLoading ? "Publishing..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Project not connected - show Create Repo button
  return (
    <>
      <button
        className="github-button github-create"
        onClick={() => {
          setRepoName(projectName);
          setShowCreateModal(true);
          setError(null);
        }}
        title="Create GitHub repository"
      >
        Create Repo
      </button>

      {/* Create Repo Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal github-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create GitHub Repository</h3>
            <p>Create a new GitHub repository for this project.</p>

            <div className="github-form">
              <label>
                Repository name
                <div className="repo-name-input">
                  <span className="repo-prefix">{username}/</span>
                  <input
                    type="text"
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value.replace(/[^a-zA-Z0-9-_]/g, "-"))}
                    placeholder="my-project"
                    autoFocus
                  />
                </div>
              </label>

              <label className="visibility-option">
                <input
                  type="radio"
                  name="visibility"
                  checked={isPrivate}
                  onChange={() => setIsPrivate(true)}
                />
                <div>
                  <strong>Private</strong>
                  <span>Only you can see this repository</span>
                </div>
              </label>

              <label className="visibility-option">
                <input
                  type="radio"
                  name="visibility"
                  checked={!isPrivate}
                  onChange={() => setIsPrivate(false)}
                />
                <div>
                  <strong>Public</strong>
                  <span>Anyone can see this repository</span>
                </div>
              </label>

              {error && <p className="github-error">{error}</p>}
            </div>

            <div className="modal-actions">
              <button onClick={() => setShowCreateModal(false)} disabled={isLoading}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={async () => {
                  if (!repoName.trim()) return;

                  setIsLoading(true);
                  setError(null);
                  try {
                    const fullRepoName = `${username}/${repoName}`;
                    await pushToGitHub({
                      projectPath,
                      repoName: fullRepoName,
                      isPrivate,
                    });
                    setShowCreateModal(false);
                    onStatusChange();
                  } catch (e) {
                    setError(String(e));
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading || !repoName.trim()}
              >
                {isLoading ? "Creating..." : "Create Repository"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
