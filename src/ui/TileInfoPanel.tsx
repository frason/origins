import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { getProducerTraits } from '../simulation/producerTypes';
import { buildTileLineageSummaries } from './tileInspectionModel';
import { buildTileBiomassContext } from './biomassObservability';
import { getCorpseDecayStage, getToxicityHazard } from '../simulation/toxicity';

interface TileInfoPanelProps {
  onOpenLineages?: () => void;
}

export default function TileInfoPanel({ onOpenLineages }: TileInfoPanelProps) {
  const selectedTile = useStore((state) => state.selectedTile);
  const worldState = useStore((state) => state.worldState);
  const followedLineages = useStore((state) => state.followedLineages);
  const setSelectedTile = useStore((state) => state.setSelectedTile);
  const toggleFollowedLineage = useStore((state) => state.toggleFollowedLineage);
  const constants = useStore((state) => state.constants);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => setExpanded(false), [selectedTile?.x, selectedTile?.y]);

  if (!selectedTile || !worldState) return null;

  const cellIndex = selectedTile.y * worldState.width + selectedTile.x;
  const cell = worldState.cells[cellIndex];
  if (!cell) return null;
  const producerTraits = getProducerTraits(cell.producerArchetype);
  const tileCreatures = worldState.creatures.filter(
    (creature) => creature.x === selectedTile.x && creature.y === selectedTile.y
  );
  const living = tileCreatures.filter((creature) => creature.lifecycleState === 'alive');
  const corpses = tileCreatures.filter((creature) => creature.lifecycleState !== 'alive');
  const waterRelief = worldState.cells.some((candidate, index) => {
    const x = index % worldState.width;
    const y = Math.floor(index / worldState.width);
    return Math.max(Math.abs(x - selectedTile.x), Math.abs(y - selectedTile.y)) <= 1
      && (candidate.biome === 'ocean' || candidate.biome === 'wetland');
  });
  const lineages = buildTileLineageSummaries(
    living,
    corpses.length,
    cell.producerBiomass,
    { cell, waterRelief }
  );
  const biomass = buildTileBiomassContext(cell, living, constants);
  const toxicity = getToxicityHazard(cell.toxicity);

  return (
    <aside
      className={`tile-inspector sim-window${expanded ? ' tile-inspector--expanded' : ''}`}
      aria-labelledby="tile-inspector-title"
    >
      <header className="tile-inspector__header sim-window__title-bar">
        <div>
          <h2 className="sim-window__title" id="tile-inspector-title">
            Tile {selectedTile.x}, {selectedTile.y}
          </h2>
          <span className="tile-inspector__subtitle">
            {cell.biome} · {living.length} living · {corpses.length} {corpses.length === 1 ? 'corpse' : 'corpses'}
          </span>
        </div>
        <div className="sim-window__controls">
          <button
            type="button"
            className="sim-button sim-button--compact tile-inspector__expand"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Less' : 'Inspect'}
          </button>
          <button type="button" className="sim-button sim-button--compact" onClick={() => setSelectedTile(null)}>
            Close
          </button>
        </div>
      </header>

      <div className="tile-inspector__body">
        <section className="tile-inspector__section sim-panel" aria-labelledby="tile-landscape-title">
          <h3 className="sim-panel__heading" id="tile-landscape-title">Landscape</h3>
          <dl className="tile-inspector__data-grid">
            <div><dt>Biome</dt><dd>{cell.biome}</dd></div>
            <div><dt>Elevation</dt><dd>{cell.elevation.toFixed(2)}</dd></div>
            <div><dt>Moisture</dt><dd>{cell.moisture.toFixed(2)}</dd></div>
            <div><dt>Temperature</dt><dd>{cell.temperature.toFixed(2)}</dd></div>
          </dl>
        </section>

        <section className="tile-inspector__section sim-panel" aria-labelledby="tile-resources-title">
          <h3 className="sim-panel__heading" id="tile-resources-title">Resources</h3>
          <dl className="tile-inspector__data-grid">
            <div><dt>Energy</dt><dd>{cell.energy.toFixed(2)}</dd></div>
            <div><dt>Nutrients</dt><dd>{cell.nutrients.toFixed(2)}</dd></div>
            <div><dt>Biomass / capacity</dt><dd>{cell.producerBiomass.toFixed(1)} / {biomass.capacity}</dd></div>
            <div><dt>Toxicity</dt><dd>{toxicity.label} ({cell.toxicity.toFixed(2)})</dd></div>
            <div><dt>Producer</dt><dd>{cell.producerArchetype.replace(/-/g, ' ')}</dd></div>
            <div><dt>Capacity used</dt><dd>{Math.round(biomass.biomassShare * 100)}%</dd></div>
            <div><dt>Grazing pressure</dt><dd>{biomass.grazingLabel} ({biomass.grazingCapacity.toFixed(0)} max)</dd></div>
            <div><dt>Recovery</dt><dd>{biomass.recoveryLabel} ({biomass.recoveryPerTick >= 0 ? '+' : ''}{biomass.recoveryPerTick.toFixed(2)}/tick)</dd></div>
            <div><dt>Growth rate</dt><dd>{producerTraits.growthMultiplier.toFixed(2)}×</dd></div>
          </dl>
          <p className="tile-inspector__mechanics-note">
            Grazing estimates the food these animals could remove this tick. Recovery predicts the next producer-growth step from sunlight, nutrients, toxicity, and biome limits.
          </p>
          <p className="tile-inspector__mechanics-note">
            Toxicity currently allows {Math.round(toxicity.producerGrowthMultiplier * 100)}% producer growth
            and costs exposed animals {toxicity.creatureEnergyCost.toFixed(2)} energy per tick.
          </p>
        </section>

        <section className="tile-inspector__section tile-inspector__section--life" aria-labelledby="tile-life-title">
          <div className="tile-inspector__section-heading">
            <h3 className="sim-panel__heading" id="tile-life-title">Life here</h3>
            {lineages.length > 0 && onOpenLineages && (
              <button type="button" className="tile-inspector__text-button" onClick={onOpenLineages}>
                Open lineage history
              </button>
            )}
          </div>
          {lineages.length === 0 ? (
            <p className="tile-inspector__empty">No living creatures on this tile.</p>
          ) : lineages.map((lineage) => {
            const followed = followedLineages.some(
              (item) => item.speciesId === lineage.speciesId && item.lineageId === lineage.lineageId
            );
            return (
              <article className="tile-lineage sim-panel sim-panel--sunken" key={`${lineage.speciesId}:${lineage.lineageId}`}>
                <div className="tile-lineage__heading">
                  <div>
                    <h4 className="tile-lineage__name">{lineage.name}</h4>
                    <p className="tile-lineage__strategy">{lineage.strategy} · {lineage.population} present</p>
                  </div>
                  <button
                    type="button"
                    className={`sim-button sim-button--compact${followed ? ' sim-button--pressed' : ''}`}
                    aria-pressed={followed}
                    onClick={() => toggleFollowedLineage({ speciesId: lineage.speciesId, lineageId: lineage.lineageId })}
                  >
                    {followed ? '★ Following' : '☆ Follow'}
                  </button>
                </div>
                <dl className="tile-lineage__metrics sim-data">
                  <div><dt>Avg. energy</dt><dd>{lineage.averageEnergy.toFixed(1)}</dd></div>
                  <div><dt>Avg. age</dt><dd>{lineage.averageAge.toFixed(1)}</dd></div>
                  <div><dt>Energy load</dt><dd>{lineage.metabolicLoad.toFixed(2)}×</dd></div>
                  <div><dt>Avg. toxin exposure</dt><dd>{lineage.averageToxinExposure.toFixed(2)}</dd></div>
                  <div><dt>Avg. toxin resistance</dt><dd>{Math.round(lineage.averageToxinResistance * 100)}%</dd></div>
                  <div><dt>Resource pressure</dt><dd>{Math.round(lineage.averageResourcePressure * 100)}%</dd></div>
                  <div><dt>Breeding requirement</dt><dd>{lineage.averageReproductionMultiplier.toFixed(2)}×</dd></div>
                </dl>
                <p className="tile-lineage__context">{lineage.localContext}</p>
                {lineage.habitat && (
                  <p className={`tile-lineage__context sim-status--${lineage.habitat.rating === 'favorable' ? 'positive' : 'warning'}`}>
                    <strong>{lineage.habitat.summary}</strong>{' '}
                    Climate cost: {lineage.habitat.stressPerTick.toFixed(3)} energy/tick.
                    {lineage.habitat.adaptations.length > 0 && ` Expressed adaptations: ${lineage.habitat.adaptations.join(', ')}.`}
                  </p>
                )}
                <p className="tile-lineage__context">
                  Resistance reduces toxin harm but consumes energy even in clean habitat;
                  accumulated exposure raises the energy needed to reproduce.
                </p>
                {lineage.averageReproductionMultiplier > 1 && (
                  <p className="tile-lineage__context sim-status--warning">
                    Local consumers currently outweigh accessible food, so this lineage needs
                    more stored energy before breeding. No resources or creatures are changed directly.
                  </p>
                )}
              </article>
            );
          })}
          <p className="tile-inspector__mechanics-note">
            Habitat ratings combine local temperature, moisture, nearby water, and each lineage's expressed adaptations.
          </p>
        </section>

        {corpses.length > 0 && (
          <section className="tile-inspector__section sim-panel" aria-labelledby="tile-corpses-title">
            <h3 className="sim-panel__heading" id="tile-corpses-title">Corpses ({corpses.length})</h3>
            <ul className="tile-inspector__corpse-list">
              {corpses.map((corpse) => (
                <li key={corpse.id}>
                  {getCorpseDecayStage(corpse.corpseDecayTicks, constants.corpseDecayDurationTicks).label}
                  {' · '}remaining: <span className="sim-data">{corpse.corpseDecayTicks} ticks</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}
