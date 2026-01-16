import { useState, useEffect, useRef } from "react";
import { Terminal } from "./components/Terminal";
import { Preview } from "./components/Preview";
import { ProjectList } from "./components/ProjectList";
import { CreateProject } from "./components/CreateProject";
import { SetupScreen } from "./components/SetupScreen";
import { SplitPane } from "./components/SplitPane";
import { GitHubButton } from "./components/GitHubButton";
import { checkPrerequisites, startDevServer, Prerequisite, Project, DevServerHandle } from "./lib/project";
import {
  checkGitHubCliStatus,
  getGitHubUsername,
  getProjectGitHubStatus,
  GitHubCliStatus,
  ProjectGitHubStatus,
} from "./lib/github";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type AppView = "loading" | "setup" | "projects" | "create" | "workspace";

export interface GitHubState {
  cliStatus: GitHubCliStatus;
  username: string | null;
}

function App() {
  const [view, setView] = useState<AppView>("loading");
  const [prerequisites, setPrerequisites] = useState<Prerequisite[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const devServerRef = useRef<DevServerHandle | null>(null);

  // GitHub state
  const [githubState, setGithubState] = useState<GitHubState>({
    cliStatus: { installed: false, authenticated: false },
    username: null,
  });
  const [projectGithubStatus, setProjectGithubStatus] = useState<ProjectGitHubStatus | null>(null);

  // Check prerequisites and GitHub status on mount
  useEffect(() => {
    checkSetup();
  }, []);

  const checkSetup = async () => {
    setView("loading");
    try {
      const prereqs = await checkPrerequisites();
      setPrerequisites(prereqs);

      // Check GitHub status in parallel
      const ghStatus = await checkGitHubCliStatus();
      let username: string | null = null;
      if (ghStatus.authenticated) {
        try {
          username = await getGitHubUsername();
        } catch {
          // Ignore - username is optional
        }
      }
      setGithubState({ cliStatus: ghStatus, username });

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

  const handleSelectProject = async (project: Project) => {
    setCurrentProject(project);

    // Check project's GitHub status
    try {
      const status = await getProjectGitHubStatus(project.path);
      setProjectGithubStatus(status);
    } catch {
      setProjectGithubStatus(null);
    }

    // Start dev server in background
    try {
      devServerRef.current = await startDevServer(project.path);
    } catch (error) {
      console.error("Failed to start dev server:", error);
    }

    setView("workspace");
  };

  const handleCreateProject = () => {
    setView("create");
  };

  const handleProjectCreated = async (projectPath: string) => {
    const projectName = projectPath.split("/").pop() || "project";
    handleSelectProject({ name: projectName, path: projectPath, thumbnail: null });
  };

  const handleBackToProjects = async () => {
    setIsClosing(true);

    // Capture thumbnail before closing
    if (currentProject) {
      try {
        await invoke("capture_project_thumbnail", {
          projectPath: currentProject.path,
          url: "http://localhost:3000",
        });
      } catch (error) {
        console.error("Failed to capture thumbnail:", error);
      }
    }

    // Stop dev server if running
    if (devServerRef.current) {
      await devServerRef.current.stop();
      devServerRef.current = null;
    }
    setCurrentProject(null);
    setProjectGithubStatus(null);
    setIsClosing(false);
    setView("projects");
  };

  const handleGitHubStatusChange = async () => {
    // Refresh project GitHub status after push/publish
    if (currentProject) {
      const status = await getProjectGitHubStatus(currentProject.path);
      setProjectGithubStatus(status);
    }
  };

  if (view === "loading") {
    return (
      <div className="app loading">
        <div className="spinner" />
        <p>Loading MarOS...</p>
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
          onGitHubConnect={refreshGitHubStatus}
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

  // Workspace view
  return (
    <div className="app workspace">
      <header className="workspace-header">
        <button
          className="back-button"
          onClick={handleBackToProjects}
          disabled={isClosing}
        >
          {isClosing ? "Saving..." : "← Projects"}
        </button>
        <h1>{currentProject?.name}</h1>
        <span className="project-path">{currentProject?.path}</span>

        <div className="workspace-header-actions">
          <GitHubButton
            githubState={githubState}
            projectStatus={projectGithubStatus}
            projectPath={currentProject?.path || ""}
            projectName={currentProject?.name || ""}
            onStatusChange={handleGitHubStatusChange}
            onGitHubConnect={refreshGitHubStatus}
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
              <Terminal
                projectPath={currentProject?.path || ""}
                onExit={(code) => {
                  console.log("Terminal exited with code:", code);
                }}
              />
            </div>
          }
          right={
            <div className="preview-pane">
              <Preview port={3000} projectPath={currentProject?.path || ""} />
            </div>
          }
        />
      </div>
    </div>
  );
}

export default App;
