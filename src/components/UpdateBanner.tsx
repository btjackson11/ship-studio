/**
 * UpdateBanner component that shows when an app update is available.
 *
 * Displays a banner at the top of the screen with:
 * - New version information
 * - Update/restart button
 * - Download progress during update
 * - Dismiss option
 *
 * @module components/UpdateBanner
 */

import { useState, useEffect, useCallback } from "react";
import { Update } from "@tauri-apps/plugin-updater";
import {
  checkForUpdate,
  downloadAndInstall,
  restartApp,
  UpdateInfo,
} from "../lib/updater";

/** How often to check for updates (1 hour) */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState<{
    update: Update;
    info: UpdateInfo;
  } | null>(null);
  const [status, setStatus] = useState<
    "idle" | "downloading" | "ready" | "error"
  >("idle");
  const [progress, setProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for updates on mount and periodically
  useEffect(() => {
    const doCheck = async () => {
      try {
        const result = await checkForUpdate();
        if (result) {
          setUpdateAvailable(result);
          setDismissed(false); // Show banner again if new update
        }
      } catch (err) {
        console.error("[UpdateBanner] Check failed:", err);
      }
    };

    // Check on mount (with delay to not block startup)
    const initialTimeout = setTimeout(doCheck, 5000);

    // Check periodically
    const interval = setInterval(doCheck, UPDATE_CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);

  const handleUpdate = useCallback(async () => {
    if (!updateAvailable) return;

    setStatus("downloading");
    setError(null);

    try {
      await downloadAndInstall(updateAvailable.update, (p) => {
        setProgress(p);
      });
      setStatus("ready");
    } catch (err) {
      console.error("[UpdateBanner] Download failed:", err);
      setStatus("error");
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }, [updateAvailable]);

  const handleRestart = useCallback(async () => {
    try {
      await restartApp();
    } catch (err) {
      console.error("[UpdateBanner] Restart failed:", err);
      setError("Failed to restart. Please restart manually.");
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  // Don't render if no update or dismissed
  if (!updateAvailable || dismissed) {
    return null;
  }

  return (
    <div className="update-banner">
      <div className="update-banner-content">
        <div className="update-banner-info">
          <span className="update-banner-icon">✨</span>
          <span className="update-banner-text">
            {status === "ready" ? (
              <>Update ready! Restart to apply v{updateAvailable.info.version}</>
            ) : status === "downloading" ? (
              <>Downloading update... {progress}%</>
            ) : status === "error" ? (
              <>{error || "Update failed"}</>
            ) : (
              <>New version available: v{updateAvailable.info.version}</>
            )}
          </span>
        </div>
        <div className="update-banner-actions">
          {status === "ready" ? (
            <button className="update-banner-btn primary" onClick={handleRestart}>
              Restart Now
            </button>
          ) : status === "downloading" ? (
            <div className="update-banner-progress">
              <div
                className="update-banner-progress-bar"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : status === "error" ? (
            <button className="update-banner-btn" onClick={handleUpdate}>
              Retry
            </button>
          ) : (
            <button className="update-banner-btn primary" onClick={handleUpdate}>
              Update
            </button>
          )}
          {status !== "downloading" && (
            <button
              className="update-banner-dismiss"
              onClick={handleDismiss}
              title="Dismiss"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
