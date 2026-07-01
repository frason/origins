import {
  EnergyStrategy,
  Traits,
  DEFAULT_TRAITS,
  TRAIT_MIN,
  TRAIT_MAX,
  TRAIT_MUTATION_RATES,
} from '../utils/traits';

describe('Traits - Definitions and Constants', () => {
  describe('DEFAULT_TRAITS', () => {
    it('should satisfy the Traits interface', () => {
      // This is a compile-time check, but we also verify at runtime
      const trait: Traits = DEFAULT_TRAITS;

      // Verify all numeric trait fields are numbers
      expect(typeof trait.size).toBe('number');
      expect(typeof trait.speed).toBe('number');
      expect(typeof trait.visionRange).toBe('number');
      expect(typeof trait.hearingRange).toBe('number');
      expect(typeof trait.camouflage).toBe('number');
      expect(typeof trait.armor).toBe('number');
      expect(typeof trait.boneDensity).toBe('number');
      expect(typeof trait.metabolism).toBe('number');
      expect(typeof trait.reproductionRate).toBe('number');
      expect(typeof trait.brainSize).toBe('number');
      expect(typeof trait.consciousnessLevel).toBe('number');
      expect(typeof trait.communication).toBe('number');
      expect(typeof trait.collectiveConnection).toBe('number');

      // Verify energyStrategy is valid
      expect(['herbivore', 'carnivore', 'omnivore', 'scavenger']).toContain(
        trait.energyStrategy
      );
    });

    it('should have all properties defined', () => {
      expect(DEFAULT_TRAITS.size).toBeDefined();
      expect(DEFAULT_TRAITS.speed).toBeDefined();
      expect(DEFAULT_TRAITS.visionRange).toBeDefined();
      expect(DEFAULT_TRAITS.hearingRange).toBeDefined();
      expect(DEFAULT_TRAITS.camouflage).toBeDefined();
      expect(DEFAULT_TRAITS.armor).toBeDefined();
      expect(DEFAULT_TRAITS.boneDensity).toBeDefined();
      expect(DEFAULT_TRAITS.metabolism).toBeDefined();
      expect(DEFAULT_TRAITS.reproductionRate).toBeDefined();
      expect(DEFAULT_TRAITS.brainSize).toBeDefined();
      expect(DEFAULT_TRAITS.consciousnessLevel).toBeDefined();
      expect(DEFAULT_TRAITS.communication).toBeDefined();
      expect(DEFAULT_TRAITS.collectiveConnection).toBeDefined();
      expect(DEFAULT_TRAITS.energyStrategy).toBeDefined();
    });
  });

  describe('TRAIT_MIN and TRAIT_MAX', () => {
    it('should have min ≤ max for all traits', () => {
      const numericTraits = [
        'size',
        'speed',
        'visionRange',
        'hearingRange',
        'camouflage',
        'armor',
        'boneDensity',
        'metabolism',
        'reproductionRate',
        'brainSize',
        'consciousnessLevel',
        'communication',
        'collectiveConnection',
      ] as const;

      for (const traitName of numericTraits) {
        const min = TRAIT_MIN[traitName];
        const max = TRAIT_MAX[traitName];

        expect(min, `TRAIT_MIN should define ${traitName}`).toBeDefined();
        expect(max, `TRAIT_MAX should define ${traitName}`).toBeDefined();
        expect(min).toBeLessThanOrEqual(max!);
      }
    });

    it('should have sensible bounds', () => {
      // Size should be positive and have a reasonable range
      expect(TRAIT_MIN.size!).toBeGreaterThan(0);
      expect(TRAIT_MAX.size!).toBeGreaterThan(TRAIT_MIN.size!);

      // Vision and hearing ranges should be non-negative
      expect(TRAIT_MIN.visionRange!).toBeGreaterThanOrEqual(0);
      expect(TRAIT_MIN.hearingRange!).toBeGreaterThanOrEqual(0);

      // Camouflage and communication should be 0-1
      expect(TRAIT_MIN.camouflage).toBe(0);
      expect(TRAIT_MAX.camouflage).toBe(1);
      expect(TRAIT_MIN.communication).toBe(0);
      expect(TRAIT_MAX.communication).toBe(1);
    });
  });

  describe('TRAIT_MUTATION_RATES', () => {
    it('should have an entry for every numeric trait', () => {
      const numericTraits = [
        'size',
        'speed',
        'visionRange',
        'hearingRange',
        'camouflage',
        'armor',
        'boneDensity',
        'metabolism',
        'reproductionRate',
        'brainSize',
        'consciousnessLevel',
        'communication',
        'collectiveConnection',
      ] as const;

      for (const traitName of numericTraits) {
        expect(
          TRAIT_MUTATION_RATES[traitName],
          `TRAIT_MUTATION_RATES should have entry for ${traitName}`
        ).toBeDefined();
        expect(typeof TRAIT_MUTATION_RATES[traitName]).toBe('number');
      }
    });

    it('should have values between 0 and 1', () => {
      for (const key in TRAIT_MUTATION_RATES) {
        const rate =
          TRAIT_MUTATION_RATES[
            key as keyof typeof TRAIT_MUTATION_RATES
          ];
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(1);
      }
    });

    it('should default to 5% (0.05) per reproduction', () => {
      // All trait mutation rates should be the default 5%
      for (const key in TRAIT_MUTATION_RATES) {
        const rate =
          TRAIT_MUTATION_RATES[
            key as keyof typeof TRAIT_MUTATION_RATES
          ];
        expect(rate).toBe(0.05);
      }
    });

    it('should not have entry for energyStrategy', () => {
      // energyStrategy is excluded from mutation rates
      expect(
        TRAIT_MUTATION_RATES['energyStrategy' as any]
      ).toBeUndefined();
    });
  });

  describe('Energy Strategy', () => {
    it('should define valid energy strategies', () => {
      const validStrategies: EnergyStrategy[] = [
        'herbivore',
        'carnivore',
        'omnivore',
        'scavenger',
      ];
      expect(validStrategies).toHaveLength(4);
      expect(validStrategies).toContain(DEFAULT_TRAITS.energyStrategy);
    });
  });
});
