import { useCallback, useEffect, useRef, useState } from 'react';
import WorldView from './ui/WorldView';
import ControlPanel from './ui/ControlPanel';
import SpeciesPanel from './ui/SpeciesPanel';
import StatsPanel from './ui/StatsPanel';
import TileInfoPanel from './ui/TileInfoPanel';
import ExtinctionSummary from './ui/ExtinctionSummary';
import { useStore } from './state/store';
import { introduceSpecies, tickEngine, EngineState } from './simulation/engine';
import type { EnergyStrategy } from './utils/traits';
import { buildDemoEngine } from './simulation/demoWorld';
import { DEFAULT_WORLD_SEED } from './ui/worldSeed';
import SettingsDrawer from './ui/SettingsDrawer';
import EventTimeline from './ui/EventTimeline';
import LineageHistory from './ui/LineageHistory';
import {
  advanceRecipeReplay,
  createRecipeReplay,
  type RecipeReplaySession,
} from './simulation/recipeReplay';
import type { WorldRecipe } from './ui/worldRecipe';
import { snapshotEngine } from './state/snapshot';
import { getUiFrameInterval } from './ui/framePacing';
import SimWindow from './ui/SimWindow';
import EvolutionRibbon from './ui/EvolutionRibbon';

export default function App() {
  const engineRef = useRef<EngineState | null>(null);
  const recipeReplayRef = useRef<RecipeReplaySession | null>(null);
  const isRunning = useStore((s) => s.isRunning);
  const speed = useStore((s) => s.speed);
  const tick = useStore((s) => s.tick);
  const selectedTile = useStore((s) => s.selectedTile);
  const setRunning = useStore((s) => s.setRunning);
  const setSpeed = useStore((s) => s.setSpeed);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [worldSeed, setWorldSeed] = useState(DEFAULT_WORLD_SEED);
  const [replayActive, setReplayActive] = useState(false);
  const [replayStatus, setReplayStatus] = useState<string | null>(null);

  const publish = useCallback((engine: EngineState) => {
    const store = useStore.getState();
    store.setWorldState(snapshotEngine(engine));
    store.setTick(engine.tick);
    if (engine.tick > 0 && !engine.creatures.some((creature) => creature.lifecycleState === 'alive')) {
      store.setRunning(false);
    }
  }, []);

  const reset = useCallback(() => {
    const store = useStore.getState();
    store.setRunning(false);
    store.setSelectedTile(null);
    store.clearFollowedLineages();
    recipeReplayRef.current = null;
    setReplayActive(false);
    setReplayStatus(null);
    const engine = buildDemoEngine(worldSeed, store.constants);
    engineRef.current = engine;
    publish(engine);
  }, [publish, worldSeed]);

  const newWorld = useCallback((seed: number) => {
    const store = useStore.getState();
    store.setRunning(false);
    store.setSelectedTile(null);
    store.clearFollowedLineages();
    recipeReplayRef.current = null;
    setReplayActive(false);
    setReplayStatus(null);
    const engine = buildDemoEngine(seed, store.constants);
    engineRef.current = engine;
    setWorldSeed(seed);
    publish(engine);
  }, [publish]);

  const addSpecies = useCallback((strategy: EnergyStrategy): string | null => {
    if (recipeReplayRef.current) return 'Manual interventions are disabled during recipe replay';
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

  const startRecipeReplay = useCallback((recipe: WorldRecipe): string | null => {
    try {
      const session = createRecipeReplay(recipe);
      const store = useStore.getState();
      store.setRunning(false);
      store.setSelectedTile(null);
      store.clearFollowedLineages();
      store.updateConstants(session.constants);
      engineRef.current = session.state;
      recipeReplayRef.current = session;
      setWorldSeed(recipe.seed);
      setReplayActive(true);
      setReplayStatus(`Replaying seed ${recipe.seed.toLocaleString()} to tick ${recipe.throughTick.toLocaleString()}`);
      publish(session.state);
      store.setRunning(true);
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start recipe replay';
      setReplayStatus(message);
      return message;
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
          const replay = recipeReplayRef.current;
          if (replay) {
            try {
              const advanced = advanceRecipeReplay(replay);
              engineRef.current = advanced.state;
              useStore.getState().updateConstants(advanced.constants);
              recipeReplayRef.current = advanced.complete ? null : advanced;
              if (advanced.complete) {
                setReplayActive(false);
                setReplayStatus(`Replay complete at tick ${advanced.state.tick.toLocaleString()}`);
                useStore.getState().setRunning(false);
              } else {
                setReplayStatus(
                  `Replaying tick ${advanced.state.tick.toLocaleString()} of ${advanced.recipe.throughTick.toLocaleString()}`
                );
              }
            } catch (error) {
              recipeReplayRef.current = null;
              setReplayActive(false);
              setReplayStatus(error instanceof Error ? error.message : 'Recipe replay diverged');
              useStore.getState().setRunning(false);
            }
          } else {
            engineRef.current = tickEngine(prev, useStore.getState().constants);
          }
          ticked = true;
        }
        acc -= tickMs;
        if (!useStore.getState().isRunning) break;
      }
      if (ticked && engineRef.current) publish(engineRef.current);
    }, getUiFrameInterval(speed));
    return () => clearInterval(interval);
  }, [isRunning, speed, publish]);

  return (
    <div className="app-shell">
      <SimWindow
        title="Project Origins — Living World"
        titleAs="h1"
        className="app-shell__window"
        bodyClassName={`app-shell__window-body${selectedTile ? ' app-shell__window-body--inspecting' : ''}`}
        controls={(
          <button
            type="button"
            className="sim-button sim-button--compact"
            aria-label="Open world controls"
            aria-controls="settings-drawer"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
        )}
        menu={(
          <>
            <strong aria-current="page">World</strong>
            <button type="button" className="app-shell__menu-button" onClick={() => setSettingsOpen(true)}>
              Simulation
            </button>
            <button type="button" className="app-shell__menu-button" onClick={() => setSettingsOpen(true)}>
              Data
            </button>
            <span className="app-shell__seed">Seed <span className="sim-data">{worldSeed}</span></span>
          </>
        )}
        status={(
          <div className="app-shell__transport" aria-label="Simulation transport">
            <button
              type="button"
              className={`sim-button sim-button--compact${isRunning ? ' sim-button--pressed' : ''}`}
              aria-pressed={isRunning}
              onClick={() => setRunning(!isRunning)}
            >
              {isRunning ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              className="sim-button sim-button--compact"
              aria-label="Decrease simulation speed"
              onClick={() => setSpeed(Math.max(0.25, speed / 2))}
            >
              −
            </button>
            <output className="app-shell__speed sim-data" aria-label="Simulation speed">{speed}×</output>
            <button
              type="button"
              className="sim-button sim-button--compact"
              aria-label="Increase simulation speed"
              onClick={() => setSpeed(Math.min(64, speed * 2))}
            >
              +
            </button>
            <output className="app-shell__tick sim-data">Tick {tick.toLocaleString()}</output>
            <span className={`app-shell__run-state ${isRunning ? 'sim-status--positive' : 'sim-status--warning'}`}>
              {isRunning ? 'Simulation running' : 'Simulation paused'}
            </span>
          </div>
        )}
      >
        <EvolutionRibbon onOpenLineages={() => setSettingsOpen(true)} />
        <main aria-label="Ecosystem world" className="app-shell__world">
          <WorldView />
        </main>
        <TileInfoPanel onOpenLineages={() => setSettingsOpen(true)} />
      </SimWindow>
      <SettingsDrawer isOpen={settingsOpen} onClose={() => setSettingsOpen(false)}>
          <ControlPanel
            onReset={reset}
            onNewWorld={newWorld}
            worldSeed={worldSeed}
            onIntroduceSpecies={addSpecies}
            replayActive={replayActive}
          />
          <StatsPanel />
          <EventTimeline
            onReplayRecipe={startRecipeReplay}
            replayStatus={replayStatus}
          />
          <SpeciesPanel />
          <LineageHistory />
      </SettingsDrawer>
      <ExtinctionSummary onRestart={reset} />
    </div>
  );
}
