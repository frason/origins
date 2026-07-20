import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAITS } from '../utils/traits';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import type { CellSnapshot, CreatureSnapshot, WorldSnapshot } from '../state/store';
import {
  buildLocalBiomassSummary,
  buildTileBiomassContext,
} from '../ui/biomassObservability';

const cell = (producerBiomass: number): CellSnapshot => ({
  energy: 10,
  nutrients: 25,
  producerBiomass,
  toxicity: 0,
  elevation: 0.5,
  moisture: 0.5,
  temperature: 0.5,
  biome: 'grassland',
  producerArchetype: 'ground-cover',
});

const grazer = (): CreatureSnapshot => ({
  id: 'grazer',
  speciesId: 'grazer',
  lineageId: 'grazer',
  parentId: null,
  traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
  x: 0,
  y: 0,
  energy: 80,
  age: 5,
  lifecycleState: 'alive',
  corpseDecayTicks: 0,
});

describe('biomass observability', () => {
  it('distinguishes global abundance from depleted occupied habitat', () => {
    const world = {
      width: 2,
      height: 1,
      cells: [cell(10), cell(100)],
      creatures: [grazer()],
      events: [],
      history: [],
    } as WorldSnapshot;

    expect(buildLocalBiomassSummary(world)).toMatchObject({
      totalBiomass: 110,
      averageOccupiedTileBiomass: 10,
      depletedOccupiedTileShare: 1,
      recoveryLabel: '—',
    });
  });

  it('uses bounded history samples for recovery trend', () => {
    const world = {
      width: 1,
      height: 1,
      cells: [cell(30)],
      creatures: [grazer()],
      events: [],
      history: [
        { tick: 0, biomass: { averageOccupiedTileBiomass: 10 } },
        { tick: 10, biomass: { averageOccupiedTileBiomass: 20 } },
      ],
    } as unknown as WorldSnapshot;

    expect(buildLocalBiomassSummary(world).recoveryLabel).toBe('↑ Recovering');
  });

  it('explains tile capacity, grazing pressure, and predicted recovery', () => {
    const context = buildTileBiomassContext(cell(10), [grazer()], SIMULATION_CONSTANTS);

    expect(context.capacity).toBe(100);
    expect(context.biomassShare).toBe(0.1);
    expect(context.grazingLabel).toBe('High');
    expect(context.grazingCapacity).toBeGreaterThan(0);
    expect(context.recoveryPerTick).toBeGreaterThan(0);
  });
});
