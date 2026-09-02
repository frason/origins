/**
 * Alert Banner
 *
 * Displays active ecosystem alerts with action buttons.
 * Supports Focus, Pause, Compare, and Dismiss actions.
 * Mobile-friendly and keyboard-accessible.
 */

import { useCallback, useEffect } from 'react';
import { useStore } from '../state/store';
import type { EcosystemAlert } from '../simulation/watches';
import './AlertBanner.css';

interface AlertBannerProps {
  onFocus?: (alert: EcosystemAlert) => void;
  onPause?: () => void;
  onCompare?: (alert: EcosystemAlert) => void;
}

export default function AlertBanner({
  onFocus,
  onPause,
  onCompare,
}: AlertBannerProps) {
  const ecosystemAlerts = useStore((s) => s.ecosystemAlerts);
  const dismissAlert = useStore((s) => s.dismissAlert);
  const setSelectedTile = useStore((s) => s.setSelectedTile);
  const setRunning = useStore((s) => s.setRunning);

  const activeAlerts = ecosystemAlerts.filter((a) => !a.dismissed);

  // Define all hooks BEFORE any conditional returns (React Rules of Hooks)
  const handleFocus = useCallback(
    (alert: EcosystemAlert) => {
      if (alert.x !== undefined && alert.y !== undefined) {
        setSelectedTile({ x: alert.x, y: alert.y });
      }
      if (onFocus) {
        onFocus(alert);
      }
    },
    [setSelectedTile, onFocus]
  );

  const handlePause = useCallback(() => {
    setRunning(false);
    if (onPause) {
      onPause();
    }
  }, [setRunning, onPause]);

  const handleCompare = useCallback(
    (alert: EcosystemAlert) => {
      if (onCompare) {
        onCompare(alert);
      }
    },
    [onCompare]
  );

  const handleDismiss = useCallback(
    (alertId: string) => {
      dismissAlert(alertId);
    },
    [dismissAlert]
  );

  // Keyboard handling for alerts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape dismisses all alerts
      if (e.key === 'Escape' && activeAlerts.length > 0) {
        activeAlerts.forEach((alert) => {
          dismissAlert(alert.id);
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeAlerts, dismissAlert]);

  // Render nothing if no active alerts (after all hooks)
  if (activeAlerts.length === 0) {
    return null;
  }

  const severityClass = (severity: string) => `alert-banner__severity--${severity}`;

  return (
    <div className="alert-banner" role="region" aria-live="polite" aria-label="Active alerts">
      {activeAlerts.map((alert) => (
        <div
          key={alert.id}
          className={`alert-banner__item ${severityClass(alert.severity)}`}
          role="alertdialog"
          aria-labelledby={`alert-${alert.id}-title`}
          aria-describedby={`alert-${alert.id}-cause`}
        >
          <div className="alert-banner__content">
            <div className="alert-banner__header">
              <span
                className={`alert-banner__badge alert-banner__badge--${alert.severity}`}
                aria-label={alert.severity}
              >
                {alert.severity.toUpperCase()}
              </span>
              <h3 id={`alert-${alert.id}-title`} className="alert-banner__title">
                {alert.speciesName || alert.type}
              </h3>
            </div>

            <p
              id={`alert-${alert.id}-cause`}
              className="alert-banner__cause"
            >
              {alert.cause}
            </p>

            <div className="alert-banner__evidence">
              <span className="alert-banner__evidence-label">Current:</span>
              <span className="alert-banner__evidence-value">
                {alert.evidence.currentValue} {alert.evidence.unit}
              </span>
              {alert.evidence.previousValue !== undefined && (
                <>
                  <span className="alert-banner__evidence-label">Previous:</span>
                  <span className="alert-banner__evidence-value">
                    {alert.evidence.previousValue} {alert.evidence.unit}
                  </span>
                </>
              )}
              <span className="alert-banner__evidence-label">Threshold:</span>
              <span className="alert-banner__evidence-value">
                {alert.evidence.threshold} {alert.evidence.unit}
              </span>
            </div>
          </div>

          <div className="alert-banner__actions">
            {alert.x !== undefined && alert.y !== undefined && (
              <button
                className="alert-banner__action alert-banner__action--focus"
                onClick={() => handleFocus(alert)}
                type="button"
                title="Navigate to this location"
                aria-label={`Focus on location ${alert.x}, ${alert.y}`}
              >
                Focus
              </button>
            )}

            <button
              className="alert-banner__action alert-banner__action--pause"
              onClick={handlePause}
              type="button"
              title="Pause simulation"
              aria-label="Pause simulation"
            >
              Pause
            </button>

            <button
              className="alert-banner__action alert-banner__action--compare"
              onClick={() => handleCompare(alert)}
              type="button"
              title="Compare with similar alerts"
              aria-label="Compare this alert"
            >
              Compare
            </button>

            <button
              className="alert-banner__action alert-banner__action--dismiss"
              onClick={() => handleDismiss(alert.id)}
              type="button"
              title="Dismiss this alert"
              aria-label={`Dismiss alert: ${alert.cause}`}
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      <div className="alert-banner__footer">
        <span className="alert-banner__count">
          {activeAlerts.length} active {activeAlerts.length === 1 ? 'alert' : 'alerts'}
        </span>
      </div>
    </div>
  );
}
