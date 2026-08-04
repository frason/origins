/** SpeciesPanel — living species, active lineages, traits, and recent mutations. */

import { CSSProperties } from 'react';
import { useStore } from '../state/store';
import { shortLineageId, summarizeSpecies } from './speciesModel';
import { lineageDisplayName, speciesDisplayName } from '../simulation/speciesNames';
import { getAdaptiveReproductionTiming } from '../simulation/adaptiveReproduction';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import { founderSpeciesDefinition } from '../simulation/founderSpecies';
import { describeMetabolismTradeoff } from './metabolismTradeoff';
import type { WorldSnapshot } from '../state/store';
import { formatReplacementRatio, getReplacementMetrics } from './replacementMetrics';

const panelStyle: CSSProperties = {
  backgroundColor: 'var(--sim-color-screen)',
  borderRadius: 8,
  padding: '0.75rem 1rem',
  color: 'var(--sim-color-screen-ink)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '0.85rem',
};

const strategyColors: Record<string, string> = {
  herbivore: '#69b96b',
  carnivore: '#e36d6d',
  omnivore: '#d7ad57',
  scavenger: '#a98bd4',
};

export function SpeciesPanelView({ worldState }: { worldState: WorldSnapshot | null }) {
  const species = summarizeSpecies(
    worldState?.creatures ?? [],
    worldState?.speciesProfiles ?? []
  );
  const mutations = (worldState?.events ?? [])
    .filter((event) => event.type === 'mutation')
    .slice(-3)
    .reverse();
  const incipientSpecies = worldState?.incipientSpecies ?? [];
  const replacement = getReplacementMetrics(
    worldState?.events ?? [],
    worldState?.tick
      ?? worldState?.events[worldState.events.length - 1]?.tick
      ?? 0
  );
  const replacementBySpecies = new Map(
    replacement.species.map((metric) => [metric.speciesId, metric])
  );

  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Evolution</div>
      {species.length === 0 ? (
        <div style={{ color: 'var(--sim-color-screen-ink-faint)' }}>No living creatures</div>
      ) : (
        species.map((item) => {
          const livingMembers = (worldState?.creatures ?? []).filter(
            (creature) => creature.lifecycleState === 'alive' && creature.speciesId === item.speciesId
          );
          const restrainedMembers = livingMembers.filter(
            (creature) => (creature.reproductionPressureMultiplier ?? 1) > 1
          );
          const averagePressure = livingMembers.length > 0
            ? livingMembers.reduce((sum, creature) => sum + (creature.localResourcePressure ?? 0), 0)
              / livingMembers.length
            : 0;
          const dispersingMembers = livingMembers.filter(
            (creature) => creature.dispersalTargetX != null && creature.dispersalTargetY != null
          );
          const timing = getAdaptiveReproductionTiming(
            item.speciesId,
            0,
            worldState?.events ?? [],
            worldState?.constants ?? SIMULATION_CONSTANTS
          );
          const founder = founderSpeciesDefinition(item.speciesId);
          const founderMetabolism = founder?.traits.metabolism ?? 1;
          const founderMetabolismTradeoff = describeMetabolismTradeoff(founderMetabolism);
          return (
          <div
            key={item.speciesId}
            style={{ borderTop: '1px solid var(--sim-color-screen-divider)', padding: '0.55rem 0' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span style={{ color: strategyColors[item.strategy] ?? 'var(--sim-color-screen-ink-dim)', fontWeight: 600 }}>
                {speciesDisplayName(item.speciesId)}
              </span>
              <span>{item.population}</span>
            </div>
            <div style={{ color: 'var(--sim-color-screen-ink-muted)', fontSize: '0.72rem', margin: '0.15rem 0 0.35rem' }}>
              {item.strategy} · {item.speciesId} · {item.lineages.length}{' '}
              {item.lineages.length === 1 ? 'lineage' : 'lineages'}
            </div>
            <div
              title={`Births divided by deaths for this species in the last ${replacement.windowTicks} ticks. 1.00× is replacement level; a dash means no deaths have occurred.`}
              style={{ color: '#9fbdad', fontSize: '0.7rem', marginBottom: '0.35rem' }}
            >
              Live replacement · {formatReplacementRatio(
                replacementBySpecies.get(item.speciesId) ?? { births: 0, deaths: 0, ratio: null }
              )}
            </div>
            {founder && (
              <>
                <div style={{ color: '#9fbdad', fontSize: '0.7rem', marginBottom: '0.2rem' }}>
                  Founder habitat · {founder.viableBiomes[0]} primary · {founder.viableBiomes[1]} secondary
                </div>
                <div style={{ color: '#9fbdad', fontSize: '0.7rem', marginBottom: '0.35rem' }}>
                  Founder metabolism · {founderMetabolism.toFixed(2)}× ·{' '}
                  {founderMetabolismTradeoff.label}: {founderMetabolismTradeoff.summary}
                </div>
              </>
            )}
            {timing.expectedLifespan !== null && (
              <div style={{ color: '#9fbdad', fontSize: '0.7rem', marginBottom: '0.35rem' }}>
                Adaptive timing · maturity {timing.maturityAge} · expected lifespan{' '}
                {Math.round(timing.expectedLifespan)} · {timing.evidenceDeaths} deaths observed
              </div>
            )}
            {restrainedMembers.length > 0 && (
              <div style={{ color: '#c4a96d', fontSize: '0.7rem', marginBottom: '0.35rem' }}>
                Local scarcity raises breeding requirements for {restrainedMembers.length}/{livingMembers.length} members
                {' '}· average pressure {Math.round(averagePressure * 100)}%
              </div>
            )}
            {dispersingMembers.length > 0 && (
              <div style={{ color: '#9fbdad', fontSize: '0.7rem', marginBottom: '0.35rem' }}>
                {dispersingMembers.length}/{livingMembers.length} members dispersing toward lower-pressure habitat
              </div>
            )}
            {item.lineages.slice(0, 4).map((lineage) => (
              <div
                key={lineage.lineageId}
                title={lineage.lineageId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '0.5rem',
                  color: 'var(--sim-color-screen-ink-soft)',
                  fontSize: '0.72rem',
                  padding: '0.1rem 0 0.1rem 0.5rem',
                }}
              >
                <span>
                  ↳ {lineageDisplayName(item.speciesId, lineage.lineageId)} ·{' '}
                  <span title={lineage.lineageId}>{shortLineageId(lineage.lineageId)}</span> · size{' '}
                  {lineage.representativeTraits.size.toFixed(2)} · speed{' '}
                  {lineage.representativeTraits.speed.toFixed(2)}
                  {' '}· metabolism {lineage.representativeTraits.metabolism.toFixed(2)}× (
                  {describeMetabolismTradeoff(lineage.representativeTraits.metabolism).label.toLowerCase()})
                  {' '}· <span style={{ color: strategyColors[lineage.representativeTraits.energyStrategy] ?? 'var(--sim-color-screen-ink-soft)' }}>
                    {lineage.representativeTraits.energyStrategy}
                  </span>
                  {lineage.divergence > 0 && ` · diverging ${(lineage.divergence * 100).toFixed(0)}%`}
                </span>
                <span>{lineage.population}</span>
              </div>
            ))}
            {item.lineages.length > 4 && (
              <div style={{ color: 'var(--sim-color-screen-ink-faint)', fontSize: '0.7rem', paddingLeft: '0.5rem' }}>
                +{item.lineages.length - 4} more lineages
              </div>
            )}
          </div>
          );
        })
      )}

      {incipientSpecies.length > 0 && (
        <>
          <div style={{ fontWeight: 600, margin: '0.75rem 0 0.35rem' }}>Diverging lineages</div>
          {incipientSpecies.map((candidate) => {
            const members = (worldState?.creatures ?? []).filter(
              (creature) => creature.lifecycleState === 'alive'
                && creature.incipientSpeciesId === candidate.id
            );
            const generations = members.length === 0
              ? 0
              : Math.max(...members.map((creature) => creature.generation ?? 0))
                - candidate.founderGeneration;
            return (
              <div key={candidate.id} style={{ color: '#c4a96d', fontSize: '0.72rem', padding: '0.15rem 0' }}>
                {lineageDisplayName(candidate.ancestorSpeciesId, candidate.founderLineageId)} · incipient ·{' '}
                {members.length}/3 living · {generations}/2 generations ·{' '}
                {(candidate.divergence * 100).toFixed(0)}% divergent
              </div>
            );
          })}
        </>
      )}

      <div style={{ fontWeight: 600, margin: '0.75rem 0 0.35rem' }}>Recent mutations</div>
      {mutations.length === 0 ? (
        <div style={{ color: 'var(--sim-color-screen-ink-faint)', fontSize: '0.75rem' }}>No lineage branches yet</div>
      ) : (
        mutations.map((event, index) => (
          <div
            key={`${event.tick}-${event.creatureId ?? index}`}
            style={{ color: '#bba7d8', fontSize: '0.72rem', padding: '0.15rem 0' }}
          >
            tick {event.tick}: {event.detail ?? `${event.speciesId} mutated`}
          </div>
        ))
      )}
    </div>
  );
}

export default function SpeciesPanel() {
  const worldState = useStore((state) => state.worldState);
  return <SpeciesPanelView worldState={worldState} />;
}
