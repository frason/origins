export default function WorldLegend() {
  return (
    <aside className="world-legend sim-panel" aria-label="World map legend">
      <strong>Map key</strong>
      <span><i className="world-legend__swatch world-legend__swatch--life" />Life / species hue</span>
      <span><i className="world-legend__swatch world-legend__swatch--elevation" />Light / dark contours: elevation</span>
      <span><i className="world-legend__swatch world-legend__swatch--biomass" />Green: producer biomass</span>
      <span><i className="world-legend__swatch world-legend__swatch--toxicity" />Violet: toxicity hazard</span>
      <span><i className="world-legend__swatch world-legend__swatch--miasma" />Amber edge: mutation pressure</span>
      <span><i className="world-legend__swatch world-legend__swatch--followed" />White ring: followed lineage</span>
    </aside>
  );
}
