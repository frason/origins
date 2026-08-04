import { useState } from 'react';

function prefersWideLayout(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(min-width: 48rem)').matches;
}

export default function WorldLegend() {
  const [open, setOpen] = useState(prefersWideLayout);

  if (!open) {
    return (
      <button
        type="button"
        className="world-legend__reopen"
        aria-label="Show map key"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">🗺</span>
      </button>
    );
  }

  return (
    <aside className="world-legend sim-panel" aria-label="World map legend">
      <div className="world-legend__header">
        <strong>Map key</strong>
        <button
          type="button"
          className="world-legend__dismiss"
          aria-label="Dismiss map key"
          onClick={() => setOpen(false)}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <span><i className="world-legend__swatch world-legend__swatch--life" />Life / species hue</span>
      <span><i className="world-legend__swatch world-legend__swatch--elevation" />Light / dark contours: elevation</span>
      <span><i className="world-legend__swatch world-legend__swatch--biomass" />Green: producer biomass</span>
      <span><i className="world-legend__swatch world-legend__swatch--toxicity" />Violet: toxicity hazard</span>
      <span><i className="world-legend__swatch world-legend__swatch--miasma" />Amber edge: mutation pressure</span>
    </aside>
  );
}
