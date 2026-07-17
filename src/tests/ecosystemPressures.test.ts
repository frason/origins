import { describe, expect, it } from 'vitest';
import type { CellSnapshot, CreatureSnapshot, WorldSnapshot } from '../state/store';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import { DEFAULT_TRAITS } from '../utils/traits';
import { getEcosystemPressures } from '../ui/ecosystemPressures';

function creature(id: string, speciesId = id, energy = 100): CreatureSnapshot {
  return {
    id, speciesId, lineageId: `${speciesId}-root`, parentId: null,
    traits: { ...DEFAULT_TRAITS }, x: 0, y: 0, energy, age: 1,
    lifecycleState: 'alive', corpseDecayTicks: 0,
  };
}

function cell(toxicity = 0): CellSnapshot {
  return {
    energy: 10, nutrients: 0, producerBiomass: 100, toxicity,
    elevation: 0.5, moisture: 0.5, temperature: 0.5,
    biome: 'grassland', producerArchetype: 'ground-cover',
  };
}

function world(creatures: CreatureSnapshot[], events: WorldSnapshot['events'] = [], cells = [cell()]): WorldSnapshot {
  return { width: cells.length, height: 1, cells, creatures, events };
}

describe('evidence-based ecosystem pressure explanations', () => {
  it('prioritizes collapse and recorded causes while respecting the limit', () => {
    const state = world([], [
      { type: 'death', tick: 20, deathCause: 'predation' },
      { type: 'death', tick: 21, deathCause: 'starvation' },
      { type: 'death', tick: 22, deathCause: 'starvation' },
    ]);
    const pressures = getEcosystemPressures(state, 25, SIMULATION_CONSTANTS, 2);

    expect(pressures).toHaveLength(2);
    expect(pressures[0].id).toBe('collapse');
    expect(pressures[1]).toMatchObject({
      id: 'cause:starvation',
      evidence: '2 recorded deaths in the last 25 ticks',
    });
  });

  it('uses only recent structured causes and does not invent unknown ones', () => {
    const state = world([creature('alive')], [
      { type: 'death', tick: 1, deathCause: 'overcrowding' },
      { type: 'death', tick: 29, deathCause: 'unknown' },
      { type: 'death', tick: 30 },
    ]);
    const pressures = getEcosystemPressures(state, 30, SIMULATION_CONSTANTS);
    expect(pressures).toEqual([expect.objectContaining({ id: 'mild' })]);
  });

  it('detects capacity, dominance, and low-energy evidence with documented thresholds', () => {
    const crowdedConstants = { ...SIMULATION_CONSTANTS, maxGlobalPopulation: 5 };
    const dominant = world([
      creature('a1', 'alpha', 20), creature('a2', 'alpha', 20),
      creature('a3', 'alpha', 20), creature('a4', 'alpha', 20),
      creature('a5', 'alpha', 20),
      creature('b1', 'beta', 100),
    ]);
    const pressures = getEcosystemPressures(dominant, 10, crowdedConstants, 10);
    expect(pressures.map((pressure) => pressure.id)).toEqual(
      expect.arrayContaining(['capacity', 'dominance', 'low-energy'])
    );
    expect(pressures.find((pressure) => pressure.id === 'dominance')?.evidence).toContain('83%');
  });

  it('reports sufficiently broad toxicity but ignores isolated low toxicity', () => {
    const toxic = world([creature('alive')], [], Array.from({ length: 10 }, () => cell(1)));
    expect(getEcosystemPressures(toxic, 10, SIMULATION_CONSTANTS, 10))
      .toContainEqual(expect.objectContaining({ id: 'toxicity' }));
    expect(getEcosystemPressures(world([creature('alive')], [], [cell(0.1)]), 10, SIMULATION_CONSTANTS))
      .toEqual([expect.objectContaining({ id: 'mild' })]);
  });

  it('returns identical bounded explanations for identical evidence', () => {
    const state = world([creature('a'), creature('b')]);
    const first = getEcosystemPressures(state, 50, SIMULATION_CONSTANTS, 1);
    expect(first).toHaveLength(1);
    expect(getEcosystemPressures(state, 50, SIMULATION_CONSTANTS, 1)).toEqual(first);
    expect(getEcosystemPressures(null, 0, SIMULATION_CONSTANTS)).toEqual([]);
  });
});
