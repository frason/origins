import { useCallback, useEffect, useRef } from 'react';
import WorldView from './ui/WorldView';
import ControlPanel from './ui/ControlPanel';
import SpeciesPanel from './ui/SpeciesPanel';
import StatsPanel from './ui/StatsPanel';
import { useStore, WorldSnapshot, CreatureSnapshot } from './state/store';
import { tickEngine, EngineState } from './simulation/engine';
import { start as startDemoWorld } from './simulation/runner';
import { eventLog } from './state/eventLog';

/**
 * Build a fresh engine with the demo world scenario.
 * Uses the runner module to initialize the ecosystem with producers, herbivores, carnivores, and decomposers.
 */
function buildEngine(): EngineState {
  return startDemoWorld();
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
        energyStrategy: c.traits.energyStrategy,
      })
    ),
  };
}

export default function App() {
  const engineRef = useRef<EngineState | null>(null);
  const lastEventCountRef = useRef<number>(0);
  const isRunning = useStore((s) => s.isRunning);
  const speed = useStore((s) => s.speed);

  const publish = useCallback((engine: EngineState) => {
    const store = useStore.getState();

    // Build species list from creatures
    const speciesMap = new Map<string, { speciesId: string; population: number; strategy?: string; createdAtTick: number }>();
    for (const creature of engine.creatures) {
      if (creature.lifecycleState === 'alive') {
        const entry = speciesMap.get(creature.speciesId) || {
          speciesId: creature.speciesId,
          population: 0,
          strategy: creature.traits.energyStrategy,
          createdAtTick: engine.tick, // TODO: track actual creation tick
        };
        entry.population++;
        speciesMap.set(creature.speciesId, entry);
      }
    }
    const speciesList = Array.from(speciesMap.values()).map((s) => ({
      speciesId: s.speciesId,
      population: s.population,
      energyStrategy: s.strategy,
      createdAtTick: s.createdAtTick,
    }));

    // Forward new events to eventLog (skip 'death' events; only log species-level extinctions)
    const newEvents = engine.events.slice(lastEventCountRef.current);
    for (const event of newEvents) {
      // Filter out individual creature deaths; only log births, mutations, and extinctions
      if (event.type === 'death') continue;
      eventLog.logEvent({
        type: event.type as any, // type conversion: engine.extinction matches eventLog.extinction
        tick: event.tick,
        speciesId: event.speciesId || '',
        detail: event.detail || '',
      });
    }
    lastEventCountRef.current = engine.events.length;

    store.setWorldState(snapshotOf(engine));
    store.setTick(engine.tick);
    store.setSpeciesList(speciesList as any);
  }, []);

  const reset = useCallback(() => {
    useStore.getState().setRunning(false);
    eventLog.clearEvents();
    lastEventCountRef.current = 0;
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
