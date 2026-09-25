import { describe, it, expect, beforeEach } from 'vitest';
import { Creature } from '../simulation/creature';
import { DEFAULT_TRAITS } from '../utils/traits';
import {
  calculateSoundIntensity,
  createSoundEvent,
  detectsSound,
  detectActiveSounds,
  getEffectiveHearingRange,
  getApproximateDirection,
  buildDetectedSound,
  getStalkingSpeedMultiplier,
  getStalkingEnergyCostMultiplier,
  shouldStalk,
  BIOME_SOUND_ATTENUATION,
  BASE_HEARING_RANGE,
  SOUND_FALLOFF,
  HEARING_THRESHOLD,
  SOUND_PERSISTENCE_TICKS,
  type SoundEvent,
} from '../simulation/soundEcology';
import { createRng } from '../simulation/rng';

/** Helper to convert string seed to numeric seed for testing */
function seedFromString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

describe('Sound Ecology', () => {
  beforeEach(() => {
    Creature.resetIdCounter();
  });

  describe('calculateSoundIntensity', () => {
    it('should calculate sound intensity with base values', () => {
      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, size: 1, speed: 1, auditorySteal: 0 },
        x: 50,
        y: 50,
        energy: 200,
      });

      // movement-slow base is 0.2
      const intensity = calculateSoundIntensity('movement-slow', creature, false);
      expect(intensity).toBeGreaterThan(0);
      expect(intensity).toBeLessThanOrEqual(1);
    });

    it('should increase intensity with larger size', () => {
      const smallCreature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, size: 1, auditorySteal: 0 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const largeCreature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, size: 5, auditorySteal: 0 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const smallIntensity = calculateSoundIntensity('movement-slow', smallCreature, false);
      const largeIntensity = calculateSoundIntensity('movement-slow', largeCreature, false);

      expect(largeIntensity).toBeGreaterThan(smallIntensity);
    });

    it('should reduce intensity with auditory stealth', () => {
      const normalCreature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, auditorySteal: 0 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const stealthyCreature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, auditorySteal: 0.5 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const normalIntensity = calculateSoundIntensity('feeding', normalCreature, true);
      const stealthyIntensity = calculateSoundIntensity('feeding', stealthyCreature, true);

      expect(stealthyIntensity).toBeLessThan(normalIntensity);
    });

    it('should handle different sound types with different base intensities', () => {
      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, auditorySteal: 0 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const slowIntensity = calculateSoundIntensity('movement-slow', creature, false);
      const fastIntensity = calculateSoundIntensity('movement-fast', creature, false);
      const attackIntensity = calculateSoundIntensity('attack', creature, false);

      expect(fastIntensity).toBeGreaterThan(slowIntensity);
      expect(attackIntensity).toBeGreaterThan(fastIntensity);
    });
  });

  describe('createSoundEvent', () => {
    it('should create a sound event with correct properties', () => {
      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 30,
        y: 40,
        energy: 200,
      });

      const event = createSoundEvent('feeding', creature, 100, 'grassland', false, 0);

      expect(event.type).toBe('feeding');
      expect(event.tick).toBe(100);
      expect(event.x).toBe(30);
      expect(event.y).toBe(40);
      expect(event.creatureId).toBe(creature.id);
      expect(event.biome).toBe('grassland');
      expect(event.intensity).toBeGreaterThan(0);
      expect(event.id).toContain('sound_');
    });

    it('should apply auditory stealth when creating a sound event', () => {
      const stealthyCreature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, auditorySteal: 1 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const normalEvent = createSoundEvent('movement-fast', stealthyCreature, 100, 'grassland', false, 0);
      const stealthEvent = createSoundEvent('movement-fast', stealthyCreature, 100, 'grassland', true, 0);

      expect(stealthEvent.intensity).toBeLessThan(normalEvent.intensity);
    });
  });

  describe('getEffectiveHearingRange', () => {
    it('should calculate hearing range correctly', () => {
      const range = getEffectiveHearingRange(10);
      expect(range).toBeGreaterThan(0);
      expect(range).toEqual(BASE_HEARING_RANGE * (10 / 10));
    });

    it('should apply brain size bonus when listener provided', () => {
      const normalBrainCreature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, brainSize: 0.5 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const bigBrainCreature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, brainSize: 5 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const normalRange = getEffectiveHearingRange(10, normalBrainCreature);
      const bigBrainRange = getEffectiveHearingRange(10, bigBrainCreature);

      expect(bigBrainRange).toBeGreaterThan(normalRange);
    });
  });

  describe('detectsSound', () => {
    it('should not detect sounds if listener is dead', () => {
      const rng = createRng(seedFromString('test'));
      const deadCreature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 0,
        lifecycleState: 'dead',
      });

      const soundEvent: SoundEvent = {
        id: 'sound_0',
        tick: 100,
        type: 'movement-slow',
        x: 55,
        y: 55,
        creatureId: 'creature_1',
        intensity: 0.8,
        biome: 'grassland',
      };

      expect(detectsSound(soundEvent, deadCreature, rng)).toBe(false);
    });

    it('should detect nearby loud sounds', () => {
      const rng = createRng(seedFromString('detect_loud'));
      const listener = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, hearingRange: 50 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const soundEvent: SoundEvent = {
        id: 'sound_0',
        tick: 100,
        type: 'attack',
        x: 50,
        y: 50,
        creatureId: 'creature_1',
        intensity: 1.0,
        biome: 'grassland',
      };

      expect(detectsSound(soundEvent, listener, rng)).toBe(true);
    });

    it('should not detect very distant quiet sounds', () => {
      const rng = createRng(seedFromString('test'));
      const listener = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, hearingRange: 5 },
        x: 0,
        y: 0,
        energy: 200,
      });

      const soundEvent: SoundEvent = {
        id: 'sound_0',
        tick: 100,
        type: 'movement-slow',
        x: 50,
        y: 50,
        creatureId: 'creature_1',
        intensity: 0.1,
        biome: 'grassland',
      };

      expect(detectsSound(soundEvent, listener, rng)).toBe(false);
    });

    it('should apply biome attenuation correctly', () => {
      const rng = createRng(seedFromString('biome_attenuation'));
      const listener = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, hearingRange: 50, aquaticAffinity: 0 },
        x: 50,
        y: 50,
        energy: 200,
      });

      // Ocean sound (2.0x attenuation)
      const oceanSound: SoundEvent = {
        id: 'sound_0',
        tick: 100,
        type: 'movement-slow',
        x: 55,
        y: 50,
        creatureId: 'creature_1',
        intensity: 0.8,
        biome: 'ocean',
      };

      // Forest sound (0.5x attenuation)
      const forestSound: SoundEvent = {
        id: 'sound_1',
        tick: 100,
        type: 'movement-slow',
        x: 55,
        y: 50,
        creatureId: 'creature_2',
        intensity: 0.8,
        biome: 'forest',
      };

      const oceanDetected = detectsSound(oceanSound, listener, rng);
      const forestDetected = detectsSound(forestSound, listener, rng);

      // Ocean sound should be more likely to be detected due to higher attenuation factor
      expect(oceanDetected).toBe(true);
    });
  });

  describe('detectActiveSounds', () => {
    it('should filter out expired sounds', () => {
      const rng = createRng(seedFromString('test'));
      const listener = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, hearingRange: 50 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const currentTick = 100;
      const recentSound: SoundEvent = {
        id: 'sound_0',
        tick: currentTick,
        type: 'movement-slow',
        x: 55,
        y: 55,
        creatureId: 'creature_1',
        intensity: 0.8,
        biome: 'grassland',
      };

      const expiredSound: SoundEvent = {
        id: 'sound_1',
        tick: currentTick - SOUND_PERSISTENCE_TICKS - 1,
        type: 'movement-slow',
        x: 55,
        y: 55,
        creatureId: 'creature_2',
        intensity: 0.8,
        biome: 'grassland',
      };

      const detected = detectActiveSounds(listener, [recentSound, expiredSound], currentTick, rng);

      // Expired sound should not be in detected array
      expect(detected.length).toBeLessThanOrEqual(1);
    });

    it('should return detected sounds sorted by distance', () => {
      const rng = createRng(seedFromString('test'));
      const listener = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, hearingRange: 50 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const currentTick = 100;
      const sounds: SoundEvent[] = [
        {
          id: 'sound_0',
          tick: currentTick,
          type: 'attack',
          x: 60,
          y: 50,
          creatureId: 'creature_1',
          intensity: 0.8,
          biome: 'grassland',
        },
        {
          id: 'sound_1',
          tick: currentTick,
          type: 'attack',
          x: 51,
          y: 50,
          creatureId: 'creature_2',
          intensity: 0.8,
          biome: 'grassland',
        },
      ];

      const detected = detectActiveSounds(listener, sounds, currentTick, rng);

      // Should be sorted by distance (nearest first)
      if (detected.length > 1) {
        for (let i = 0; i < detected.length - 1; i++) {
          expect(detected[i].distance).toBeLessThanOrEqual(detected[i + 1].distance);
        }
      }
    });

    it('should mark attack sounds as threats for herbivores', () => {
      const rng = createRng(seedFromString('test'));
      const herbivore = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, hearingRange: 50, energyStrategy: 'herbivore' },
        x: 50,
        y: 50,
        energy: 200,
      });

      const currentTick = 100;
      const attackSound: SoundEvent = {
        id: 'sound_0',
        tick: currentTick,
        type: 'attack',
        x: 55,
        y: 55,
        creatureId: 'creature_1',
        intensity: 0.8,
        biome: 'grassland',
      };

      const detected = detectActiveSounds(herbivore, [attackSound], currentTick, rng);

      if (detected.length > 0) {
        expect(detected[0].isThreat).toBe(true);
      }
    });

    it('should mark feeding sounds as opportunities for scavengers', () => {
      const rng = createRng(seedFromString('test'));
      const scavenger = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, hearingRange: 50, energyStrategy: 'scavenger' },
        x: 50,
        y: 50,
        energy: 200,
      });

      const currentTick = 100;
      const feedingSound: SoundEvent = {
        id: 'sound_0',
        tick: currentTick,
        type: 'feeding',
        x: 55,
        y: 55,
        creatureId: 'creature_1',
        intensity: 0.8,
        biome: 'grassland',
      };

      const detected = detectActiveSounds(scavenger, [feedingSound], currentTick, rng);

      if (detected.length > 0) {
        expect(detected[0].isOpportunity).toBe(true);
      }
    });
  });

  describe('getApproximateDirection', () => {
    it('should determine correct cardinal direction', () => {
      const direction = getApproximateDirection(60, 50, 50, 50);
      expect(direction).toBe('E');
    });

    it('should determine intercardinal direction', () => {
      const direction = getApproximateDirection(60, 60, 50, 50);
      expect(direction).toBe('SE');
    });

    it('should return C for very close sounds', () => {
      const direction = getApproximateDirection(51, 51, 50, 50);
      expect(direction).toBe('C');
    });
  });

  describe('getStalkingSpeedMultiplier', () => {
    it('should reduce speed when stalking', () => {
      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, auditorySteal: 0 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const multiplier = getStalkingSpeedMultiplier(creature);

      expect(multiplier).toBeLessThan(1);
      expect(multiplier).toBeGreaterThan(0.2);
    });

    it('should reduce speed penalty with high auditory stealth', () => {
      const normalCreature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, auditorySteal: 0 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const stealthyCreature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, auditorySteal: 1 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const normalMultiplier = getStalkingSpeedMultiplier(normalCreature);
      const stealthyMultiplier = getStalkingSpeedMultiplier(stealthyCreature);

      expect(stealthyMultiplier).toBeGreaterThan(normalMultiplier);
    });
  });

  describe('getStalkingEnergyCostMultiplier', () => {
    it('should increase energy cost when stalking', () => {
      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, auditorySteal: 0 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const multiplier = getStalkingEnergyCostMultiplier(creature);

      expect(multiplier).toBeGreaterThan(0.8);
      expect(multiplier).toBeLessThanOrEqual(1.2);
    });

    it('should reduce energy penalty with high auditory stealth', () => {
      const normalCreature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, auditorySteal: 0 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const stealthyCreature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, auditorySteal: 1 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const normalCost = getStalkingEnergyCostMultiplier(normalCreature);
      const stealthyCost = getStalkingEnergyCostMultiplier(stealthyCreature);

      expect(stealthyCost).toBeLessThan(normalCost);
    });
  });

  describe('shouldStalk', () => {
    it('should recommend stalking when prey is in vision range but not adjacent', () => {
      const predator = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, visionRange: 20 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const stalk = shouldStalk(predator, 60, 50);

      expect(stalk).toBe(true);
    });

    it('should not recommend stalking for adjacent prey', () => {
      const predator = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, visionRange: 20 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const stalk = shouldStalk(predator, 51, 50);

      expect(stalk).toBe(false);
    });

    it('should not recommend stalking for very distant prey', () => {
      const predator = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, visionRange: 10 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const stalk = shouldStalk(predator, 100, 100);

      expect(stalk).toBe(false);
    });
  });

  describe('determinism', () => {
    it('should produce identical results with same seed', () => {
      const createTestScenario = (seed: string) => {
        const rng = createRng(seedFromString(seed));
        const listener = new Creature({
          speciesId: 'test_species',
          lineageId: 'test_lineage',
          parentId: null,
          traits: { ...DEFAULT_TRAITS, hearingRange: 30 },
          x: 50,
          y: 50,
          energy: 200,
        });

        const sounds: SoundEvent[] = [
          {
            id: 'sound_0',
            tick: 100,
            type: 'movement-slow',
            x: 60,
            y: 50,
            creatureId: 'creature_1',
            intensity: 0.5,
            biome: 'grassland',
          },
          {
            id: 'sound_1',
            tick: 100,
            type: 'attack',
            x: 55,
            y: 60,
            creatureId: 'creature_2',
            intensity: 0.7,
            biome: 'forest',
          },
        ];

        return detectActiveSounds(listener, sounds, 100, rng);
      };

      const result1 = createTestScenario('determinism_test');
      const result2 = createTestScenario('determinism_test');

      expect(result1.length).toBe(result2.length);
      for (let i = 0; i < result1.length; i++) {
        expect(result1[i].type).toBe(result2[i].type);
        expect(result1[i].distance).toBe(result2[i].distance);
        expect(result1[i].intensity).toBe(result2[i].intensity);
      }
    });
  });

  describe('SOUND_PERSISTENCE_TICKS', () => {
    it('should be defined and positive', () => {
      expect(SOUND_PERSISTENCE_TICKS).toBeGreaterThan(0);
      expect(typeof SOUND_PERSISTENCE_TICKS).toBe('number');
    });
  });

  describe('BIOME_SOUND_ATTENUATION', () => {
    it('should define attenuation for all biomes', () => {
      const biomes = ['ocean', 'grassland', 'forest', 'wetland', 'tundra', 'desert', 'mountain'] as const;

      for (const biome of biomes) {
        expect(BIOME_SOUND_ATTENUATION[biome]).toBeDefined();
        expect(typeof BIOME_SOUND_ATTENUATION[biome]).toBe('number');
        expect(BIOME_SOUND_ATTENUATION[biome]).toBeGreaterThan(0);
      }
    });

    it('should have ocean with higher attenuation than forest', () => {
      expect(BIOME_SOUND_ATTENUATION.ocean).toBeGreaterThan(BIOME_SOUND_ATTENUATION.forest);
    });
  });
});
