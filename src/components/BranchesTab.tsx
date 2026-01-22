/**
 * Branches tab for workspace.
 *
 * Shows all branches organized by:
 * - Current branch
 * - User's branches
 * - Team branches
 * - Main branches (main, staging)
 *
 * @module components/BranchesTab
 */

import { useState } from "react";
import {
  BranchInfo,
  switchBranch,
  deleteBranch,
  formatRelativeTime,
} from "../lib/branches";
import { BranchIcon } from "./icons";

interface BranchesTabProps {
  /** List of all branches */
  branches: BranchInfo[];
  /** Current branch name */
  currentBranch: string;
  /** Project path for branch operations */
  projectPath: string;
  /** GitHub username for grouping */
  githubUsername: string | null;
  /** Callback when branch is switched */
  onBranchSwitch: (branchName: string) => void;
  /** Callback to open submit for review modal */
  onSubmitForReview: (branchName: string) => void;
  /** Callback to refresh branch list */
  onRefresh: () => void;
  /** Callback for toast notifications */
  onToast?: (message: string, type?: "success" | "error") => void;
}

export function BranchesTab({
  branches,
  currentBranch: _currentBranch,
  projectPath,
  githubUsername,
  onBranchSwitch,
  onSubmitForReview,
  onRefresh,
  onToast,
}: BranchesTabProps) {
  const [switchingBranch, setSwitchingBranch] = useState<string | null>(null);
  const [deletingBranch, setDeletingBranch] = useState<string | null>(null);
  const [branchToDelete, setBranchToDelete] = useState<string | null>(null);

  // Group branches
  const currentBranchInfo = branches.find(b => b.isCurrent);
  const userBranches = githubUsername
    ? branches.filter(b => !b.isCurrent && !b.isDefault && b.name !== "staging" && b.name.startsWith(`${githubUsername}/`))
    : [];
  const teamBranches = branches.filter(
    b => !b.isCurrent && !b.isDefault && b.name !== "staging" && !userBranches.includes(b)
  );
  const mainBranches = branches.filter(
    b => !b.isCurrent && (b.isDefault || b.name === "staging")
  );

  const handleSwitch = async (branchName: string) => {
    setSwitchingBranch(branchName);
    try {
      const result = await switchBranch(projectPath, branchName, true);
      if (result.success) {
        onBranchSwitch(branchName);
        if (result.stashedChanges) {
          onToast?.("Switched branch (changes stashed)", "success");
        } else {
          onToast?.(`Switched to ${branchName}`, "success");
        }
      } else {
        onToast?.(result.error || "Failed to switch branch", "error");
      }
    } catch (e) {
      onToast?.(`Failed to switch: ${e}`, "error");
    } finally {
      setSwitchingBranch(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!branchToDelete) return;

    const branchName = branchToDelete;
    setDeletingBranch(branchName);

    try {
      await deleteBranch(projectPath, branchName, true);
      onToast?.(`Deleted ${branchName}`, "success");
      onRefresh();
    } catch (e) {
      onToast?.(`Failed to delete: ${e}`, "error");
    } finally {
      setDeletingBranch(null);
      setBranchToDelete(null);
    }
  };

  return (
    <div className="branches-tab">
      {/* Current Branch */}
      {currentBranchInfo && (
        <div className="branches-tab-section">
          <div className="branches-tab-section-header">Current Branch</div>
          <BranchCard
            branch={currentBranchInfo}
            isCurrent={true}
            onSwitch={() => {}}
            onDelete={() => {}}
            onSubmitForReview={() => onSubmitForReview(currentBranchInfo.name)}
            isSwitching={false}
            isDeleting={false}
            showSubmitForReview={!currentBranchInfo.isDefault && currentBranchInfo.name !== "staging"}
          />
        </div>
      )}

      {/* User's Branches */}
      {userBranches.length > 0 && (
        <div className="branches-tab-section">
          <div className="branches-tab-section-header">Your Branches</div>
          {userBranches.map(branch => (
            <BranchCard
              key={branch.name}
              branch={branch}
              isCurrent={false}
              onSwitch={() => handleSwitch(branch.name)}
              onDelete={() => setBranchToDelete(branch.name)}
              onSubmitForReview={() => onSubmitForReview(branch.name)}
              isSwitching={switchingBranch === branch.name}
              isDeleting={deletingBranch === branch.name}
              showDelete={true}
              showSubmitForReview={false}
            />
          ))}
        </div>
      )}

      {/* Team Branches */}
      {teamBranches.length > 0 && (
        <div className="branches-tab-section">
          <div className="branches-tab-section-header">Team Branches</div>
          {teamBranches.map(branch => (
            <BranchCard
              key={branch.name}
              branch={branch}
              isCurrent={false}
              onSwitch={() => handleSwitch(branch.name)}
              onDelete={() => {}}
              onSubmitForReview={() => {}}
              isSwitching={switchingBranch === branch.name}
              isDeleting={false}
              showDelete={false}
              showSubmitForReview={false}
            />
          ))}
        </div>
      )}

      {/* Main Branches */}
      {mainBranches.length > 0 && (
        <div className="branches-tab-section">
          <div className="branches-tab-section-header">Main Branches</div>
          {mainBranches.map(branch => (
            <BranchCard
              key={branch.name}
              branch={branch}
              isCurrent={false}
              onSwitch={() => handleSwitch(branch.name)}
              onDelete={() => {}}
              onSubmitForReview={() => {}}
              isSwitching={switchingBranch === branch.name}
              isDeleting={false}
              showDelete={false}
              showSubmitForReview={false}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      {branchToDelete && (
        <div className="post-merge-modal">
          <div className="post-merge-content">
            <div className="post-merge-header">
              <h3>Delete Branch?</h3>
            </div>
            <div className="post-merge-body">
              <p>
                Are you sure you want to delete <strong>{branchToDelete}</strong>?
                This action cannot be undone.
              </p>
            </div>
            <div className="post-merge-footer">
              <button
                className="post-merge-btn secondary"
                onClick={() => setBranchToDelete(null)}
                disabled={!!deletingBranch}
              >
                Cancel
              </button>
              <button
                className="post-merge-btn danger"
                onClick={handleDeleteConfirm}
                disabled={!!deletingBranch}
              >
                {deletingBranch ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface BranchCardProps {
  branch: BranchInfo;
  isCurrent: boolean;
  onSwitch: () => void;
  onDelete: () => void;
  onSubmitForReview: () => void;
  isSwitching: boolean;
  isDeleting: boolean;
  showDelete?: boolean;
  showSubmitForReview?: boolean;
}

function BranchCard({
  branch,
  isCurrent,
  onSwitch,
  onDelete,
  onSubmitForReview,
  isSwitching,
  isDeleting,
  showDelete = false,
  showSubmitForReview = false,
}: BranchCardProps) {
  return (
    <div className={`branch-card ${isCurrent ? "current" : ""}`}>
      <div className="branch-card-info">
        <div className="branch-card-name">
          <BranchIcon size={14} />
          {branch.name}
          {branch.isDefault && <span className="branch-live-badge">Live</span>}
          {isCurrent && <span className="branch-card-current-label">you are here</span>}
        </div>
        <div className="branch-card-meta">
          {formatRelativeTime(branch.lastCommitDate)}
          {branch.lastCommitAuthor && ` · ${branch.lastCommitAuthor}`}
        </div>
        {!branch.isDefault && (branch.aheadOfMain > 0 || branch.behindOfMain > 0) && (
          <div className="branch-card-status">
            {branch.aheadOfMain > 0 && (
              <span className="branch-card-badge ahead">{branch.aheadOfMain} ahead</span>
            )}
            {branch.behindOfMain > 0 && (
              <span className="branch-card-badge behind">{branch.behindOfMain} behind</span>
            )}
          </div>
        )}
      </div>

      <div className="branch-card-actions">
        {isCurrent && showSubmitForReview && (
          <button
            className="branch-card-action primary"
            onClick={onSubmitForReview}
          >
            Submit for Review
          </button>
        )}
        {!isCurrent && (
          <button
            className="branch-card-action"
            onClick={onSwitch}
            disabled={isSwitching}
          >
            {isSwitching ? "Switching..." : "Switch"}
          </button>
        )}
        {showDelete && (
          <button
            className="branch-card-action danger"
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        )}
      </div>
    </div>
  );
}
