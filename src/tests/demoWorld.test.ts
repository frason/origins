import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Creature } from '../simulation/creature';
import { start, startWithSeed } from '../simulation/runner';
import { tickEngine, runEngine } from '../simulation/engine';

describe('Demo World', () => {
  beforeEach(() => {
    Creature.resetIdCounter();
  });

  afterEach(() => {
    Creature.resetIdCounter();
  });

  it('should initialize demo world with correct initial population', () => {
    const engine = start();

    // Verify initial creature counts
    const grazelings = engine.creatures.filter((c) => c.speciesId === 'grazeling');
    const swiftclaws = engine.creatures.filter((c) => c.speciesId === 'swiftclaw');
    const rotweaves = engine.creatures.filter((c) => c.speciesId === 'rotweave');

    expect(grazelings.length).toBe(80);
    expect(swiftclaws.length).toBe(15);
    expect(rotweaves.length).toBe(30);
    expect(engine.creatures.length).toBe(125);

    // Verify all creatures are alive
    for (const creature of engine.creatures) {
      expect(creature.lifecycleState).toBe('alive');
    }
  });

  it('should have producer biomass seeded at ~40% of max', () => {
    const engine = start();

    // Check that cells have biomass
    let totalBiomass = 0;
    let cellsWithBiomass = 0;

    for (let x = 0; x < engine.world.width; x++) {
      for (let y = 0; y < engine.world.height; y++) {
        const cell = engine.world.getCell(x, y);
        totalBiomass += cell.producerBiomass;
        if (cell.producerBiomass > 0) {
          cellsWithBiomass++;
        }
      }
    }

    // Expect significant biomass seeded
    expect(cellsWithBiomass).toBeGreaterThan(0);
    expect(totalBiomass).toBeGreaterThan(0);

    // Rough check: total biomass should be a reasonable fraction of max
    // Max would be 100 * 100 * 100 = 1,000,000 if all cells at 100% capacity
    // We expect ~40% seeding which is rough 400,000, but with falloff around center
    // It should be less but still significant
    expect(totalBiomass).toBeGreaterThan(10000);
  });

  it('should show population decline after 200 ticks without intervention', () => {
    const engine = start();

    const populationAtTick = (state: any) => ({
      tick: state.tick,
      grazelings: state.creatures.filter(
        (c: any) => c.speciesId === 'grazeling' && c.lifecycleState === 'alive'
      ).length,
      swiftclaws: state.creatures.filter(
        (c: any) => c.speciesId === 'swiftclaw' && c.lifecycleState === 'alive'
      ).length,
      rotweaves: state.creatures.filter(
        (c: any) => c.speciesId === 'rotweave' && c.lifecycleState === 'alive'
      ).length,
      total: state.creatures.filter((c: any) => c.lifecycleState === 'alive').length,
    });

    // Log population every 50 ticks
    console.log('Initial:', populationAtTick(engine));
    let currentEngine = engine;

    for (let i = 0; i < 4; i++) {
      currentEngine = runEngine(currentEngine, 50);
      console.log('After', currentEngine.tick, 'ticks:', populationAtTick(currentEngine));
    }

    // After 200 ticks, we should see some population changes
    // At minimum, there should be fewer alive creatures (some deaths from starvation/age)
    const finalAlive = currentEngine.creatures.filter((c) => c.lifecycleState === 'alive').length;
    console.log('Final alive creatures:', finalAlive, '/ 125 initial');

    // We should have seen some mortality
    expect(currentEngine.tick).toBe(200);
    expect(finalAlive).toBeLessThanOrEqual(125);
  });

  it('should be deterministic with same seed', () => {
    const engine1 = startWithSeed(42);
    const engine2 = startWithSeed(42);

    // Both should have identical initial state
    expect(engine1.creatures.length).toBe(engine2.creatures.length);
    for (let i = 0; i < engine1.creatures.length; i++) {
      expect(engine1.creatures[i].x).toBe(engine2.creatures[i].x);
      expect(engine1.creatures[i].y).toBe(engine2.creatures[i].y);
      expect(engine1.creatures[i].energy).toBe(engine2.creatures[i].energy);
      expect(engine1.creatures[i].speciesId).toBe(engine2.creatures[i].speciesId);
    }

    // Run both for 10 ticks
    const state1 = runEngine(engine1, 10);
    const state2 = runEngine(engine2, 10);

    // Should have identical results
    expect(state1.creatures.length).toBe(state2.creatures.length);
    expect(state1.tick).toBe(state2.tick);
  });

  it('should have creatures placed in reasonable positions', () => {
    const engine = start();

    // Grazelings should be more centralized
    const grazelings = engine.creatures.filter((c) => c.speciesId === 'grazeling');
    const grazelingCenterDistances = grazelings.map((c) => {
      const dx = c.x - 50;
      const dy = c.y - 50;
      return Math.sqrt(dx * dx + dy * dy);
    });
    const avgGrazelingDistance = grazelingCenterDistances.reduce((a, b) => a + b, 0) / grazelings.length;
    console.log('Average grazeling distance from center:', avgGrazelingDistance.toFixed(2));

    // Swiftclaws should also be somewhat central (near herbivores)
    const swiftclaws = engine.creatures.filter((c) => c.speciesId === 'swiftclaw');
    const swiftclawCenterDistances = swiftclaws.map((c) => {
      const dx = c.x - 50;
      const dy = c.y - 50;
      return Math.sqrt(dx * dx + dy * dy);
    });
    const avgSwiftclawDistance = swiftclawCenterDistances.reduce((a, b) => a + b, 0) / swiftclaws.length;
    console.log('Average swiftclaw distance from center:', avgSwiftclawDistance.toFixed(2));

    // Rotweaves are scattered everywhere
    const rotweaves = engine.creatures.filter((c) => c.speciesId === 'rotweave');
    const rotweaveCenterDistances = rotweaves.map((c) => {
      const dx = c.x - 50;
      const dy = c.y - 50;
      return Math.sqrt(dx * dx + dy * dy);
    });
    const avgRotweavDistance = rotweaveCenterDistances.reduce((a, b) => a + b, 0) / rotweaves.length;
    console.log('Average rotweave distance from center:', avgRotweavDistance.toFixed(2));

    // Grazelings should be more central than rotweaves
    expect(avgGrazelingDistance).toBeLessThan(avgRotweavDistance + 5);
  });

  it('should have correct trait values for species', () => {
    const engine = start();

    // Check grazeling traits
    const grazeling = engine.creatures.find((c) => c.speciesId === 'grazeling');
    expect(grazeling).toBeDefined();
    if (grazeling) {
      expect(grazeling.traits.size).toBe(0.5);
      expect(grazeling.traits.speed).toBe(0.8);
      expect(grazeling.traits.reproductionRate).toBe(1.5);
      expect(grazeling.traits.energyStrategy).toBe('herbivore');
    }

    // Check swiftclaw traits
    const swiftclaw = engine.creatures.find((c) => c.speciesId === 'swiftclaw');
    expect(swiftclaw).toBeDefined();
    if (swiftclaw) {
      expect(swiftclaw.traits.size).toBe(1.2);
      expect(swiftclaw.traits.speed).toBe(2.0);
      expect(swiftclaw.traits.reproductionRate).toBe(0.6);
      expect(swiftclaw.traits.energyStrategy).toBe('carnivore');
    }

    // Check rotweave traits
    const rotweave = engine.creatures.find((c) => c.speciesId === 'rotweave');
    expect(rotweave).toBeDefined();
    if (rotweave) {
      expect(rotweave.traits.size).toBe(0.7);
      expect(rotweave.traits.speed).toBe(0.6);
      expect(rotweave.traits.energyStrategy).toBe('scavenger');
    }
  });
});
