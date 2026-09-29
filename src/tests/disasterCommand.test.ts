import { describe, it, expect } from 'vitest';
import {
  validateDisasterCommand,
  getDefaultRadius,
  getAvailableDisasterKinds,
  getBeneficialDisasters,
  getHarmfulDisasters,
  ENABLED_DISASTERS,
  type DisasterCommand,
} from '../simulation/disasterCommand';

describe('Disaster Command', () => {
  describe('Validation', () => {
    it('accepts valid commands', () => {
      const cmd: DisasterCommand = {
        id: 'test-1',
        tick: 100,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
      };

      const result = validateDisasterCommand(cmd);
      expect(result.valid).toBe(true);
    });

    it('rejects unknown disaster kinds', () => {
      const cmd: DisasterCommand = {
        id: 'test-1',
        tick: 100,
        disasterKind: 'unknown-disaster' as any,
        centerX: 50,
        centerY: 50,
      };

      const result = validateDisasterCommand(cmd);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not enabled');
    });

    it('rejects out-of-bounds coordinates', () => {
      const cmd: DisasterCommand = {
        id: 'test-1',
        tick: 100,
        disasterKind: 'nutrient-bloom',
        centerX: -1,
        centerY: 50,
      };

      const result = validateDisasterCommand(cmd);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('out of world bounds');
    });

    it('rejects coordinates beyond world width', () => {
      const cmd: DisasterCommand = {
        id: 'test-1',
        tick: 100,
        disasterKind: 'nutrient-bloom',
        centerX: 100,
        centerY: 50,
      };

      const result = validateDisasterCommand(cmd);
      expect(result.valid).toBe(false);
    });

    it('accepts coordinates at world boundaries', () => {
      const cmd: DisasterCommand = {
        id: 'test-1',
        tick: 100,
        disasterKind: 'nutrient-bloom',
        centerX: 99,
        centerY: 99,
      };

      const result = validateDisasterCommand(cmd);
      expect(result.valid).toBe(true);
    });

    it('clamps radius to minimum bound', () => {
      const cmd: DisasterCommand = {
        id: 'test-1',
        tick: 100,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
        radius: 1, // Too small
      };

      const result = validateDisasterCommand(cmd);
      expect(result.valid).toBe(true);
      expect(result.effectiveRadius).toBe(ENABLED_DISASTERS['nutrient-bloom'].min);
      expect(result.reason).toContain('clamped');
    });

    it('clamps radius to maximum bound', () => {
      const cmd: DisasterCommand = {
        id: 'test-1',
        tick: 100,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
        radius: 100, // Too large
      };

      const result = validateDisasterCommand(cmd);
      expect(result.valid).toBe(true);
      expect(result.effectiveRadius).toBe(ENABLED_DISASTERS['nutrient-bloom'].max);
      expect(result.reason).toContain('clamped');
    });

    it('uses default radius when not provided', () => {
      const cmd: DisasterCommand = {
        id: 'test-1',
        tick: 100,
        disasterKind: 'wildfire',
        centerX: 50,
        centerY: 50,
        // No radius provided
      };

      const result = validateDisasterCommand(cmd);
      expect(result.valid).toBe(true);
      expect(result.effectiveRadius).toBe(ENABLED_DISASTERS['wildfire'].defaultRadius);
    });

    it('respects custom world dimensions', () => {
      const cmd: DisasterCommand = {
        id: 'test-1',
        tick: 100,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
      };

      const result = validateDisasterCommand(cmd, 50, 50); // Small world

      const cmd2: DisasterCommand = {
        id: 'test-2',
        tick: 100,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
      };

      const result2 = validateDisasterCommand(cmd2, 50, 50);
      expect(result2.valid).toBe(false); // 50, 50 is out of bounds for 50×50 world
    });

    it('validates all disaster kinds independently', () => {
      for (const kind of getAvailableDisasterKinds()) {
        const cmd: DisasterCommand = {
          id: `test-${kind}`,
          tick: 100,
          disasterKind: kind,
          centerX: 50,
          centerY: 50,
        };

        const result = validateDisasterCommand(cmd);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('Default Radius', () => {
    it('returns configured default radius', () => {
      expect(getDefaultRadius('nutrient-bloom')).toBe(8);
      expect(getDefaultRadius('drought')).toBe(10);
      expect(getDefaultRadius('wildfire')).toBe(8);
    });

    it('returns different defaults for different disasters', () => {
      const kinds = getAvailableDisasterKinds();
      const radii = kinds.map((k) => getDefaultRadius(k));

      // Not all defaults should be the same
      expect(new Set(radii).size).toBeGreaterThan(1);
    });
  });

  describe('Disaster Queries', () => {
    it('lists all available disasters', () => {
      const kinds = getAvailableDisasterKinds();
      expect(kinds.length).toBe(8);
      expect(kinds).toContain('nutrient-bloom');
      expect(kinds).toContain('wildfire');
    });

    it('separates beneficial and harmful disasters', () => {
      const beneficial = getBeneficialDisasters();
      const harmful = getHarmfulDisasters();

      expect(beneficial).toContain('nutrient-bloom');
      expect(beneficial).toContain('mild-flood');
      expect(beneficial).toContain('meteor-seeding');
      expect(beneficial.length).toBe(3);

      expect(harmful).toContain('drought');
      expect(harmful).toContain('wildfire');
      expect(harmful.length).toBe(5);
    });

    it('no overlap between beneficial and harmful', () => {
      const beneficial = new Set(getBeneficialDisasters());
      const harmful = new Set(getHarmfulDisasters());

      // Check for any overlap
      let overlapCount = 0;
      for (const item of beneficial) {
        if (harmful.has(item)) {
          overlapCount++;
        }
      }
      expect(overlapCount).toBe(0);
    });

    it('beneficial + harmful = all disasters', () => {
      const beneficial = getBeneficialDisasters();
      const harmful = getHarmfulDisasters();
      const all = getAvailableDisasterKinds();

      expect(new Set([...beneficial, ...harmful]).size).toBe(all.length);
    });
  });

  describe('Edge Cases', () => {
    it('handles very small worlds', () => {
      const cmd: DisasterCommand = {
        id: 'test-1',
        tick: 100,
        disasterKind: 'nutrient-bloom',
        centerX: 0,
        centerY: 0,
      };

      const result = validateDisasterCommand(cmd, 5, 5);
      expect(result.valid).toBe(true);
    });

    it('handles very large worlds', () => {
      const cmd: DisasterCommand = {
        id: 'test-1',
        tick: 100,
        disasterKind: 'nutrient-bloom',
        centerX: 1000,
        centerY: 1000,
      };

      const result = validateDisasterCommand(cmd, 2000, 2000);
      expect(result.valid).toBe(true);
    });

    it('rejects negative coordinates', () => {
      const cmd: DisasterCommand = {
        id: 'test-1',
        tick: 100,
        disasterKind: 'nutrient-bloom',
        centerX: -1,
        centerY: -1,
      };

      const result = validateDisasterCommand(cmd);
      expect(result.valid).toBe(false);
    });

    it('zero radius is clamped to minimum', () => {
      const cmd: DisasterCommand = {
        id: 'test-1',
        tick: 100,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
        radius: 0,
      };

      const result = validateDisasterCommand(cmd);
      expect(result.valid).toBe(true);
      expect(result.effectiveRadius).toBeGreaterThan(0);
    });

    it('negative radius is clamped to minimum', () => {
      const cmd: DisasterCommand = {
        id: 'test-1',
        tick: 100,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
        radius: -5,
      };

      const result = validateDisasterCommand(cmd);
      expect(result.valid).toBe(true);
      expect(result.effectiveRadius).toBeGreaterThan(0);
    });
  });

  describe('Disaster Bounds', () => {
    it('all disasters have valid bounds', () => {
      for (const [kind, bounds] of Object.entries(ENABLED_DISASTERS)) {
        expect(bounds.min).toBeGreaterThan(0);
        expect(bounds.max).toBeGreaterThanOrEqual(bounds.min);
        expect(bounds.defaultRadius).toBeGreaterThanOrEqual(bounds.min);
        expect(bounds.defaultRadius).toBeLessThanOrEqual(bounds.max);
      }
    });

    it('dangerous disasters have smaller default radiuses than beneficial ones', () => {
      const wildfire = getDefaultRadius('wildfire');
      const toxic = getDefaultRadius('toxic-vent');
      const bloom = getDefaultRadius('nutrient-bloom');

      // Wildfire has smaller default radius (easier to control)
      expect(wildfire).toBeLessThanOrEqual(bloom);
    });
  });
});
