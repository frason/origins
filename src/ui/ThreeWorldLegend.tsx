/**
 * Legend for Three.js Living World overlays.
 * Explains each toggleable overlay and how to interpret the colors.
 */

import './ThreeWorldLegend.css';

export type OverlayKey =
  | 'biomass'
  | 'energy'
  | 'toxicity'
  | 'mutation-pressure'
  | 'corpse'
  | 'habitat'
  | 'lineage';

interface OverlayLegendEntry {
  key: OverlayKey;
  label: string;
  color?: string;
  description: string;
  icon?: string; // emoji or symbol
}

const OVERLAY_LEGENDS: Record<OverlayKey, OverlayLegendEntry> = {
  biomass: {
    key: 'biomass',
    label: 'Producer Biomass',
    color: '#b6d967',
    description:
      'Green tint indicates plant/algae density. Brighter = higher biomass supporting herbivores.',
    icon: '🌿',
  },
  energy: {
    key: 'energy',
    label: 'Available Energy',
    color: '#ffed4e',
    description:
      'Solar, geothermal, or chemical energy level per cell. Brighter = more accessible food.',
    icon: '⚡',
  },
  toxicity: {
    key: 'toxicity',
    label: 'Toxicity Hazard',
    color: '#dc5b43',
    description:
      'Violet/red overlay shows decaying corpses and residual toxins. Lethal to sensitive species.',
    icon: '☠️',
  },
  'mutation-pressure': {
    key: 'mutation-pressure',
    label: 'Mutation Pressure',
    color: '#ffd659',
    description:
      'Amber edge around cells where many corpses are decaying. High mutation rate nearby.',
    icon: '🧬',
  },
  corpse: {
    key: 'corpse',
    label: 'Corpse & Decay',
    color: '#8b6f55',
    description: 'Brown octahedron shapes show dead creatures and their decay stage.',
    icon: '💀',
  },
  habitat: {
    key: 'habitat',
    label: 'Habitat Suitability',
    color: '#70a85a',
    description:
      'Green = grassland, blue = ocean, brown = desert. Biome color indicates climate fit.',
    icon: '🏞️',
  },
  lineage: {
    key: 'lineage',
    label: 'Followed Lineage',
    color: '#ffffff',
    description: 'White ring highlights your followed lineage. If no lineage is selected, all living creatures are highlighted. Click a creature to follow its lineage.',
    icon: '👁️',
  },
};

interface ThreeWorldLegendProps {
  open?: boolean;
  onToggle?: () => void;
  activeOverlays?: Set<OverlayKey>;
  onOverlayToggle?: (key: OverlayKey) => void;
}

export default function ThreeWorldLegend({
  open = false,
  onToggle,
  activeOverlays = new Set(),
  onOverlayToggle,
}: ThreeWorldLegendProps) {
  return (
    <aside
      className={`three-world-legend sim-panel${open ? ' three-world-legend--open' : ''}`}
      aria-label="Three.js world overlay legend"
    >
      <button
        type="button"
        className="three-world-legend__toggle"
        aria-expanded={open}
        aria-controls="three-world-legend-details"
        onClick={onToggle}
      >
        Overlays
      </button>
      <div
        id="three-world-legend-details"
        className="three-world-legend__details"
        role="region"
        aria-label="Overlay controls and explanations"
      >
        <div className="three-world-legend__intro">
          <p>
            Toggle layers to observe ecology dynamics: energy, biomass production,
            toxicity hazards, mutation pressure zones, decaying corpses, habitat fit,
            and your followed lineages.
          </p>
        </div>
        <div className="three-world-legend__controls">
          {(Object.values(OVERLAY_LEGENDS) as OverlayLegendEntry[]).map(
            (overlay) => (
              <label
                key={overlay.key}
                className="three-world-legend__overlay-toggle"
              >
                <input
                  type="checkbox"
                  checked={activeOverlays.has(overlay.key)}
                  onChange={() => onOverlayToggle?.(overlay.key)}
                  aria-label={`Toggle ${overlay.label} overlay`}
                />
                <span className="three-world-legend__icon">
                  {overlay.icon ?? '◼'}
                </span>
                <span className="three-world-legend__label">
                  <strong>{overlay.label}</strong>
                </span>
              </label>
            )
          )}
        </div>
        <div className="three-world-legend__entries">
          {(Object.values(OVERLAY_LEGENDS) as OverlayLegendEntry[]).map(
            (overlay) => (
              <div
                key={overlay.key}
                className="three-world-legend__entry"
                data-overlay={overlay.key}
              >
                <div className="three-world-legend__entry-header">
                  <span className="three-world-legend__swatch"
                    data-color={overlay.color ?? '#888888'}
                    aria-hidden="true"
                  />
                  <h3 className="three-world-legend__entry-title">
                    {overlay.label}
                  </h3>
                </div>
                <p className="three-world-legend__entry-description">
                  {overlay.description}
                </p>
              </div>
            )
          )}
        </div>
        <div className="three-world-legend__accessibility-note">
          <p>
            <strong>Accessibility:</strong> Use keyboard (arrow keys to select, Space to toggle
            overlays), touch gestures (two-finger pinch to zoom), or pointer device. Reduced
            motion preferences respected. Canvas 2D fallback available if WebGL unavailable.
          </p>
        </div>
      </div>
    </aside>
  );
}

export { OVERLAY_LEGENDS };
export type { OverlayLegendEntry };
