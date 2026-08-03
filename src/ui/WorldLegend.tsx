import { useState } from 'react';

export default function WorldLegend() {
  const [open, setOpen] = useState(false);

  return (
    <aside
      className={`world-legend sim-panel${open ? ' world-legend--open' : ''}`}
      aria-label="World map legend"
    >
      <button
        type="button"
        className="world-legend__toggle"
        aria-expanded={open}
        aria-controls="world-legend-details"
        onClick={() => setOpen((value) => !value)}
      >
        Map key
      </button>
      <div id="world-legend-details" className="world-legend__details">
        <span><i className="world-legend__swatch world-legend__swatch--life" />Life / species hue</span>
        <span><i className="world-legend__swatch world-legend__swatch--elevation" />Light / dark contours: elevation</span>
        <span><i className="world-legend__swatch world-legend__swatch--biomass" />Green: producer biomass</span>
        <span><i className="world-legend__swatch world-legend__swatch--toxicity" />Violet: toxicity hazard</span>
        <span><i className="world-legend__swatch world-legend__swatch--miasma" />Amber edge: mutation pressure</span>
        <span><i className="world-legend__swatch world-legend__swatch--followed" />White ring: followed lineage</span>
      </div>
    </aside>
  );
}
