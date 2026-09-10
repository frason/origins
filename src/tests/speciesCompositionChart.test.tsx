import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SpeciesCompositionChart from '../ui/SpeciesCompositionChart';
import type { CreatureSnapshot } from '../state/store';

describe('SpeciesCompositionChart', () => {
  const createCreature = (
    overrides: Partial<CreatureSnapshot> = {}
  ): CreatureSnapshot => ({
    id: 'test-creature-1',
    speciesId: 'species-1',
    lineageId: 'lineage-1',
    parentId: null,
    x: 50,
    y: 50,
    energy: 100,
    age: 10,
    lifecycleState: 'alive',
    corpseDecayTicks: 0,
    traits: {
      size: 1,
      speed: 1,
      visionRange: 5,
      hearingRange: 2,
      camouflage: 0,
      armor: 0,
      boneDensity: 1,
      metabolism: 1,
      reproductionRate: 1,
      brainSize: 0,
      consciousnessLevel: 0,
      communication: 0,
      collectiveConnection: 0,
      thermalTolerance: 0,
      waterRetention: 0,
      aquaticAffinity: 0,
      terrainGrip: 0,
      toxinResistance: 0,
      auditorySteal: 0,
      energyStrategy: 'herbivore',
    },
    ...overrides,
  });

  it('renders "No living creatures" when the creature list is empty', () => {
    const html = renderToStaticMarkup(
      <SpeciesCompositionChart creatures={[]} />
    );

    expect(html).toContain('No living creatures');
    expect(html).toContain('Population by diet');
  });

  it('excludes dead creatures from totals and percentages', () => {
    const creatures: CreatureSnapshot[] = [
      createCreature({
        id: 'alive-herbivore-1',
        traits: { ...createCreature().traits, energyStrategy: 'herbivore' },
        lifecycleState: 'alive',
      }),
      createCreature({
        id: 'dead-herbivore-1',
        traits: { ...createCreature().traits, energyStrategy: 'herbivore' },
        lifecycleState: 'dead',
      }),
      createCreature({
        id: 'corpse-herbivore-1',
        traits: { ...createCreature().traits, energyStrategy: 'herbivore' },
        lifecycleState: 'corpse',
      }),
    ];

    const html = renderToStaticMarkup(
      <SpeciesCompositionChart creatures={creatures} />
    );

    // Should show total of 1 (only the alive one)
    expect(html).toContain('font-weight:600">1</');
    // Should show herbivore with 100% (1 out of 1)
    expect(html).toContain('Herbivore: <span style="font-weight:600">1 (100.0%)</');
  });

  it('correctly calculates percentages and counts for multiple strategies', () => {
    const creatures: CreatureSnapshot[] = [
      // 3 herbivores
      createCreature({
        id: 'herbivore-1',
        traits: { ...createCreature().traits, energyStrategy: 'herbivore' },
        lifecycleState: 'alive',
      }),
      createCreature({
        id: 'herbivore-2',
        traits: { ...createCreature().traits, energyStrategy: 'herbivore' },
        lifecycleState: 'alive',
      }),
      createCreature({
        id: 'herbivore-3',
        traits: { ...createCreature().traits, energyStrategy: 'herbivore' },
        lifecycleState: 'alive',
      }),
      // 1 carnivore
      createCreature({
        id: 'carnivore-1',
        traits: { ...createCreature().traits, energyStrategy: 'carnivore' },
        lifecycleState: 'alive',
      }),
      // 1 omnivore
      createCreature({
        id: 'omnivore-1',
        traits: { ...createCreature().traits, energyStrategy: 'omnivore' },
        lifecycleState: 'alive',
      }),
    ];

    const html = renderToStaticMarkup(
      <SpeciesCompositionChart creatures={creatures} />
    );

    // Total should be 5
    expect(html).toContain('font-weight:600">5</');

    // Herbivore: 3 out of 5 = 60%
    expect(html).toContain('Herbivore: <span style="font-weight:600">3 (60.0%)</');

    // Carnivore: 1 out of 5 = 20%
    expect(html).toContain('Carnivore: <span style="font-weight:600">1 (20.0%)</');

    // Omnivore: 1 out of 5 = 20%
    expect(html).toContain('Omnivore: <span style="font-weight:600">1 (20.0%)</');

    // Scavenger should not appear (0 count)
    expect(html).not.toContain('Scavenger: <span style="font-weight:600">0');
  });

  it('handles all four strategies with equal distribution', () => {
    const creatures: CreatureSnapshot[] = [
      createCreature({
        id: 'herbivore-1',
        traits: { ...createCreature().traits, energyStrategy: 'herbivore' },
        lifecycleState: 'alive',
      }),
      createCreature({
        id: 'carnivore-1',
        traits: { ...createCreature().traits, energyStrategy: 'carnivore' },
        lifecycleState: 'alive',
      }),
      createCreature({
        id: 'omnivore-1',
        traits: { ...createCreature().traits, energyStrategy: 'omnivore' },
        lifecycleState: 'alive',
      }),
      createCreature({
        id: 'scavenger-1',
        traits: { ...createCreature().traits, energyStrategy: 'scavenger' },
        lifecycleState: 'alive',
      }),
    ];

    const html = renderToStaticMarkup(
      <SpeciesCompositionChart creatures={creatures} />
    );

    // Total should be 4
    expect(html).toContain('font-weight:600">4</');

    // Each strategy should have 25%
    expect(html).toContain('Herbivore: <span style="font-weight:600">1 (25.0%)</');
    expect(html).toContain('Carnivore: <span style="font-weight:600">1 (25.0%)</');
    expect(html).toContain('Omnivore: <span style="font-weight:600">1 (25.0%)</');
    expect(html).toContain('Scavenger: <span style="font-weight:600">1 (25.0%)</');
  });

  it('includes legend labels from STRATEGY_LEGEND', () => {
    const creatures: CreatureSnapshot[] = [
      createCreature({
        id: 'herbivore-1',
        traits: { ...createCreature().traits, energyStrategy: 'herbivore' },
        lifecycleState: 'alive',
      }),
      createCreature({
        id: 'carnivore-1',
        traits: { ...createCreature().traits, energyStrategy: 'carnivore' },
        lifecycleState: 'alive',
      }),
    ];

    const html = renderToStaticMarkup(
      <SpeciesCompositionChart creatures={creatures} />
    );

    // Should include strategy labels
    expect(html).toContain('Herbivore');
    expect(html).toContain('Carnivore');
    // Should include the "Population by diet" label
    expect(html).toContain('Population by diet');
  });

  it('skips rendering strategies with zero population', () => {
    const creatures: CreatureSnapshot[] = [
      createCreature({
        id: 'herbivore-1',
        traits: { ...createCreature().traits, energyStrategy: 'herbivore' },
        lifecycleState: 'alive',
      }),
      createCreature({
        id: 'herbivore-2',
        traits: { ...createCreature().traits, energyStrategy: 'herbivore' },
        lifecycleState: 'alive',
      }),
    ];

    const html = renderToStaticMarkup(
      <SpeciesCompositionChart creatures={creatures} />
    );

    // Should show herbivore entry
    expect(html).toContain('Herbivore');

    // Should NOT show carnivore, omnivore, or scavenger entries in the legend
    // (they have 0 count and are skipped by the conditional rendering)
    const carnivoreMatches = html.match(/Carnivore: <span style="font-weight:600">0/g);
    const omnivoreMatches = html.match(/Omnivore: <span style="font-weight:600">0/g);
    const scavengerMatches = html.match(/Scavenger: <span style="font-weight:600">0/g);

    expect(carnivoreMatches).toBeNull();
    expect(omnivoreMatches).toBeNull();
    expect(scavengerMatches).toBeNull();
  });

  it('correctly processes mixed alive, dead, and corpse creatures', () => {
    const creatures: CreatureSnapshot[] = [
      // 2 alive herbivores
      createCreature({
        id: 'alive-herb-1',
        traits: { ...createCreature().traits, energyStrategy: 'herbivore' },
        lifecycleState: 'alive',
      }),
      createCreature({
        id: 'alive-herb-2',
        traits: { ...createCreature().traits, energyStrategy: 'herbivore' },
        lifecycleState: 'alive',
      }),
      // 1 dead herbivore (should be ignored)
      createCreature({
        id: 'dead-herb-1',
        traits: { ...createCreature().traits, energyStrategy: 'herbivore' },
        lifecycleState: 'dead',
      }),
      // 1 corpse herbivore (should be ignored)
      createCreature({
        id: 'corpse-herb-1',
        traits: { ...createCreature().traits, energyStrategy: 'herbivore' },
        lifecycleState: 'corpse',
      }),
      // 1 alive carnivore
      createCreature({
        id: 'alive-carn-1',
        traits: { ...createCreature().traits, energyStrategy: 'carnivore' },
        lifecycleState: 'alive',
      }),
      // 2 dead carnivores (should be ignored)
      createCreature({
        id: 'dead-carn-1',
        traits: { ...createCreature().traits, energyStrategy: 'carnivore' },
        lifecycleState: 'dead',
      }),
      createCreature({
        id: 'dead-carn-2',
        traits: { ...createCreature().traits, energyStrategy: 'carnivore' },
        lifecycleState: 'dead',
      }),
    ];

    const html = renderToStaticMarkup(
      <SpeciesCompositionChart creatures={creatures} />
    );

    // Total should be 3 (2 alive herbivores + 1 alive carnivore)
    expect(html).toContain('font-weight:600">3</');

    // Herbivore: 2 out of 3 ≈ 66.7%
    expect(html).toContain('Herbivore: <span style="font-weight:600">2 (66.7%)</');

    // Carnivore: 1 out of 3 ≈ 33.3%
    expect(html).toContain('Carnivore: <span style="font-weight:600">1 (33.3%)</');
  });

  it('renders population header with total count', () => {
    const creatures: CreatureSnapshot[] = [
      createCreature({
        id: 'creature-1',
        traits: { ...createCreature().traits, energyStrategy: 'herbivore' },
        lifecycleState: 'alive',
      }),
      createCreature({
        id: 'creature-2',
        traits: { ...createCreature().traits, energyStrategy: 'herbivore' },
        lifecycleState: 'alive',
      }),
      createCreature({
        id: 'creature-3',
        traits: { ...createCreature().traits, energyStrategy: 'herbivore' },
        lifecycleState: 'alive',
      }),
    ];

    const html = renderToStaticMarkup(
      <SpeciesCompositionChart creatures={creatures} />
    );

    // Should display "Population by diet" label with the total
    expect(html).toContain('Population by diet');
    expect(html).toContain('font-weight:600">3</');
  });
});
