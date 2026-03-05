/**
 * SettingsModal - app-level settings accessible from the dashboard.
 *
 * Currently contains:
 * - Analytics opt-out toggle
 *
 * @module components/SettingsModal
 */

import { useState, useEffect, useCallback } from 'react';
import { CloseIcon } from './icons';
import { getAnalyticsEnabled, setAnalyticsEnabled, trackEvent } from '../lib/analytics';
import { getCalendarHidden, setCalendarHidden } from '../lib/settings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCalendarHiddenChange?: (hidden: boolean) => void;
}

export function SettingsModal({ isOpen, onClose, onCalendarHiddenChange }: SettingsModalProps) {
  const [analyticsEnabled, setLocalAnalyticsEnabled] = useState(true);
  const [calendarVisible, setLocalCalendarVisible] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      const [enabled, hidden] = await Promise.all([getAnalyticsEnabled(), getCalendarHidden()]);
      if (!cancelled) {
        setLocalAnalyticsEnabled(enabled);
        setLocalCalendarVisible(!hidden);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    const newValue = !analyticsEnabled;
    setLocalAnalyticsEnabled(newValue);
    void setAnalyticsEnabled(newValue);
    if (newValue) {
      // Track re-enable (this fires before the backend disables, so it gets sent)
      void trackEvent('analytics_enabled', { $screen_name: 'Settings' });
    }
  }, [analyticsEnabled]);

  const handleCalendarToggle = useCallback(() => {
    const newVisible = !calendarVisible;
    setLocalCalendarVisible(newVisible);
    void setCalendarHidden(!newVisible);
    void trackEvent('calendar_visibility_toggled', {
      visible: newVisible,
      $screen_name: 'Settings',
    });
    onCalendarHiddenChange?.(!newVisible);
  }, [calendarVisible, onCalendarHiddenChange]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2>Settings</h2>
          <button className="plugins-close-btn" onClick={onClose}>
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="settings-modal-body">
          <div className="settings-section">
            <div className="settings-row">
              <div className="settings-row-info">
                <span className="settings-row-label">Activity calendar</span>
                <span className="settings-row-description">
                  Show your GitHub contribution graph on the dashboard.
                </span>
              </div>
              <button
                className={`settings-toggle ${calendarVisible ? 'on' : 'off'}`}
                onClick={handleCalendarToggle}
                disabled={loading}
                role="switch"
                aria-checked={calendarVisible}
              >
                <span className="settings-toggle-track">
                  <span className="settings-toggle-thumb" />
                </span>
              </button>
            </div>
            <div className="settings-row">
              <div className="settings-row-info">
                <span className="settings-row-label">Usage analytics</span>
                <span className="settings-row-description">
                  Help improve Ship Studio by sharing usage data like feature usage, and errors.
                </span>
              </div>
              <button
                className={`settings-toggle ${analyticsEnabled ? 'on' : 'off'}`}
                onClick={handleToggle}
                disabled={loading}
                role="switch"
                aria-checked={analyticsEnabled}
              >
                <span className="settings-toggle-track">
                  <span className="settings-toggle-thumb" />
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
