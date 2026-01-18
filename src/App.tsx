import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal, TerminalHandle } from "./components/Terminal";
import { Preview } from "./components/Preview";
import { ProjectList } from "./components/ProjectList";
import { CreateProject } from "./components/CreateProject";
import { SetupScreen } from "./components/SetupScreen";
import { SplitPane } from "./components/SplitPane";
import { GitHubButton } from "./components/GitHubButton";
import { VercelButton } from "./components/VercelButton";
import { EnvEditor } from "./components/EnvEditor";
import { checkPrerequisites, startDevServer, Prerequisite, Project, DevServerHandle } from "./lib/project";
import {
  checkGitHubCliStatus,
  getGitHubUsername,
  getProjectGitHubStatus,
  GitHubCliStatus,
  ProjectGitHubStatus,
} from "./lib/github";
import {
  checkVercelCliStatus,
  getVercelUsername,
  getProjectVercelStatus,
  VercelCliStatus,
  ProjectVercelStatus,
} from "./lib/vercel";
import { checkClaudeCliStatus, ClaudeCliStatus } from "./lib/claude";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

// Constants
const SCREENSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SCREENSHOT_DELAY_MS = 2000; // Wait for page to render
const DEV_SERVER_PORT = 3000;

type AppView = "loading" | "setup" | "projects" | "create" | "project-loading" | "workspace";
type EditorMode = "agent" | "visual";

export interface GitHubState {
  cliStatus: GitHubCliStatus;
  username: string | null;
}

export interface VercelState {
  cliStatus: VercelCliStatus;
  username: string | null;
}

export interface ClaudeState {
  cliStatus: ClaudeCliStatus;
}

function App() {
  const [view, setView] = useState<AppView>("loading");
  const [prerequisites, setPrerequisites] = useState<Prerequisite[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const devServerRef = useRef<DevServerHandle | null>(null);
  const terminalRef = useRef<TerminalHandle | null>(null);
  const screenshotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // GitHub state
  const [githubState, setGithubState] = useState<GitHubState>({
    cliStatus: { installed: false, authenticated: false },
    username: null,
  });
  const [projectGithubStatus, setProjectGithubStatus] = useState<ProjectGitHubStatus | null>(null);

  // Vercel state
  const [vercelState, setVercelState] = useState<VercelState>({
    cliStatus: { installed: false, authenticated: false },
    username: null,
  });
  const [projectVercelStatus, setProjectVercelStatus] = useState<ProjectVercelStatus | null>(null);

  // Claude state
  const [claudeState, setClaudeState] = useState<ClaudeState>({
    cliStatus: { installed: false, version: null },
  });

  // Editor mode (agent vs visual)
  const [editorMode, setEditorMode] = useState<EditorMode>("agent");

  // Env editor modal
  const [showEnvEditor, setShowEnvEditor] = useState(false);

  // IDE dropdown
  const [showIdeDropdown, setShowIdeDropdown] = useState(false);
  const [ideAvailability, setIdeAvailability] = useState<{ vscode: boolean; cursor: boolean }>({ vscode: false, cursor: false });
  const [openingIde, setOpeningIde] = useState<string | null>(null);

  // Current preview page (for Vercel Live button)
  const [currentPreviewPage, setCurrentPreviewPage] = useState("/");

  // Check IDE availability on mount
  useEffect(() => {
    invoke<{ vscode: boolean; cursor: boolean }>("check_ide_availability")
      .then(setIdeAvailability)
      .catch(() => setIdeAvailability({ vscode: false, cursor: false }));
  }, []);

  // Open project in IDE
  const openInIde = async (ide: "vscode" | "cursor") => {
    if (!currentProject) return;
    setOpeningIde(ide);
    try {
      await invoke("open_in_ide", { projectPath: currentProject.path, ide });
      // Brief delay to show "Opening..." then close dropdown
      setTimeout(() => {
        setOpeningIde(null);
        setShowIdeDropdown(false);
      }, 1000);
    } catch (e) {
      console.error(`Failed to open in ${ide}:`, e);
      setOpeningIde(null);
    }
  };

  // Check prerequisites and GitHub status on mount
  useEffect(() => {
    checkSetup();
  }, []);

  const checkSetup = async () => {
    setView("loading");
    try {
      const prereqs = await checkPrerequisites();
      setPrerequisites(prereqs);

      // Check GitHub, Vercel, and Claude status in parallel
      const [ghStatus, vcStatus, clStatus] = await Promise.all([
        checkGitHubCliStatus(),
        checkVercelCliStatus(),
        checkClaudeCliStatus(),
      ]);

      let ghUsername: string | null = null;
      if (ghStatus.authenticated) {
        try {
          ghUsername = await getGitHubUsername();
        } catch {
          // Ignore - username is optional
        }
      }
      setGithubState({ cliStatus: ghStatus, username: ghUsername });

      let vcUsername: string | null = null;
      if (vcStatus.authenticated) {
        try {
          vcUsername = await getVercelUsername();
        } catch {
          // Ignore - username is optional
        }
      }
      setVercelState({ cliStatus: vcStatus, username: vcUsername });

      // Set Claude state
      setClaudeState({ cliStatus: clStatus });

      const allAvailable = prereqs.every((p) => p.available);
      if (allAvailable) {
        setView("projects");
      } else {
        setView("setup");
      }
    } catch (error) {
      console.error("Failed to check prerequisites:", error);
      setView("setup");
    }
  };

  const refreshGitHubStatus = async () => {
    const ghStatus = await checkGitHubCliStatus();
    let username: string | null = null;
    if (ghStatus.authenticated) {
      try {
        username = await getGitHubUsername();
      } catch {
        // Ignore
      }
    }
    setGithubState({ cliStatus: ghStatus, username });
  };

  const refreshVercelStatus = async () => {
    const vcStatus = await checkVercelCliStatus();
    let username: string | null = null;
    if (vcStatus.authenticated) {
      try {
        username = await getVercelUsername();
      } catch {
        // Ignore
      }
    }
    setVercelState({ cliStatus: vcStatus, username });
  };

  const refreshClaudeStatus = async () => {
    const clStatus = await checkClaudeCliStatus();
    setClaudeState({ cliStatus: clStatus });
  };

  // Focus terminal (called after modals close)
  const focusTerminal = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  // Handle terminal exit (memoized to prevent re-spawning Claude on every render)
  const handleTerminalExit = useCallback((code: number | null) => {
    console.log("Terminal exited with code:", code);
  }, []);

  // Capture project screenshot in background
  const captureScreenshot = useCallback(async (projectPath: string) => {
    try {
      await invoke("capture_project_thumbnail", {
        projectPath,
        url: `http://localhost:${DEV_SERVER_PORT}`,
      });
    } catch (error) {
      console.error("Failed to capture thumbnail:", error);
    }
  }, []);

  // Handle preview server ready - capture initial screenshot
  const handlePreviewReady = useCallback(() => {
    if (currentProject) {
      setTimeout(() => {
        captureScreenshot(currentProject.path);
      }, SCREENSHOT_DELAY_MS);
    }
  }, [currentProject, captureScreenshot]);


  const handleSelectProject = async (project: Project) => {
    // Stop any existing dev server first
    if (devServerRef.current) {
      await devServerRef.current.stop();
      devServerRef.current = null;
    }

    // Clear any existing screenshot interval
    if (screenshotIntervalRef.current) {
      clearInterval(screenshotIntervalRef.current);
      screenshotIntervalRef.current = null;
    }

    setCurrentProject(project);
    setCurrentPreviewPage("/");
    setView("project-loading");

    // Check project's GitHub and Vercel status in parallel
    try {
      const [ghStatus, vcStatus] = await Promise.all([
        getProjectGitHubStatus(project.path).catch(() => null),
        getProjectVercelStatus(project.path).catch(() => null),
      ]);
      setProjectGithubStatus(ghStatus);
      setProjectVercelStatus(vcStatus);
    } catch {
      setProjectGithubStatus(null);
      setProjectVercelStatus(null);
    }

    // Start dev server in background
    try {
      devServerRef.current = await startDevServer(project.path);
    } catch (error) {
      console.error("Failed to start dev server:", error);
    }

    setView("workspace");

    // Capture screenshots periodically
    screenshotIntervalRef.current = setInterval(() => {
      captureScreenshot(project.path);
    }, SCREENSHOT_INTERVAL_MS);
  };

  const handleCreateProject = async () => {
    // Stop any existing dev server
    if (devServerRef.current) {
      await devServerRef.current.stop();
      devServerRef.current = null;
    }

    // Clear screenshot interval
    if (screenshotIntervalRef.current) {
      clearInterval(screenshotIntervalRef.current);
      screenshotIntervalRef.current = null;
    }

    setCurrentProject(null);
    setView("create");
  };

  const handleProjectCreated = async (projectPath: string) => {
    const projectName = projectPath.split("/").pop() || "project";
    handleSelectProject({ name: projectName, path: projectPath, thumbnail: null });
  };

  const handleBackToProjects = async () => {
    // Clear screenshot interval
    if (screenshotIntervalRef.current) {
      clearInterval(screenshotIntervalRef.current);
      screenshotIntervalRef.current = null;
    }

    // Stop dev server if running
    if (devServerRef.current) {
      await devServerRef.current.stop();
      devServerRef.current = null;
    }
    setCurrentProject(null);
    setProjectGithubStatus(null);
    setProjectVercelStatus(null);
    setView("projects");
  };

  const handleGitHubStatusChange = async () => {
    // Refresh project GitHub and Vercel status after push/publish
    if (currentProject) {
      const [ghStatus, vcStatus] = await Promise.all([
        getProjectGitHubStatus(currentProject.path).catch(() => null),
        getProjectVercelStatus(currentProject.path).catch(() => null),
      ]);
      setProjectGithubStatus(ghStatus);
      setProjectVercelStatus(vcStatus);
    }
  };

  const handleVercelStatusChange = async (deployedUrl?: string) => {
    // If we have a deployed URL from a successful deployment, use it directly
    if (deployedUrl && currentProject) {
      setProjectVercelStatus({
        is_linked: true,
        project_name: currentProject.name,
        production_url: deployedUrl,
      });
      return;
    }
    // Otherwise refresh project Vercel status
    if (currentProject) {
      const status = await getProjectVercelStatus(currentProject.path).catch(() => null);
      setProjectVercelStatus(status);
    }
  };

  if (view === "loading") {
    return (
      <div className="app loading">
        <div className="spinner" />
        <p>Loading Marketingstack...</p>
      </div>
    );
  }

  if (view === "setup") {
    return (
      <div className="app">
        <SetupScreen prerequisites={prerequisites} onRetry={checkSetup} />
      </div>
    );
  }

  if (view === "projects") {
    return (
      <div className="app">
        <ProjectList
          onSelectProject={handleSelectProject}
          onCreateProject={handleCreateProject}
          githubState={githubState}
          vercelState={vercelState}
          claudeState={claudeState}
          onGitHubConnect={refreshGitHubStatus}
          onVercelConnect={refreshVercelStatus}
          onClaudeConnect={refreshClaudeStatus}
        />
      </div>
    );
  }

  if (view === "create") {
    return (
      <div className="app">
        <CreateProject
          onComplete={handleProjectCreated}
          onCancel={() => setView("projects")}
        />
      </div>
    );
  }

  if (view === "project-loading") {
    return (
      <div className="app loading">
        <div className="spinner" />
        <p>Opening {currentProject?.name}...</p>
      </div>
    );
  }

  // Workspace view
  return (
    <div className="app workspace">
      <header className="workspace-header">
        <button
          className="back-button"
          onClick={handleBackToProjects}
        >
          ← Projects
        </button>
        <h1>{currentProject?.name}</h1>
        <span className="project-path">{currentProject?.path}</span>

        <div className="workspace-header-actions">
          <div
            className="ide-dropdown-container"
            onMouseEnter={() => setShowIdeDropdown(true)}
            onMouseLeave={() => setShowIdeDropdown(false)}
          >
            <button className="ide-button" title="Open in IDE">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </button>
            {showIdeDropdown && (
              <div className="ide-dropdown">
                {ideAvailability.vscode && (
                  <button onClick={() => openInIde("vscode")} disabled={openingIde !== null}>
                    <svg width="14" height="14" viewBox="0 0 32 32" fill="currentColor">
                      <path d="M30.865 3.448l-6.583-3.167c-0.766-0.37-1.677-0.214-2.276 0.385l-12.609 11.505-5.495-4.167c-0.51-0.391-1.229-0.359-1.703 0.073l-1.76 1.604c-0.583 0.526-0.583 1.443-0.005 1.969l4.766 4.349-4.766 4.349c-0.578 0.526-0.578 1.443 0.005 1.969l1.76 1.604c0.479 0.432 1.193 0.464 1.703 0.073l5.495-4.172 12.615 11.51c0.594 0.599 1.505 0.755 2.271 0.385l6.589-3.172c0.693-0.333 1.13-1.031 1.13-1.802v-21.495c0-0.766-0.443-1.469-1.135-1.802zM24.005 23.266l-9.573-7.266 9.573-7.266z"/>
                    </svg>
                    {openingIde === "vscode" ? "Opening..." : "VS Code"}
                  </button>
                )}
                {ideAvailability.cursor && (
                  <button onClick={() => openInIde("cursor")} disabled={openingIde !== null}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd">
                      <path d="M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z"/>
                    </svg>
                    {openingIde === "cursor" ? "Opening..." : "Cursor"}
                  </button>
                )}
                {!ideAvailability.vscode && !ideAvailability.cursor && (
                  <div className="ide-dropdown-empty">No IDEs found</div>
                )}
              </div>
            )}
          </div>
          <button
            className="env-button"
            onClick={() => setShowEnvEditor(true)}
            title="Environment Variables"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v18" />
              <rect x="3" y="8" width="18" height="8" rx="1" />
            </svg>
            .env
          </button>
          <GitHubButton
            githubState={githubState}
            vercelState={vercelState}
            projectStatus={projectGithubStatus}
            projectPath={currentProject?.path || ""}
            projectName={currentProject?.name || ""}
            onStatusChange={handleGitHubStatusChange}
            onGitHubConnect={refreshGitHubStatus}
            onModalClose={focusTerminal}
          />
          <VercelButton
            vercelState={vercelState}
            projectVercelStatus={projectVercelStatus}
            projectGithubStatus={projectGithubStatus}
            projectPath={currentProject?.path || ""}
            projectName={currentProject?.name || ""}
            currentPage={currentPreviewPage}
            onStatusChange={handleVercelStatusChange}
            onVercelConnect={refreshVercelStatus}
            onModalClose={focusTerminal}
          />
        </div>
      </header>

      <div className="workspace-content">
        <SplitPane
          defaultSplit={28}
          minLeft={20}
          minRight={35}
          left={
            <div className="terminal-pane">
              <div className="terminal-toolbar">
                <div className="editor-mode-toggle">
                  <button
                    className={`mode-btn ${editorMode === "agent" ? "active" : ""}`}
                    onClick={() => setEditorMode("agent")}
                    title="Agent Mode"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span>Agent</span>
                  </button>
                  <button
                    className={`mode-btn ${editorMode === "visual" ? "active" : ""}`}
                    onClick={() => setEditorMode("visual")}
                    title="Visual Editor"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z" />
                      <path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7" />
                      <path d="M14.5 17.5 4.5 15" />
                    </svg>
                    <span>Visual</span>
                  </button>
                </div>
              </div>
              <div className="terminal-content" style={{ display: editorMode === "agent" ? "block" : "none" }}>
                <Terminal
                  ref={terminalRef}
                  projectPath={currentProject?.path || ""}
                  onExit={handleTerminalExit}
                />
              </div>
              <div className="visual-editor-placeholder" style={{ display: editorMode === "visual" ? "flex" : "none" }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z" />
                  <path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7" />
                  <path d="M14.5 17.5 4.5 15" />
                </svg>
                <h3>Visual Editor</h3>
                <p>Coming soon</p>
              </div>
            </div>
          }
          right={
            <div className="preview-pane">
              <Preview
                port={DEV_SERVER_PORT}
                projectPath={currentProject?.path || ""}
                onServerReady={handlePreviewReady}
                onPageChange={setCurrentPreviewPage}
              />
            </div>
          }
        />
      </div>

      <EnvEditor
        projectPath={currentProject?.path || ""}
        isOpen={showEnvEditor}
        onClose={() => {
          setShowEnvEditor(false);
          focusTerminal();
        }}
      />
    </div>
  );
}

export default App;
