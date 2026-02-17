/**
 * BackupsModal component for viewing and restoring project backups.
 *
 * Shows a list of git commits as "backups" and allows restoring to any point.
 * Uses a safe restore flow that creates a new branch for review via PR.
 *
 * @module components/BackupsModal
 */

import { useEffect, useState, useCallback } from 'react';
import { CloseIcon, SpinnerIcon, CheckIcon, PullRequestIcon } from './icons';
import { getBackups, restoreBackup, Backup, RestoreResult } from '../lib/backups';
import { trackEvent } from '../lib/analytics';

interface BackupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string;
  onRestore?: () => void;
  onCreatePR?: (branchName: string) => void;
}

type ModalState =
  | { type: 'list' }
  | { type: 'confirming'; backup: Backup }
  | { type: 'restoring'; backup: Backup }
  | { type: 'success'; result: RestoreResult };

export function BackupsModal({
  isOpen,
  onClose,
  projectPath,
  onRestore,
  onCreatePR,
}: BackupsModalProps) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState>({ type: 'list' });

  const loadBackups = useCallback(async () => {
    if (!projectPath) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getBackups(projectPath, 50);
      setBackups(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  // Handle Escape key to close (only when not in confirming/restoring state)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modalState.type === 'restoring') {
          // Don't close while restoring
          return;
        }
        if (modalState.type === 'confirming') {
          // Go back to list
          setModalState({ type: 'list' });
          return;
        }
        if (modalState.type === 'success') {
          // Close modal and reset state
          setModalState({ type: 'list' });
          onClose();
          return;
        }
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, modalState]);

  // Load backups when modal opens
  useEffect(() => {
    if (isOpen) {
      setModalState({ type: 'list' });
      setError(null);
      void loadBackups();
    }
  }, [isOpen, loadBackups]);

  const handleRestoreClick = (backup: Backup) => {
    setError(null);
    setModalState({ type: 'confirming', backup });
  };

  const handleConfirmRestore = async () => {
    if (modalState.type !== 'confirming') return;

    const backup = modalState.backup;
    setModalState({ type: 'restoring', backup });
    setError(null);

    try {
      const result = await restoreBackup(projectPath, backup.hash);
      void trackEvent('backup_restored', { $screen_name: 'Backups' });
      setModalState({ type: 'success', result });
      onRestore?.();
    } catch (err) {
      setError(String(err));
      setModalState({ type: 'list' });
    }
  };

  const handleCancelConfirm = () => {
    setModalState({ type: 'list' });
  };

  const handleCreatePR = () => {
    if (modalState.type !== 'success') return;
    const branchName = modalState.result.branch_name;
    setModalState({ type: 'list' });
    onClose();
    onCreatePR?.(branchName);
  };

  const handleCloseSuccess = () => {
    setModalState({ type: 'list' });
    onClose();
  };

  if (!isOpen) return null;

  // Confirmation dialog
  if (modalState.type === 'confirming' || modalState.type === 'restoring') {
    const backup = modalState.backup;
    const isRestoring = modalState.type === 'restoring';

    return (
      <div className="modal-overlay" onMouseDown={handleCancelConfirm}>
        <div
          className="modal backups-modal backups-confirm-modal"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="backups-confirm-content">
            <h3>Restore to this backup?</h3>
            <p className="backups-confirm-description">
              This will create a new branch with the backup. To make it live, you'll need to create
              a pull request and merge it.
            </p>

            <div className="backups-confirm-backup">
              <div className="backup-message">{backup.message}</div>
              <div className="backup-meta">
                <span className="backup-time">{backup.relative_time}</span>
                <span className="backup-hash">{backup.hash}</span>
              </div>
            </div>

            {error && <div className="backups-error">{error}</div>}

            <div className="backups-confirm-actions">
              <button
                className="backups-confirm-cancel"
                onClick={handleCancelConfirm}
                disabled={isRestoring}
              >
                Cancel
              </button>
              <button
                className="backups-confirm-restore"
                onClick={() => void handleConfirmRestore()}
                disabled={isRestoring}
              >
                {isRestoring ? (
                  <>
                    <SpinnerIcon size={14} className="spinner-icon" />
                    <span>Restoring...</span>
                  </>
                ) : (
                  'Restore'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (modalState.type === 'success') {
    const { branch_name } = modalState.result;

    return (
      <div className="modal-overlay" onMouseDown={handleCloseSuccess}>
        <div
          className="modal backups-modal backups-success-modal"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="backups-success-content">
            <div className="backups-success-icon">
              <CheckIcon size={24} />
            </div>
            <div className="backups-success-branch">
              <span className="backups-badge backups-badge-preview">Preview</span>
              <span className="backups-branch-name">{branch_name}</span>
            </div>
            <p className="backups-success-description">To make this backup live:</p>
            <ol className="backups-success-steps">
              <li>Create a pull request</li>
              <li>Merge it to main</li>
            </ol>

            <div className="backups-success-actions">
              {onCreatePR && (
                <button className="backups-success-pr-btn" onClick={handleCreatePR}>
                  <PullRequestIcon size={14} />
                  <span>Create Pull Request</span>
                </button>
              )}
              <button className="backups-success-close-btn" onClick={handleCloseSuccess}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main backup list view
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal backups-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="backups-modal-header">
          <div>
            <h3>Backups</h3>
            <p className="backups-modal-subtitle">Restore to any previous version</p>
          </div>
          <button className="backups-close-btn" onClick={onClose}>
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="backups-modal-body">
          {error && <div className="backups-error">{error}</div>}

          {isLoading ? (
            <div className="backups-loading">
              <SpinnerIcon size={20} className="spinner-icon" />
              <span>Loading backups...</span>
            </div>
          ) : backups.length === 0 ? (
            <div className="backups-empty">
              <p>No backups yet</p>
              <p className="backups-empty-hint">
                Backups are created automatically when you make changes
              </p>
            </div>
          ) : (
            <div className="backups-list">
              {backups.map((backup, index) => (
                <div key={backup.full_hash} className="backup-item">
                  <div className="backup-info">
                    <div className="backup-message">{backup.message}</div>
                    <div className="backup-meta">
                      <span className="backup-time">{backup.relative_time}</span>
                      <span className="backup-hash">{backup.hash}</span>
                    </div>
                  </div>
                  {index > 0 && (
                    <button
                      className="backup-restore-btn"
                      onClick={() => handleRestoreClick(backup)}
                    >
                      Restore
                    </button>
                  )}
                  {index === 0 && <span className="backup-current">Current</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="backups-footer">
          <span className="backups-footer-hint">
            Restoring creates a new branch for safe review via PR
          </span>
        </div>
      </div>
    </div>
  );
}
