import { useCallback, useEffect, useRef, useState } from 'react';
import WorldView from './ui/WorldView';
import ControlPanel from './ui/ControlPanel';
import SpeciesPanel from './ui/SpeciesPanel';
import StatsPanel from './ui/StatsPanel';
import TileInfoPanel from './ui/TileInfoPanel';
import ExtinctionSummary from './ui/ExtinctionSummary';
import { useStore, WorldSnapshot, CreatureSnapshot } from './state/store';
import { introduceSpecies, tickEngine, EngineState } from './simulation/engine';
import type { EnergyStrategy } from './utils/traits';
import { buildDemoEngine } from './simulation/demoWorld';
import { DEFAULT_WORLD_SEED } from './ui/worldSeed';
import SettingsDrawer from './ui/SettingsDrawer';
import EventTimeline from './ui/EventTimeline';
import LineageHistory from './ui/LineageHistory';

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
        lineageId: c.lineageId,
        parentId: c.parentId,
        traits: { ...c.traits },
        x: c.x,
        y: c.y,
        energy: c.energy,
        age: c.age,
        lifecycleState: c.lifecycleState,
        corpseDecayTicks: c.corpseDecayTicks,
      })
    ),
    events: engine.events.map((event) => ({ ...event })),
  };
}

export default function App() {
  const engineRef = useRef<EngineState | null>(null);
  const isRunning = useStore((s) => s.isRunning);
  const speed = useStore((s) => s.speed);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [worldSeed, setWorldSeed] = useState(DEFAULT_WORLD_SEED);

  const publish = useCallback((engine: EngineState) => {
    const store = useStore.getState();
    store.setWorldState(snapshotOf(engine));
    store.setTick(engine.tick);
    if (engine.tick > 0 && !engine.creatures.some((creature) => creature.lifecycleState === 'alive')) {
      store.setRunning(false);
    }
  }, []);

  const reset = useCallback(() => {
    const store = useStore.getState();
    store.setRunning(false);
    store.setSelectedTile(null);
    const engine = buildDemoEngine(worldSeed, store.constants);
    engineRef.current = engine;
    publish(engine);
  }, [publish, worldSeed]);

  const newWorld = useCallback((seed: number) => {
    const store = useStore.getState();
    store.setRunning(false);
    store.setSelectedTile(null);
    const engine = buildDemoEngine(seed, store.constants);
    engineRef.current = engine;
    setWorldSeed(seed);
    publish(engine);
  }, [publish]);

  const addSpecies = useCallback((strategy: EnergyStrategy): string | null => {
    const engine = engineRef.current;
    const tile = useStore.getState().selectedTile;
    if (!engine || !tile) return 'Select a tile in the world first';
    try {
      const introduction = introduceSpecies(engine, strategy, tile);
      engineRef.current = introduction.state;
      publish(introduction.state);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not introduce this species';
    }
  }, [publish]);

  // Initialize world once
  useEffect(() => {
    if (!engineRef.current) {
      const engine = buildDemoEngine(worldSeed, useStore.getState().constants);
      engineRef.current = engine;
      publish(engine);
    }
  }, [publish, worldSeed]);

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
          engineRef.current = tickEngine(prev, useStore.getState().constants);
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
      <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.5rem 0' }}>Project Origins</h1>
          <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>
            A persistent ecosystem simulation — 100×100 world grid · seed {worldSeed}
          </p>
        </div>
        <button
          type="button"
          aria-controls="settings-drawer"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
          style={{ border: '1px solid #555', borderRadius: 7, padding: '0.55rem 0.8rem', background: settingsOpen ? '#4a3a2a' : '#292c30', color: '#eee', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          ⚙ Settings
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <WorldView />
      </div>
      <SettingsDrawer isOpen={settingsOpen} onClose={() => setSettingsOpen(false)}>
          <ControlPanel
            onReset={reset}
            onNewWorld={newWorld}
            worldSeed={worldSeed}
            onIntroduceSpecies={addSpecies}
          />
          <StatsPanel />
          <EventTimeline />
          <SpeciesPanel />
          <LineageHistory />
      </SettingsDrawer>
      <TileInfoPanel />
      <ExtinctionSummary onRestart={reset} />
    </div>
  );
}
