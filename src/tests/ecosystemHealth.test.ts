import { describe, expect, it } from 'vitest';
import { getBiodiversityState, getEcosystemDynamics } from '../ui/ecosystemHealth';
import type { EventSnapshot, WorldSnapshot } from '../state/store';
import { DEFAULT_TRAITS } from '../utils/traits';

function snapshot({
  populations,
  lineages = 1,
  events = [],
  biomass = 1000,
}: {
  populations: number[];
  lineages?: number;
  events?: EventSnapshot[];
  biomass?: number;
}): WorldSnapshot {
  const creatures = populations.flatMap((count, speciesIndex) =>
    Array.from({ length: count }, (_, creatureIndex) => ({
      id: `${speciesIndex}-${creatureIndex}`,
      speciesId: `species-${speciesIndex}`,
      lineageId: creatureIndex < lineages ? `lineage-${speciesIndex}-${creatureIndex}` : `lineage-${speciesIndex}-0`,
      parentId: null,
      traits: {
        ...DEFAULT_TRAITS,
        energyStrategy: (['herbivore', 'carnivore', 'omnivore', 'scavenger'] as const)[speciesIndex % 4],
      },
      x: 0,
      y: 0,
      energy: 100,
      age: 1,
      lifecycleState: 'alive' as const,
      corpseDecayTicks: 0,
    }))
  );
  return {
    width: 1,
    height: 1,
    cells: [{
      energy: 10, nutrients: 0, producerBiomass: biomass, toxicity: 0,
      elevation: 0, moisture: 0.5, temperature: 0.5, biome: 'grassland',
      producerArchetype: 'ground-cover',
    }],
    creatures,
    events,
  };
}

describe('ecosystem dynamics indicators', () => {
  it('classifies biodiversity at the requested thresholds', () => {
    expect(getBiodiversityState(0).tone).toBe('danger');
    expect(getBiodiversityState(2).tone).toBe('warning');
    expect(getBiodiversityState(5).tone).toBe('healthy');
  });

  it('reports collapse when life or producer support is gone', () => {
    expect(getEcosystemDynamics(snapshot({ populations: [] }), 100, 500).overall.label)
      .toBe('Collapsing');
    expect(getEcosystemDynamics(snapshot({ populations: [5], biomass: 0 }), 100, 500).overall.label)
      .toBe('Collapsing');
  });

  it('identifies an orderly but inactive ecosystem as stagnant', () => {
    const result = getEcosystemDynamics(snapshot({ populations: [5, 5, 5, 5] }), 200, 500);

    expect(result.order.score).toBeGreaterThanOrEqual(75);
    expect(result.chaos.label).toBe('Dormant');
    expect(result.overall.label).toBe('Stagnant');
  });

  it('recognizes balanced turnover and evolutionary exploration', () => {
    const events: EventSnapshot[] = [
      ...Array.from({ length: 20 }, (_, index) => ({ type: 'birth' as const, tick: 150 + index })),
      ...Array.from({ length: 10 }, (_, index) => ({ type: 'death' as const, tick: 160 + index })),
      ...Array.from({ length: 3 }, (_, index) => ({ type: 'mutation' as const, tick: 170 + index })),
    ];
    const result = getEcosystemDynamics(
      snapshot({ populations: [5, 5, 5, 5], lineages: 2, events }),
      200,
      500
    );

    expect(result.chaos.label).toBe('Dynamic');
    expect(result.exploration.label).toBe('Branching');
    expect(result.overall.label).toBe('Balanced');
  });

  it('flags destructive turnover as turbulent and replays identically', () => {
    const world = snapshot({
      populations: [8, 2],
      events: Array.from({ length: 80 }, (_, index) => ({
        type: 'death' as const,
        tick: 100 + index,
      })),
    });
    const first = getEcosystemDynamics(world, 200, 500);

    expect(first.chaos.label).toBe('Turbulent');
    expect(first.overall.label).toBe('Turbulent');
    expect(getEcosystemDynamics(world, 200, 500)).toEqual(first);
  });

  it('ignores a large old history outside the live health window', () => {
    const recent: EventSnapshot[] = [
      { type: 'birth', tick: 190 },
      { type: 'death', tick: 191 },
      { type: 'mutation', tick: 192 },
    ];
    const compact = snapshot({ populations: [5, 5], lineages: 2, events: recent });
    const old: EventSnapshot[] = Array.from({ length: 10_000 }, (_, index) => ({
      type: index % 2 ? 'birth' : 'death', tick: Math.floor(index / 100),
    }));
    const long = snapshot({ populations: [5, 5], lineages: 2, events: [...old, ...recent] });

    expect(getEcosystemDynamics(long, 200, 500))
      .toEqual(getEcosystemDynamics(compact, 200, 500));
  });
});
