import { useCallback, useEffect, useRef } from 'react';
import WorldView from './ui/WorldView';
import ControlPanel from './ui/ControlPanel';
import SpeciesPanel from './ui/SpeciesPanel';
import StatsPanel from './ui/StatsPanel';
import { useStore, WorldSnapshot, CreatureSnapshot } from './state/store';
import { Creature } from './simulation/creature';
import { createEngine, tickEngine, EngineState } from './simulation/engine';
import { DEFAULT_TRAITS, Traits } from './utils/traits';

const WORLD_SEED = 12345;

/**
 * Deterministic starter population clustered around the high-energy center.
 * Herbivore-heavy so the food web has a base; a few predators and scavengers on top.
 */
function buildStarterCreatures(): Creature[] {
  const specs: Array<{
    speciesId: string;
    strategy: Traits['energyStrategy'];
    x: number;
    y: number;
    energy: number;
  }> = [];

  // 14 herbivores in a ring around center
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    specs.push({
      speciesId: 'herbivore_001',
      strategy: 'herbivore',
      x: Math.round(50 + Math.cos(angle) * 12),
      y: Math.round(50 + Math.sin(angle) * 12),
      energy: 140,
    });
  }
  // 3 omnivores mid-ring
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + 0.5;
    specs.push({
      speciesId: 'omnivore_001',
      strategy: 'omnivore',
      x: Math.round(50 + Math.cos(angle) * 20),
      y: Math.round(50 + Math.sin(angle) * 20),
      energy: 160,
    });
  }
  // 2 carnivores on the outskirts
  specs.push({ speciesId: 'carnivore_001', strategy: 'carnivore', x: 30, y: 70, energy: 180 });
  specs.push({ speciesId: 'carnivore_001', strategy: 'carnivore', x: 70, y: 30, energy: 180 });
  // 1 scavenger
  specs.push({ speciesId: 'scavenger_001', strategy: 'scavenger', x: 50, y: 65, energy: 120 });

  return specs.map(
    (s) =>
      new Creature({
        speciesId: s.speciesId,
        lineageId: s.speciesId,
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: s.strategy },
        x: s.x,
        y: s.y,
        energy: s.energy,
      })
  );
}

/** Build a fresh engine with seeded initial producer biomass (proportional to solar energy). */
function buildEngine(): EngineState {
  Creature.resetIdCounter();
  const engine = createEngine(WORLD_SEED, buildStarterCreatures());
  for (let y = 0; y < engine.world.height; y++) {
    for (let x = 0; x < engine.world.width; x++) {
      const cell = engine.world.getCell(x, y);
      engine.world.setCell(x, y, { producerBiomass: cell.energy * 2 });
    }
  }
  return engine;
}

function snapshotOf(engine: EngineState): WorldSnapshot {
  const worldJSON = engine.world.toJSON() as {
    width: number;
    height: number;
    cells: WorldSnapshot['cells'];
  };
  return {
    width: worldJSON.width,
    height: worldJSON.height,
    cells: worldJSON.cells,
    creatures: engine.creatures.map(
      (c): CreatureSnapshot => ({
        id: c.id,
        speciesId: c.speciesId,
        x: c.x,
        y: c.y,
        energy: c.energy,
        age: c.age,
        lifecycleState: c.lifecycleState,
      })
    ),
  };
}

export default function App() {
  const engineRef = useRef<EngineState | null>(null);
  const isRunning = useStore((s) => s.isRunning);
  const speed = useStore((s) => s.speed);

  const publish = useCallback((engine: EngineState) => {
    const store = useStore.getState();
    store.setWorldState(snapshotOf(engine));
    store.setTick(engine.tick);
  }, []);

  const reset = useCallback(() => {
    useStore.getState().setRunning(false);
    const engine = buildEngine();
    engineRef.current = engine;
    publish(engine);
  }, [publish]);

  // Initialize world once
  useEffect(() => {
    if (!engineRef.current) {
      const engine = buildEngine();
      engineRef.current = engine;
      publish(engine);
    }
  }, [publish]);

  // Game loop: advance the engine while running, at `speed` ticks per second.
  // setInterval drives it (fires even in throttled background tabs); the time
  // accumulator lets a late callback run several engine ticks to hold wall-clock
  // pacing, capped so a long-backgrounded tab doesn't fast-forward on return.
  useEffect(() => {
    if (!isRunning) return;
    let last = performance.now();
    let acc = 0;
    const tickMs = 1000 / speed;
    const interval = setInterval(() => {
      const now = performance.now();
      acc += now - last;
      last = now;
      if (acc > tickMs * 5) acc = tickMs * 5;
      let ticked = false;
      while (acc >= tickMs) {
        const prev = engineRef.current;
        if (prev) {
          engineRef.current = tickEngine(prev);
          ticked = true;
        }
        acc -= tickMs;
      }
      if (ticked && engineRef.current) publish(engineRef.current);
    }, Math.max(30, tickMs));
    return () => clearInterval(interval);
  }, [isRunning, speed, publish]);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#111' }}>
      <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <h1 style={{ margin: '0 0 0.5rem 0' }}>Project Origins</h1>
        <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>
          A persistent ecosystem simulation — 100×100 world grid
        </p>
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <WorldView />
        </div>
        <div
          style={{
            width: 300,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            padding: '0.75rem',
            overflowY: 'auto',
          }}
        >
          <ControlPanel onReset={reset} />
          <StatsPanel />
          <SpeciesPanel />
        </div>
      </div>
    </div>
  );
}
