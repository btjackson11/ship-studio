/**
 * Branch indicator component for workspace header.
 *
 * Shows the current branch name with:
 * - Branch icon
 * - Branch name
 * - "Live" badge if on main branch
 * - Uncommitted changes indicator
 * - Quick-switch dropdown on click
 *
 * @module components/BranchIndicator
 */

import { useState, useRef, useCallback } from "react";
import { BranchIcon, ChevronIcon, CheckIcon } from "./icons";
import { useClickOutside } from "../hooks/useClickOutside";
import { BranchInfo, switchBranch } from "../lib/branches";

interface BranchIndicatorProps {
  /** Current branch name */
  currentBranch: string;
  /** Whether there are uncommitted changes */
  hasUncommittedChanges: boolean;
  /** List of recent/available branches for quick-switch */
  branches: BranchInfo[];
  /** Project path for branch operations */
  projectPath: string;
  /** Callback when branch is switched */
  onBranchSwitch: (branchName: string) => void;
  /** Callback to open full branch selector modal */
  onOpenBranchSelector: () => void;
  /** Callback to create a new branch (opens modal in create mode) */
  onCreateBranch: () => void;
  /** Callback for toast notifications */
  onToast?: (message: string, type?: "success" | "error") => void;
}

export function BranchIndicator({
  currentBranch,
  hasUncommittedChanges,
  branches,
  projectPath,
  onBranchSwitch,
  onOpenBranchSelector,
  onCreateBranch,
  onToast,
}: BranchIndicatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
  }, []);

  useClickOutside(dropdownRef, closeDropdown, isOpen);

  const isMainBranch = currentBranch === "main" || currentBranch === "master";

  // Get recent branches (not current, limit to 5)
  const recentBranches = branches
    .filter(b => !b.isCurrent)
    .slice(0, 5);

  const handleSwitchBranch = async (branchName: string) => {
    setIsSwitching(branchName);
    try {
      const result = await switchBranch(projectPath, branchName, true);
      if (result.success) {
        onBranchSwitch(branchName);
        setIsOpen(false);
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
      setIsSwitching(null);
    }
  };

  return (
    <div className="branch-indicator" ref={dropdownRef}>
      <button
        className={`branch-indicator-button ${isOpen ? "active" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <BranchIcon size={14} />
        <span className="branch-name">{currentBranch}</span>
        {isMainBranch && <span className="branch-live-badge">Live</span>}
        {hasUncommittedChanges && <span className="branch-changes-dot" title="Uncommitted changes" />}
        <ChevronIcon size={10} />
      </button>

      {isOpen && (
        <div className="branch-indicator-dropdown">
          <div className="branch-dropdown-header">Switch branch</div>

          {/* Current branch */}
          <div className="branch-dropdown-section">
            <div className="branch-dropdown-item current">
              <CheckIcon size={12} />
              <span className="branch-item-name">{currentBranch}</span>
              {isMainBranch && <span className="branch-item-badge live">Live</span>}
            </div>
          </div>

          {/* Recent branches */}
          {recentBranches.length > 0 && (
            <div className="branch-dropdown-section">
              <div className="branch-dropdown-section-label">Recent</div>
              {recentBranches.map(branch => (
                <button
                  key={branch.name}
                  className="branch-dropdown-item"
                  onClick={() => handleSwitchBranch(branch.name)}
                  disabled={isSwitching !== null}
                >
                  <span className="branch-item-name">{branch.name}</span>
                  {branch.isDefault && <span className="branch-item-badge">default</span>}
                  {branch.aheadOfMain > 0 && !branch.isDefault && (
                    <span className="branch-item-meta">{branch.aheadOfMain} ahead</span>
                  )}
                  {branch.behindOfMain > 0 && !branch.isDefault && (
                    <span className="branch-item-meta behind">{branch.behindOfMain} behind</span>
                  )}
                  {isSwitching === branch.name && (
                    <span className="branch-item-spinner" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Footer links */}
          <div className="branch-dropdown-footer">
            <button
              className="branch-dropdown-link"
              onClick={() => {
                setIsOpen(false);
                onCreateBranch();
              }}
            >
              + New branch
            </button>
            <button
              className="branch-dropdown-link"
              onClick={() => {
                setIsOpen(false);
                onOpenBranchSelector();
              }}
            >
              See all branches
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
