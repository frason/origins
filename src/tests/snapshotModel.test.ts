import { describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { createEngine } from '../simulation/engine';
import { snapshotEngine } from '../state/snapshot';
import { DEFAULT_TRAITS } from '../utils/traits';

describe('UI engine snapshots', () => {
  it('reuses append-only history while isolating mutable simulation state', () => {
    const founder = new Creature({
      speciesId: 'grazer', lineageId: 'root', parentId: null,
      traits: { ...DEFAULT_TRAITS }, x: 1, y: 1, energy: 100,
    });
    const engine = createEngine(42, [founder], 4, 4);
    const snapshot = snapshotEngine(engine);

    expect(snapshot.events).toBe(engine.events);
    expect(snapshot.history).toBe(engine.history);
    expect(snapshot.creatures[0]).not.toBe(engine.creatures[0]);
    expect(snapshot.creatures[0].traits).not.toBe(engine.creatures[0].traits);
    expect(snapshot.constants).not.toBe(engine.constants);

    snapshot.creatures[0].energy = 0;
    snapshot.creatures[0].traits.speed = 999;
    snapshot.cells[0].energy = -1;
    expect(engine.creatures[0].energy).toBe(100);
    expect(engine.creatures[0].traits.speed).toBe(DEFAULT_TRAITS.speed);
    expect(engine.world.getCell(0, 0).energy).not.toBe(-1);
  });
});
