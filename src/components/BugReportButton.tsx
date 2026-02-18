/**
 * Bug report modal for submitting bug reports via Formspark.
 *
 * Triggered externally via `isOpen` / `onClose` props.
 *
 * @module components/BugReportButton
 */

import { useState } from 'react';
import '../styles/bug-report.css';

const FORMSPARK_ACTION = 'https://submit-form.com/13matekcb';

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BugReportModal({ isOpen, onClose }: BugReportModalProps) {
  const [loomUrl, setLoomUrl] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!loomUrl.trim() && !description.trim()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      const response = await fetch(FORMSPARK_ACTION, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          loom_url: loomUrl.trim() || undefined,
          description: description.trim() || undefined,
          timestamp: new Date().toISOString(),
          platform: navigator.platform,
        }),
      });

      if (response.ok) {
        setSubmitStatus('success');
        setLoomUrl('');
        setDescription('');
        setTimeout(() => {
          onClose();
          setSubmitStatus('idle');
        }, 2000);
      } else {
        setSubmitStatus('error');
      }
    } catch {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
    setSubmitStatus('idle');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="bug-report-overlay" onClick={handleClose} onKeyDown={handleKeyDown}>
      <div className="bug-report-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bug-report-header">
          <h2>Report a Bug</h2>
          <button className="bug-report-close" onClick={handleClose}>
            &times;
          </button>
        </div>

        {submitStatus === 'success' ? (
          <div className="bug-report-success">
            <span className="bug-report-success-icon">✓</span>
            <p>Thank you! Your report has been submitted.</p>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)}>
            <div className="bug-report-body">
              <div className="bug-report-field">
                <label className="bug-report-label">
                  Loom Video URL <span className="bug-report-preferred">(Preferred)</span>
                </label>
                <input
                  type="url"
                  className="bug-report-input"
                  value={loomUrl}
                  onChange={(e) => setLoomUrl(e.target.value)}
                  placeholder="https://www.loom.com/share/..."
                  autoFocus
                />
                <p className="bug-report-hint">
                  Record your screen showing the bug with{' '}
                  <a href="https://www.loom.com" target="_blank" rel="noopener noreferrer">
                    Loom
                  </a>
                </p>
              </div>

              <div className="bug-report-divider">
                <span>or</span>
              </div>

              <div className="bug-report-field">
                <label className="bug-report-label">Description</label>
                <textarea
                  className="bug-report-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what happened and what you expected to happen..."
                  rows={4}
                />
              </div>

              {submitStatus === 'error' && (
                <div className="bug-report-error">Failed to submit. Please try again.</div>
              )}
            </div>

            <div className="bug-report-footer">
              <button type="button" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || (!loomUrl.trim() && !description.trim())}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
