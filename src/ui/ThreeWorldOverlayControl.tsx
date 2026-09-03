/**
 * Control panel for toggling Three.js World overlays.
 * Provides quick access to enable/disable individual ecology layers.
 */

import React, { useState, useCallback } from 'react';
import type { OverlayKey } from './ThreeWorldLegend';
import ThreeWorldLegend from './ThreeWorldLegend';

interface ThreeWorldOverlayControlProps {
  activeOverlays?: Set<OverlayKey>;
  onOverlayToggle?: (key: OverlayKey) => void;
  onFallbackMode?: () => void;
  isFallbackActive?: boolean;
}

export default function ThreeWorldOverlayControl({
  activeOverlays = new Set(['biomass', 'toxicity']),
  onOverlayToggle,
  onFallbackMode,
  isFallbackActive = false,
}: ThreeWorldOverlayControlProps) {
  const [legendOpen, setLegendOpen] = useState(false);

  const handleLegendToggle = useCallback(() => {
    setLegendOpen((current) => !current);
  }, []);

  const handleOverlayToggle = useCallback(
    (key: OverlayKey) => {
      onOverlayToggle?.(key);
    },
    [onOverlayToggle]
  );

  return (
    <div className="three-world-overlay-control">
      <ThreeWorldLegend
        open={legendOpen}
        onToggle={handleLegendToggle}
        activeOverlays={activeOverlays}
        onOverlayToggle={handleOverlayToggle}
      />
      {isFallbackActive && (
        <div
          className="three-world-overlay-control__fallback-notice"
          role="alert"
          aria-live="assertive"
        >
          <p>
            <strong>Note:</strong> Canvas 2D rendering active (WebGL unavailable).
            Some features may be simplified.
          </p>
          {onFallbackMode && (
            <button
              type="button"
              onClick={onFallbackMode}
              aria-label="Retry WebGL initialization"
            >
              Retry WebGL
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export type { ThreeWorldOverlayControlProps };
