/**
 * Compare Alert View
 *
 * Shows detailed comparison of an ecosystem alert:
 * - Current and previous values
 * - Similar alerts
 * - Metric trend
 */

import { useCallback } from 'react';
import { useStore } from '../state/store';
import type { EcosystemAlert } from '../simulation/watches';
import './CompareAlert.css';

interface CompareAlertProps {
  alert: EcosystemAlert;
  onClose: () => void;
}

export default function CompareAlert({ alert, onClose }: CompareAlertProps) {
  const ecosystemAlerts = useStore((s) => s.ecosystemAlerts);

  // Find similar alerts (same watch type, species if applicable)
  const similarAlerts = ecosystemAlerts.filter(
    (a) =>
      a.type === alert.type &&
      a.speciesId === alert.speciesId &&
      a.id !== alert.id &&
      !a.dismissed
  );

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const formatValue = (value: number | undefined): string => {
    if (value === undefined) return '—';
    return value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value.toFixed(1);
  };

  const getChangeIndicator = (current: number, previous: number | undefined): string => {
    if (previous === undefined) return '—';
    const change = ((current - previous) / previous) * 100;
    if (change > 0) return `↑ +${change.toFixed(1)}%`;
    if (change < 0) return `↓ ${change.toFixed(1)}%`;
    return 'No change';
  };

  return (
    <div className="compare-alert-modal">
      <div className="compare-alert-content">
        <div className="compare-alert-header">
          <h2>Compare Alert</h2>
          <button
            className="compare-alert-close"
            onClick={handleClose}
            type="button"
            aria-label="Close comparison"
          >
            ✕
          </button>
        </div>

        <div className="compare-alert-subject">
          <div className="compare-alert-badge" style={{ backgroundColor: `var(--severity-${alert.severity})` }}>
            {alert.severity.toUpperCase()}
          </div>
          <div>
            <h3>{alert.speciesName || alert.type}</h3>
            <p className="compare-alert-type">{alert.type}</p>
          </div>
        </div>

        <div className="compare-alert-metrics">
          <div className="compare-alert-metric">
            <label>Current Value</label>
            <div className="compare-alert-value">
              {formatValue(alert.evidence.currentValue)} <span className="compare-alert-unit">{alert.evidence.unit}</span>
            </div>
          </div>

          <div className="compare-alert-metric">
            <label>Threshold</label>
            <div className="compare-alert-value">
              {formatValue(alert.evidence.threshold)} <span className="compare-alert-unit">{alert.evidence.unit}</span>
            </div>
          </div>

          {alert.evidence.previousValue !== undefined && (
            <>
              <div className="compare-alert-metric">
                <label>Previous Value</label>
                <div className="compare-alert-value">
                  {formatValue(alert.evidence.previousValue)} <span className="compare-alert-unit">{alert.evidence.unit}</span>
                </div>
              </div>

              <div className="compare-alert-metric">
                <label>Change</label>
                <div className="compare-alert-value compare-alert-change">
                  {getChangeIndicator(alert.evidence.currentValue, alert.evidence.previousValue)}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="compare-alert-cause">
          <label>Alert Reason</label>
          <p>{alert.cause}</p>
        </div>

        {similarAlerts.length > 0 && (
          <div className="compare-alert-similar">
            <label>Similar Active Alerts</label>
            <div className="compare-alert-similar-list">
              {similarAlerts.slice(0, 3).map((similar) => (
                <div key={similar.id} className="compare-alert-similar-item">
                  <div className="compare-alert-similar-value">
                    {formatValue(similar.evidence.currentValue)} {similar.evidence.unit}
                  </div>
                  <div className="compare-alert-similar-tick">
                    Tick {similar.tick.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="compare-alert-actions">
          <button
            className="compare-alert-action-btn"
            onClick={handleClose}
            type="button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
