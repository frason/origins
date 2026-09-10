import { describe, expect, it } from 'vitest';
import type { CreatureSnapshot } from '../state/store';
import { DEFAULT_TRAITS } from '../utils/traits';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import { buildTileLineageSummaries } from '../ui/tileInspectionModel';
import { buildTileMutationContext } from '../ui/tileInspectionModel';

const tundra = {
  energy: 10, nutrients: 10, producerBiomass: 0, toxicity: 0,
  elevation: 0.5, moisture: 0, temperature: 0,
  biome: 'tundra' as const, producerArchetype: 'frost-lichen' as const,
  substrate: 'loam' as const, waterDepth: 0, waterTable: 0, dissolvedNutrients: 0, salinity: 0,
};

function creature(id: string, energy: number, size: number, metabolism: number, toxinExposure = 0): CreatureSnapshot {
  return {
    id, speciesId: 'grazer', lineageId: 'grazer-root', parentId: null,
    traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', size, metabolism },
    x: 2, y: 3, energy, age: 10, lifecycleState: 'alive', corpseDecayTicks: 0,
    toxinExposure,
  };
}

describe('tile lineage inspection model', () => {
  it('groups occupants and explains observed food and energy context', () => {
    const summaries = buildTileLineageSummaries(
      [creature('one', 80, 0.5, 1, 0.2), creature('two', 120, 0.5, 1, 0.4)],
      0,
      40
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      population: 2,
      averageEnergy: 100,
      averageAge: 10,
      metabolicLoad: 0.5,
      averageToxinResistance: 0,
      strategy: 'herbivore',
    });
    expect(summaries[0].averageToxinExposure).toBeCloseTo(0.3);
    expect(summaries[0].averageResourcePressure).toBe(0);
    expect(summaries[0].averageReproductionMultiplier).toBe(1);
    expect(summaries[0].activeDispersers).toBe(0);
    expect(summaries[0].averageDispersalMoves).toBe(0);
    expect(summaries[0].localContext).toContain('producer biomass offers food');
    expect(summaries[0].localContext).toContain('below-baseline energy use');
  });

  it('does not present corpses as food for a herbivore', () => {
    const [summary] = buildTileLineageSummaries([creature('one', 80, 2, 1)], 3, 0);
    expect(summary.localContext).not.toContain('scavenging');
    expect(summary.localContext).toContain('high energy demand');
  });

  it('adds lineage-specific habitat pressure to tile observations', () => {
    const [summary] = buildTileLineageSummaries(
      [creature('one', 80, 1, 1)],
      0,
      0,
      { cell: tundra, waterRelief: false }
    );
    expect(summary.habitat?.rating).toBe('harsh');
    expect(summary.habitat?.summary).toContain('cold exposure');
  });

  it('separately explains local corpse miasma and its birth mutation rate', () => {
    const baseline = buildTileMutationContext(2, 3, [], SIMULATION_CONSTANTS);
    const hotspot = buildTileMutationContext(2, 3, [
      {
        ...creature('corpse', 0, 1, 1),
        lifecycleState: 'dead',
        corpseDecayTicks: 20,
      },
    ], SIMULATION_CONSTANTS);

    expect(baseline).toMatchObject({ pressure: 0, rate: 0.12, label: 'Baseline' });
    expect(hotspot.label).toBe('Peak miasma');
    expect(hotspot.pressure).toBeGreaterThan(0);
    expect(hotspot.rate).toBeGreaterThan(baseline.rate);
  });

  it('surfaces toxicity-driven mutation cause in tile mutation context', () => {
    // Test Gap 3: verify buildTileMutationContext with nonzero cellToxicity
    // produces elevated mutation pressure and correct UI label.
    const noToxicity = buildTileMutationContext(2, 3, [], SIMULATION_CONSTANTS, 0);
    const lowToxicity = buildTileMutationContext(2, 3, [], SIMULATION_CONSTANTS, 1);
    const mediumToxicity = buildTileMutationContext(2, 3, [], SIMULATION_CONSTANTS, 4);
    const highToxicity = buildTileMutationContext(2, 3, [], SIMULATION_CONSTANTS, 6);

    // No toxicity → baseline pressure
    expect(noToxicity).toMatchObject({ pressure: 0, label: 'Baseline' });

    // Low toxicity → detectable pressure but below peak
    expect(lowToxicity.pressure).toBeCloseTo(0.05);
    expect(lowToxicity.label).toBe('Miasma nearby');
    expect(lowToxicity.rate).toBeGreaterThan(noToxicity.rate);

    // Medium toxicity → elevated but not peak
    expect(mediumToxicity.pressure).toBeCloseTo(0.2);
    expect(mediumToxicity.label).toBe('Miasma nearby');
    expect(mediumToxicity.rate).toBeGreaterThan(lowToxicity.rate);

    // High toxicity → capped at 0.3, still below peak-miasma threshold (0.75)
    expect(highToxicity.pressure).toBeCloseTo(0.3);
    expect(highToxicity.label).toBe('Miasma nearby');
    expect(highToxicity.rate).toBeGreaterThan(mediumToxicity.rate);
    expect(highToxicity.rate).toBeLessThan(0.2); // mutation rate capped below 20%
  });
});
