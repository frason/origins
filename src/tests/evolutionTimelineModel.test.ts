import { describe, expect, it } from 'vitest';
import type { EcosystemHistorySample } from '../simulation/ecosystemHistory';
import type { CreatureSnapshot, WorldSnapshot, EventSnapshot } from '../state/store';
import { DEFAULT_TRAITS } from '../utils/traits';
import { buildEvolutionTimeline } from '../ui/evolutionTimelineModel';

function creature(id: string, speciesId: string, lineageId: string): CreatureSnapshot {
  return {
    id, speciesId, lineageId, parentId: null, traits: { ...DEFAULT_TRAITS },
    x: 0, y: 0, energy: 100, age: 1, lifecycleState: 'alive', corpseDecayTicks: 0,
  };
}

function event(type: EventSnapshot['type'], tick: number, speciesId?: string): EventSnapshot {
  return {
    type,
    tick,
    speciesId,
    creatureId: `creature-${tick}`,
    lineageId: `lineage-${speciesId}`,
    detail: `Event at ${tick}`,
    deathCause: type === 'death' ? 'starvation' : undefined,
    interventionKind: type === 'intervention' ? 'species-introduction' : undefined,
    interventionOrigin: type === 'intervention' ? { x: 10, y: 20 } : undefined,
  };
}

function world(creatures: CreatureSnapshot[], events: EventSnapshot[] = []): WorldSnapshot {
  return { width: 1, height: 1, cells: [], creatures, events };
}

const history: EcosystemHistorySample[] = [
  {
    tick: 0, population: 3,
    speciesPopulations: [{ speciesId: 'alpha', population: 2 }, { speciesId: 'beta', population: 1 }],
    lineageCount: 2, births: 0, deaths: 0, mutations: 0,
  },
  {
    tick: 10, population: 4,
    speciesPopulations: [{ speciesId: 'alpha', population: 1 }, { speciesId: 'beta', population: 3 }],
    lineageCount: 3, births: 2, deaths: 1, mutations: 1,
  },
];

describe('evolution timeline presentation model', () => {
  it('merges the current unsampled state and detects dominance shifts', () => {
    const current = world([
      creature('b1', 'beta', 'b-root'),
      creature('b2', 'beta', 'b-branch'),
    ]);
    const model = buildEvolutionTimeline(history, current, 15)!;

    expect(model.points.map((point) => point.tick)).toEqual([0, 10, 15]);
    expect(model.points[model.points.length - 1].x).toBe(100);
    expect(model.peakPopulation).toBe(4);
    expect(model.dominanceChanges).toBe(1);
    expect(model.dominanceMoments).toHaveLength(1);
    expect(model.dominanceMoments[0]).toMatchObject({ tick: 10, speciesId: 'beta' });
    expect(model.dominanceMoments[0].x).toBeCloseTo(66.67, 1);
    expect(model.currentDominantName).toBeTruthy();
    expect(model.description).toContain('3 samples through tick 15');
  });

  it('replaces a sampled current tick instead of duplicating it', () => {
    const model = buildEvolutionTimeline(history, world([]), 10)!;
    expect(model.points.map((point) => point.tick)).toEqual([0, 10]);
    expect(model.points[1].population).toBe(0);
  });

  it('handles an extinct world and missing history accessibly', () => {
    const model = buildEvolutionTimeline(undefined, world([]), 0)!;
    expect(model.points).toHaveLength(1);
    expect(model.peakPopulation).toBe(0);
    expect(model.currentDominantName).toBeNull();
    expect(model.description).toContain('No living species currently leads');
    expect(buildEvolutionTimeline([], null, 0)).toBeNull();
  });

  it('uses cumulative history plus recent events for the current point', () => {
    const current = world(
      [creature('a1', 'alpha', 'root')],
      [
        { type: 'birth', tick: 9, speciesId: 'alpha' },
        { type: 'birth', tick: 10, speciesId: 'beta' },
        { type: 'death', tick: 11, speciesId: 'alpha', deathCause: 'starvation' },
        { type: 'mutation', tick: 12, speciesId: 'alpha' },
      ]
    );
    const model = buildEvolutionTimeline(history, current, 15)!;
    expect(model.points[model.points.length - 1]).toMatchObject({
      births: 3, deaths: 2, mutations: 2,
    });
  });

  // ===== NEW TESTS FOR ENHANCED FEATURES =====

  describe('event pin creation', () => {
    it('creates pins for birth events', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        event('birth', 5, 'alpha'),
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const birthPins = model.eventPins.filter((p) => p.type === 'birth');
      expect(birthPins).toHaveLength(1);
      expect(birthPins[0].detail).toContain('birth');
    });

    it('creates pins for death events', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        { ...event('death', 5, 'alpha'), deathCause: 'starvation' },
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const deathPins = model.eventPins.filter((p) => p.type === 'death');
      expect(deathPins).toHaveLength(1);
      expect(deathPins[0].detail).toContain('starvation');
    });

    it('creates pins for mutation events', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        event('mutation', 5, 'alpha'),
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const mutationPins = model.eventPins.filter((p) => p.type === 'mutation');
      expect(mutationPins).toHaveLength(1);
      expect(mutationPins[0].detail).toContain('mutation');
    });

    it('creates pins for speciation events', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        event('speciation', 5, 'alpha'),
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const speciationPins = model.eventPins.filter((p) => p.type === 'speciation');
      expect(speciationPins).toHaveLength(1);
      expect(speciationPins[0].detail).toContain('speciation');
    });

    it('creates pins for extinction events', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        event('extinction', 5, 'alpha'),
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const extinctionPins = model.eventPins.filter((p) => p.type === 'extinction');
      expect(extinctionPins).toHaveLength(1);
      expect(extinctionPins[0].detail).toContain('extinction');
    });

    it('creates pins for intervention events', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        { ...event('intervention', 5, 'alpha'), interventionKind: 'species-introduction', interventionOrigin: { x: 10, y: 20 } },
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const interventionPins = model.eventPins.filter((p) => p.type === 'intervention');
      expect(interventionPins).toHaveLength(1);
      expect(interventionPins[0].detail).toContain('Introduced');
      expect(interventionPins[0].tileX).toBe(10);
      expect(interventionPins[0].tileY).toBe(20);
    });

    it('attaches navigation metadata to event pins', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        {
          ...event('intervention', 5, 'alpha'),
          interventionOrigin: { x: 15, y: 25 },
          creatureId: 'creature-123',
          lineageId: 'lineage-456',
        },
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const pin = model.eventPins[0];
      expect(pin.tileX).toBe(15);
      expect(pin.tileY).toBe(25);
      expect(pin.creatureId).toBe('creature-123');
      expect(pin.lineageId).toBe('lineage-456');
    });
  });

  describe('intervention windows', () => {
    it('creates intervention windows from consecutive intervention events', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        event('intervention', 5, 'alpha'),
        event('intervention', 6, 'alpha'),
        event('birth', 7, 'alpha'),
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      expect(model.interventionWindows).toHaveLength(1);
      expect(model.interventionWindows[0].startTick).toBe(5);
      expect(model.interventionWindows[0].endTick).toBe(7);
    });

    it('handles trailing intervention window to current tick', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        event('birth', 5, 'alpha'),
        event('intervention', 7, 'alpha'),
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      expect(model.interventionWindows).toHaveLength(1);
      expect(model.interventionWindows[0].endTick).toBe(10);
    });

    it('converts intervention ticks to X coordinates', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        event('intervention', 0, 'alpha'),
        event('birth', 10, 'alpha'),
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      expect(model.interventionWindows[0].startX).toBe(0);
      expect(model.interventionWindows[0].endX).toBeCloseTo(100, 1);
    });
  });

  describe('axis scales', () => {
    it('generates readable X-axis scale with tick marks', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')]);
      const model = buildEvolutionTimeline(history, testWorld, 1000)!;
      expect(model.xAxisScale.ticks.length).toBeGreaterThan(0);
      expect(model.xAxisScale.labels.length).toBe(model.xAxisScale.ticks.length);
      expect(model.xAxisScale.ticks[0]).toBe(0);
      expect(model.xAxisScale.ticks[model.xAxisScale.ticks.length - 1]).toBeCloseTo(1000, -2);
    });

    it('generates readable Y-axis scale with appropriate magnitude', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      expect(model.yAxisScale.ticks.length).toBeGreaterThan(0);
      expect(model.yAxisScale.labels.length).toBe(model.yAxisScale.ticks.length);
      expect(model.yAxisScale.min).toBe(0);
      expect(model.yAxisScale.max).toBeGreaterThanOrEqual(model.peakPopulation);
    });

    it('uses k notation for large values', () => {
      const largeHistory: EcosystemHistorySample[] = [
        {
          tick: 0, population: 5000,
          speciesPopulations: [{ speciesId: 'alpha', population: 5000 }],
          lineageCount: 1, births: 0, deaths: 0, mutations: 0,
        },
      ];
      const testWorld = world([creature('a1', 'alpha', 'root')]);
      const model = buildEvolutionTimeline(largeHistory, testWorld, 10)!;
      const hasKNotation = model.yAxisScale.labels.some((label) => label.includes('k'));
      expect(hasKNotation).toBe(true);
    });
  });

  describe('event scanning and performance', () => {
    it('bounds event scanning to MAX_EVENTS_TO_SCAN to prevent unbounded growth', () => {
      // Create a world with 6000 events (exceeds 5000 limit)
      const manyEvents: EventSnapshot[] = [];
      for (let i = 0; i < 6000; i++) {
        manyEvents.push(event('birth', i, 'alpha'));
      }
      const testWorld = world([creature('a1', 'alpha', 'root')], manyEvents);
      const model = buildEvolutionTimeline(history, testWorld, 6000)!;

      // Should only have at most 5000 + some overhead for tail events
      expect(model.eventPins.length).toBeLessThanOrEqual(5100);
    });

    it('collects all species IDs from history for filtering', () => {
      const testWorld = world([
        creature('a1', 'alpha', 'root'),
        creature('b1', 'beta', 'root'),
        creature('g1', 'gamma', 'root'),
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      expect(model.allSpeciesIds).toContain('alpha');
      expect(model.allSpeciesIds).toContain('beta');
      expect(model.allSpeciesIds).toContain('gamma');
    });

    it('collects all lineage IDs with display labels', () => {
      const testWorld = world([
        creature('a1', 'alpha', 'lineage-001'),
        creature('b1', 'beta', 'lineage-002'),
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      expect(model.allLineageIds.size).toBeGreaterThan(0);
      expect(model.allLineageLabels.size).toBeGreaterThan(0);
      for (const [lineageId] of model.allLineageLabels) {
        expect(model.allLineageIds).toContain(lineageId);
      }
    });
  });

  describe('filter support', () => {
    it('provides filter state for species selection', () => {
      const testWorld = world([
        creature('a1', 'alpha', 'root'),
        creature('b1', 'beta', 'root'),
      ], [
        event('birth', 5, 'alpha'),
        event('birth', 6, 'beta'),
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      expect(model.allSpeciesIds.has('alpha')).toBe(true);
      expect(model.allSpeciesIds.has('beta')).toBe(true);
    });

    it('provides filter state for lineage selection', () => {
      const testWorld = world([
        creature('a1', 'alpha', 'lineage-1'),
        creature('a2', 'alpha', 'lineage-2'),
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      expect(model.allLineageIds.size).toBeGreaterThan(0);
      for (const lineageId of model.allLineageIds) {
        expect(model.allLineageLabels.has(lineageId)).toBe(true);
      }
    });

    it('event pins include lineage ID for filtering', () => {
      const testWorld = world([creature('a1', 'alpha', 'lineage-xyz')], [
        { ...event('birth', 5, 'alpha'), lineageId: 'lineage-xyz' },
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const pin = model.eventPins[0];
      expect(pin.lineageId).toBe('lineage-xyz');
    });
  });

  describe('polyline generation', () => {
    it('generates population polyline with correct coordinate format', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')]);
      const model = buildEvolutionTimeline(history, testWorld, 15)!;
      const points = model.populationPolyline.split(' ');
      expect(points.length).toBeGreaterThan(0);
      points.forEach((point) => {
        const [x, y] = point.split(',');
        expect(Number(x)).toBeGreaterThanOrEqual(0);
        expect(Number(x)).toBeLessThanOrEqual(100);
        expect(Number(y)).toBeGreaterThanOrEqual(0);
        expect(Number(y)).toBeLessThanOrEqual(100);
      });
    });

    it('generates species and lineage polylines', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')]);
      const model = buildEvolutionTimeline(history, testWorld, 15)!;
      expect(model.speciesPolyline).toBeTruthy();
      expect(model.lineagePolyline).toBeTruthy();
      expect(model.speciesPolyline.split(' ').length).toBeGreaterThan(0);
      expect(model.lineagePolyline.split(' ').length).toBeGreaterThan(0);
    });
  });

  describe('environmental-shock pin creation', () => {
    it('creates pins for environmental-shock events', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        { type: 'environmental-shock', tick: 5, speciesId: 'alpha', creatureId: 'c1', lineageId: 'l1', detail: 'Toxicity surge', shockKind: 'toxicity-surge', affectedRegion: { x: 25, y: 30, radius: 2 } } as any,
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const shockPins = model.eventPins.filter((p) => p.type === 'environmental-shock');
      expect(shockPins).toHaveLength(1);
      expect(shockPins[0].detail).toContain('shock');
    });

    it('extracts region from affectedRegion on environmental-shock pins', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        { type: 'environmental-shock', tick: 5, speciesId: 'alpha', creatureId: 'c1', lineageId: 'l1', detail: 'Toxicity surge', shockKind: 'toxicity-surge', affectedRegion: { x: 10, y: 10, radius: 2 } } as any,
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const pin = model.eventPins[0];
      expect(pin.type).toBe('environmental-shock');
      expect(pin.region).toBeDefined();
      expect(['NW', 'NE', 'SW', 'SE', 'center']).toContain(pin.region);
    });
  });

  describe('region assignment across event types', () => {
    it('assigns region from affectedRegion on birth events', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        { ...event('birth', 5, 'alpha'), affectedRegion: { x: 75, y: 75, radius: 0 } } as any,
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const pin = model.eventPins.find((p) => p.type === 'birth');
      expect(pin).toBeDefined();
      expect(pin!.region).toBeDefined();
      expect(pin!.region).toBe('SE'); // x=75, y=75 is SE quadrant (x > 65, y > 65)
    });

    it('assigns region from affectedRegion on death events', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        { ...event('death', 5, 'alpha'), deathCause: 'starvation', affectedRegion: { x: 10, y: 10, radius: 0 } } as any,
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const pin = model.eventPins.find((p) => p.type === 'death');
      expect(pin).toBeDefined();
      expect(pin!.region).toBeDefined();
      expect(pin!.region).toBe('NW'); // x=10, y=10 is NW quadrant (x < 35, y < 35)
    });

    it('assigns region from affectedRegion on mutation events', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        { ...event('mutation', 5, 'alpha'), affectedRegion: { x: 70, y: 20, radius: 0 } } as any,
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const pin = model.eventPins.find((p) => p.type === 'mutation');
      expect(pin).toBeDefined();
      expect(pin!.region).toBeDefined();
      expect(pin!.region).toBe('NE'); // x=70, y=20 is NE quadrant (x > 65, y < 35)
    });

    it('assigns region from affectedRegion on speciation events', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        { ...event('speciation', 5, 'evolved:alpha:lineage'), affectedRegion: { x: 20, y: 70, radius: 0 } } as any,
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const pin = model.eventPins.find((p) => p.type === 'speciation');
      expect(pin).toBeDefined();
      expect(pin!.region).toBeDefined();
      expect(pin!.region).toBe('SW'); // x=20, y=70 is SW quadrant (x < 35, y > 65)
    });

    it('assigns region from affectedRegion on extinction events', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        { ...event('extinction', 8, 'alpha'), affectedRegion: { x: 80, y: 10, radius: 0 } } as any,
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const pin = model.eventPins.find((p) => p.type === 'extinction');
      expect(pin).toBeDefined();
      expect(pin!.region).toBeDefined();
      expect(pin!.region).toBe('NE'); // x=80, y=10 is NE quadrant (x > 65, y < 35)
    });

    it('populates tileX/tileY from affectedRegion when available', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        { ...event('birth', 5, 'alpha'), affectedRegion: { x: 42, y: 37, radius: 0 } } as any,
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const pin = model.eventPins[0];
      expect(pin.tileX).toBe(42);
      expect(pin.tileY).toBe(37);
    });

    it('prefers interventionOrigin over affectedRegion for intervention events', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        { ...event('intervention', 5, 'alpha'), interventionKind: 'species-introduction', interventionOrigin: { x: 15, y: 25 } },
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const pin = model.eventPins[0];
      expect(pin.tileX).toBe(15);
      expect(pin.tileY).toBe(25);
    });

    it('handles center region correctly', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        { ...event('birth', 5, 'alpha'), affectedRegion: { x: 50, y: 50, radius: 0 } } as any,
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const pin = model.eventPins[0];
      expect(pin.region).toBe('center');
    });
  });

  describe('mobile pan interaction', () => {
    it('verifies EventPin structure supports mobile navigation', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        { ...event('birth', 5, 'alpha'), affectedRegion: { x: 25, y: 30, radius: 0 } } as any,
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      const pin = model.eventPins[0];
      // Verify navigation metadata is available for mobile clicks
      expect(pin).toHaveProperty('tileX');
      expect(pin).toHaveProperty('tileY');
      expect(pin).toHaveProperty('creatureId');
      expect(pin).toHaveProperty('lineageId');
      expect(pin).toHaveProperty('region');
    });

    it('handles multiple event pins without data loss during zoom/pan', () => {
      const testWorld = world([creature('a1', 'alpha', 'root')], [
        { ...event('birth', 2, 'alpha'), affectedRegion: { x: 10, y: 10, radius: 0 } } as any,
        { ...event('death', 4, 'alpha'), deathCause: 'starvation', affectedRegion: { x: 20, y: 20, radius: 0 } } as any,
        { ...event('mutation', 6, 'alpha'), affectedRegion: { x: 30, y: 30, radius: 0 } } as any,
      ]);
      const model = buildEvolutionTimeline(history, testWorld, 10)!;
      expect(model.eventPins).toHaveLength(3);
      // All pins should retain their region info for region filtering during pan
      for (const pin of model.eventPins) {
        expect(pin.region).toBeDefined();
      }
    });
  });
});
