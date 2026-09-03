import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WorldView from './ui/WorldView';
import LiveThreeWorldView from './ui/LiveThreeWorldView';
import ControlPanel from './ui/ControlPanel';
import SpeciesPanel from './ui/SpeciesPanel';
import StatsPanel from './ui/StatsPanel';
import TileInfoPanel from './ui/TileInfoPanel';
import ExtinctionSummary from './ui/ExtinctionSummary';
import TurningPointChoice from './ui/TurningPointChoice';
import FirstRunOnboarding from './ui/FirstRunOnboarding';
import { useStore } from './state/store';
import { introduceSpecies, tickEngine, EngineState } from './simulation/engine';
import type { EnergyStrategy } from './utils/traits';
import type { FounderTraitOverrides } from './simulation/founderTraits';
import { buildDemoEngine } from './simulation/demoWorld';
import { createFreshWorldSeed, DEFAULT_WORLD_SEED } from './ui/worldSeed';
import EventTimeline from './ui/EventTimeline';
import LineageHistory from './ui/LineageHistory';
import WorldLegend from './ui/WorldLegend';
import EcosystemPressurePanel from './ui/EcosystemPressurePanel';
import FollowedLineageNotices from './ui/FollowedLineageNotices';
import { type SettingsTab } from './ui/settingsTabs';
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
import SettingsPanel from './ui/SettingsPanel';
import { worldNameFromSeed } from './ui/worldName';
import {
  captureCheckpoint,
  restoreCheckpoint,
  type SimulationCheckpoint,
} from './simulation/checkpointTimeline';
import { restoreBrowserWorld, saveBrowserWorld } from './state/browserWorldSave';
import { deserializeEngineState, serializeEngineState } from './simulation/enginePersistence';
import {
  createDiagnosticBundle,
  diagnosticBundleByteSize,
  diagnosticBundleFileName,
  serializeDiagnosticBundle,
} from './simulation/diagnosticBundle';
import { downloadJsonFile } from './ui/browserDownload';
import BetaFeedbackPanel from './ui/BetaFeedbackPanel';
import { loadBetaFeedbackBackend, type BetaFeedbackBackend } from './services/betaFeedbackClient';
import {
  loadBetaWorldBackupBackend,
  restoreBetaWorldBackup,
  saveBetaWorldBackup,
  type BetaWorldBackupBackend,
} from './services/betaWorldBackupClient';
import Phase0Harness from './prototype/Phase0Harness';
import LLMSettingsPanel from './ui/LLMSettingsPanel';
import AdaptationEvidence from './ui/AdaptationEvidence';
import ObservatoryGuide from './ui/ObservatoryGuide';
import { evaluateWatchesForTick } from './simulation/watchIntegration';
import { loadWatches, saveWatches } from './state/watchPersistence';
import WatchesPanel from './ui/WatchesPanel';
import AlertBanner from './ui/AlertBanner';
import CompareAlert from './ui/CompareAlert';
import type { EcosystemAlert } from './simulation/watches';
import { shouldAutoPauseForObservation, loadObservatoryState } from './ui/observatoryObjectives';
import FieldJournal from './ui/FieldJournal';
import { createFieldJournal } from './simulation/fieldJournal';
import { recordJournalEntries, createLineageTracker } from './simulation/fieldJournalIntegration';

function browserStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export default function App() {
  // Check if we should render Phase 0 Harness instead of main app
  const phase0Mode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('phase0');
  if (phase0Mode) {
    return <Phase0Harness />;
  }

  const engineRef = useRef<EngineState | null>(null);
  const previousEngineRef = useRef<EngineState | null>(null);
  const recipeReplayRef = useRef<RecipeReplaySession | null>(null);
  const checkpointsRef = useRef<SimulationCheckpoint<EngineState>[]>([]);
  const lineageTrackerRef = useRef(createLineageTracker());
  const autoPauseStateRef = useRef<{
    previousTick: number;
    previousCreatureCount: number;
    previousDeathCount: number;
  }>({
    previousTick: 0,
    previousCreatureCount: 0,
    previousDeathCount: 0,
  });
  const isRunning = useStore((s) => s.isRunning);
  const speed = useStore((s) => s.speed);
  const tick = useStore((s) => s.tick);
  const selectedTile = useStore((s) => s.selectedTile);
  const setRunning = useStore((s) => s.setRunning);
  const setSpeed = useStore((s) => s.setSpeed);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('watch');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const feedbackBackend: BetaFeedbackBackend | null = useMemo(() => loadBetaFeedbackBackend(), []);
  const worldBackupBackend: BetaWorldBackupBackend | null = useMemo(() => loadBetaWorldBackupBackend(), []);
  const [worldSeed, setWorldSeed] = useState(DEFAULT_WORLD_SEED);
  const [replayActive, setReplayActive] = useState(false);
  const [replayStatus, setReplayStatus] = useState<string | null>(null);
  const [checkpointTicks, setCheckpointTicks] = useState<number[]>([]);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [watchesPanelOpen, setWatchesPanelOpen] = useState(false);
  const [comparedAlert, setComparedAlert] = useState<EcosystemAlert | null>(null);
  const worldName = worldNameFromSeed(worldSeed);

  const openSettings = useCallback((tab?: SettingsTab) => {
    // Keep any selected tile intact: Act's Introduce Species flow targets it.
    // The panel is always visible, so this only switches which tab it shows.
    if (tab) setSettingsTab(tab);
  }, []);

  const publish = useCallback((engine: EngineState) => {
    const store = useStore.getState();
    store.setWorldState(snapshotEngine(engine));
    store.setTick(engine.tick);
    if (engine.tick > 0 && !engine.creatures.some((creature) => creature.lifecycleState === 'alive')) {
      store.setRunning(false);
    }

    // Record journal entries from new events
    if (store.fieldJournal) {
      const updatedJournal = recordJournalEntries(
        store.fieldJournal,
        previousEngineRef.current,
        engine,
        lineageTrackerRef.current
      );
      if (updatedJournal !== store.fieldJournal) {
        store.setFieldJournal(updatedJournal);
      }
    }
    previousEngineRef.current = engine;

    // Evaluate watches and generate alerts
    const { updatedWatches, newAlerts } = evaluateWatchesForTick(
      store.ecosystemWatches,
      engine
    );
    if (updatedWatches.length > 0) {
      // Update watches with rate-limiting state
      store.ecosystemWatches.forEach((watch) => {
        const updated = updatedWatches.find((w) => w.id === watch.id);
        if (updated && (updated.lastAlertTick !== watch.lastAlertTick || updated.lastAlertValue !== watch.lastAlertValue)) {
          store.updateWatch(watch.id, {
            lastAlertTick: updated.lastAlertTick,
            lastAlertValue: updated.lastAlertValue,
          });
        }
      });
    }
    if (newAlerts.length > 0) {
      store.addAlerts(newAlerts);
    }

    const storage = browserStorage();
    if (storage) {
      saveBrowserWorld(storage, engine);
      saveWatches(storage, store.ecosystemWatches);
    }

    // Check if we should auto-pause for observatory observation
    // Only auto-pause if player is on-boarded and in the middle of objectives
    const observatoryState = store.observatoryState;
    if (observatoryState && observatoryState.isOnboarded && observatoryState.currentObjective) {
      const creatureCount = engine.creatures.filter((c) => c.lifecycleState === 'alive').length;
      const deathCount = engine.events.filter((e) => e.type === 'death').length;

      if (
        shouldAutoPauseForObservation(
          engine.tick,
          autoPauseStateRef.current.previousTick,
          creatureCount,
          autoPauseStateRef.current.previousCreatureCount,
          deathCount,
          autoPauseStateRef.current.previousDeathCount
        )
      ) {
        store.setRunning(false);
      }

      // Update tracking state for next tick
      autoPauseStateRef.current = {
        previousTick: engine.tick,
        previousCreatureCount: creatureCount,
        previousDeathCount: deathCount,
      };
    }
  }, []);

  const recordCheckpoint = useCallback((engine: EngineState) => {
    const next = captureCheckpoint(checkpointsRef.current, engine);
    if (next === checkpointsRef.current) return;
    checkpointsRef.current = next;
    setCheckpointTicks(next.map((checkpoint) => checkpoint.tick));
  }, []);

  const reset = useCallback(() => {
    const store = useStore.getState();
    store.setRunning(false);
    store.setSelectedTile(null);
    store.clearFollowedLineages();
    recipeReplayRef.current = null;
    setReplayActive(false);
    setReplayStatus(null);
    autoPauseStateRef.current = {
      previousTick: 0,
      previousCreatureCount: 0,
      previousDeathCount: 0,
    };
    const engine = buildDemoEngine(worldSeed, store.constants);
    engineRef.current = engine;
    previousEngineRef.current = null;
    lineageTrackerRef.current = createLineageTracker();
    const newJournal = createFieldJournal(worldSeed);
    store.setFieldJournal(newJournal);
    checkpointsRef.current = [];
    recordCheckpoint(engine);
    publish(engine);
  }, [publish, recordCheckpoint, worldSeed]);

  const startWorld = useCallback((seed: number) => {
    const store = useStore.getState();
    store.setRunning(false);
    store.setSelectedTile(null);
    store.clearFollowedLineages();
    recipeReplayRef.current = null;
    setReplayActive(false);
    setReplayStatus(null);
    autoPauseStateRef.current = {
      previousTick: 0,
      previousCreatureCount: 0,
      previousDeathCount: 0,
    };
    const engine = buildDemoEngine(seed, store.constants);
    engineRef.current = engine;
    previousEngineRef.current = null;
    lineageTrackerRef.current = createLineageTracker();
    const newJournal = createFieldJournal(seed);
    store.setFieldJournal(newJournal);
    checkpointsRef.current = [];
    recordCheckpoint(engine);
    setWorldSeed(seed);
    publish(engine);
  }, [publish, recordCheckpoint]);

  const newWorld = useCallback(() => {
    startWorld(createFreshWorldSeed(worldSeed));
  }, [startWorld, worldSeed]);

  const exportWorld = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    downloadJsonFile(
      `${worldNameFromSeed(engine.seed).toLowerCase().replace(/\s+/g, '-')}-tick-${engine.tick}.origins.json`,
      serializeEngineState(engine),
    );
  }, []);

  const exportDiagnostic = useCallback((): string => {
    const engine = engineRef.current;
    if (!engine) return 'Could not export diagnostic: no world is loaded';
    try {
      const bundle = createDiagnosticBundle(engine);
      const serialized = serializeDiagnosticBundle(bundle);
      downloadJsonFile(diagnosticBundleFileName(bundle), serialized);
      const kibibytes = Math.max(1, Math.ceil(diagnosticBundleByteSize(serialized) / 1024));
      return `Downloaded diagnostic for tick ${engine.tick.toLocaleString()} (${kibibytes.toLocaleString()} KiB)`;
    } catch (error) {
      return error instanceof Error
        ? `Could not export diagnostic: ${error.message}`
        : 'Could not export diagnostic';
    }
  }, []);

  const importWorld = useCallback(async (file: File): Promise<string | null> => {
    try {
      const engine = deserializeEngineState(await file.text());
      const store = useStore.getState();
      store.setRunning(false);
      store.setSelectedTile(null);
      store.clearFollowedLineages();
      store.updateConstants(engine.constants);
      engineRef.current = engine;
      lineageTrackerRef.current = createLineageTracker();
      // Initialize field journal for restored world
      const newJournal = createFieldJournal(engine.seed);
      store.setFieldJournal(newJournal);
      checkpointsRef.current = [];
      recordCheckpoint(engine);
      setWorldSeed(engine.seed);
      publish(engine);
      return `Restored ${worldNameFromSeed(engine.seed)} at tick ${engine.tick.toLocaleString()}`;
    } catch (error) {
      return error instanceof Error ? `Could not restore world: ${error.message}` : 'Could not restore world';
    }
  }, [publish, recordCheckpoint]);

  const backupWorld = useCallback(async (): Promise<string> => {
    const engine = engineRef.current;
    if (!engine) return 'Could not save cloud backup: no world is loaded';
    const result = await saveBetaWorldBackup(engine, worldBackupBackend);
    return result.message;
  }, [worldBackupBackend]);

  const restoreCloudWorld = useCallback(async (): Promise<string> => {
    const result = await restoreBetaWorldBackup(worldBackupBackend);
    if (result.status !== 'success') return result.message;
    const engine = result.state;
    const store = useStore.getState();
    store.setRunning(false);
    store.setSelectedTile(null);
    store.clearFollowedLineages();
    store.updateConstants(engine.constants);
    recipeReplayRef.current = null;
    setReplayActive(false);
    setReplayStatus(null);
    engineRef.current = engine;
    lineageTrackerRef.current = createLineageTracker();
    // Initialize field journal for restored world
    const newJournal = createFieldJournal(engine.seed);
    store.setFieldJournal(newJournal);
    checkpointsRef.current = [];
    recordCheckpoint(engine);
    setWorldSeed(engine.seed);
    publish(engine);
    return result.message;
  }, [publish, recordCheckpoint, worldBackupBackend]);

  const replayWorld = useCallback(() => {
    reset();
    useStore.getState().setRunning(true);
  }, [reset]);

  const addSpecies = useCallback((
    strategy: EnergyStrategy,
    name: string,
    traitOverrides: FounderTraitOverrides
  ): string | null => {
    if (recipeReplayRef.current) return 'Manual interventions are disabled during recipe replay';
    const engine = engineRef.current;
    const tile = useStore.getState().selectedTile;
    if (!engine || !tile) return 'Select a tile in the world first';
    try {
      const introduction = introduceSpecies(engine, strategy, tile, name, traitOverrides);
      engineRef.current = introduction.state;
      recordCheckpoint(introduction.state);
      publish(introduction.state);
      // You introduced it deliberately, so start tracking it: founders are
      // created with lineageId === speciesId, which is the follow key.
      const store = useStore.getState();
      const alreadyFollowed = store.followedLineages.some(
        (item) => item.speciesId === introduction.speciesId
          && item.lineageId === introduction.speciesId
      );
      if (!alreadyFollowed) {
        store.toggleFollowedLineage({
          speciesId: introduction.speciesId,
          lineageId: introduction.speciesId,
        });
      }
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not introduce this species';
    }
  }, [publish, recordCheckpoint]);

  const restoreToTick = useCallback((restoreTick: number): string | null => {
    const restored = restoreCheckpoint(checkpointsRef.current, restoreTick);
    if (!restored) return 'That restore point is no longer available';
    const store = useStore.getState();
    store.setRunning(false);
    store.setSelectedTile(null);
    store.clearFollowedLineages();
    store.updateConstants(restored.state.constants);
    recipeReplayRef.current = null;
    setReplayActive(false);
    setReplayStatus(null);
    autoPauseStateRef.current = {
      previousTick: 0,
      previousCreatureCount: 0,
      previousDeathCount: 0,
    };
    checkpointsRef.current = restored.checkpoints;
    setCheckpointTicks(restored.checkpoints.map((checkpoint) => checkpoint.tick));
    engineRef.current = restored.state;
    publish(restored.state);
    return null;
  }, [publish]);

  const navigateToJournalTick = useCallback((tick: number): void => {
    // Find the closest checkpoint at or before the target tick
    const validCheckpoints = checkpointTicks.filter((t) => t <= tick).sort((a, b) => b - a);
    if (validCheckpoints.length === 0) {
      // No checkpoint before this tick, try to go to first checkpoint
      if (checkpointTicks.length > 0) {
        restoreToTick(checkpointTicks[0]);
      }
      return;
    }
    const closestTick = validCheckpoints[0];
    restoreToTick(closestTick);
  }, [checkpointTicks, restoreToTick]);

  const replayFromTick = useCallback((restoreTick: number): string | null => {
    const error = restoreToTick(restoreTick);
    if (!error) useStore.getState().setRunning(true);
    return error;
  }, [restoreToTick]);

  const startRecipeReplay = useCallback((recipe: WorldRecipe): string | null => {
    try {
      const session = createRecipeReplay(recipe);
      const store = useStore.getState();
      store.setRunning(false);
      store.setSelectedTile(null);
      store.clearFollowedLineages();
      store.updateConstants(session.constants);
      engineRef.current = session.state;
      lineageTrackerRef.current = createLineageTracker();
      // Initialize field journal for replay
      const newJournal = createFieldJournal(recipe.seed);
      store.setFieldJournal(newJournal);
      checkpointsRef.current = [];
      recordCheckpoint(session.state);
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
  }, [publish, recordCheckpoint]);

  // Initialize world once
  useEffect(() => {
    if (!engineRef.current) {
      const store = useStore.getState();
      const storage = browserStorage();
      const restoreResult = storage ? restoreBrowserWorld(storage) : null;
      const restored = restoreResult?.state ?? null;
      const engine = restored ?? buildDemoEngine(worldSeed, store.constants);
      engineRef.current = engine;
      if (restoreResult?.recoveredFromInvalidSave) {
        setRecoveryNotice('A saved world could not be restored, so Origins started a new world. You can import an exported world save from World controls.');
      }
      if (restored) {
        store.updateConstants(restored.constants);
        setWorldSeed(restored.seed);
      }
      // Initialize field journal for this world
      const newJournal = createFieldJournal(engine.seed);
      store.setFieldJournal(newJournal);
      lineageTrackerRef.current = createLineageTracker();
      // Load observatory state from storage (first-run objectives progress)
      const loadedObservatoryState = loadObservatoryState();
      store.setObservatoryState(loadedObservatoryState);
      // Load watches from storage
      if (storage) {
        const loadedWatches = loadWatches(storage);
        if (loadedWatches.length > 0) {
          loadedWatches.forEach((watch) => {
            store.addWatch(watch);
          });
        }
      }
      recordCheckpoint(engine);
      publish(engine);
    }
  }, [publish, recordCheckpoint, worldSeed]);

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
          if (engineRef.current) recordCheckpoint(engineRef.current);
          ticked = true;
        }
        acc -= tickMs;
        if (!useStore.getState().isRunning) break;
      }
      if (ticked && engineRef.current) publish(engineRef.current);
    }, getUiFrameInterval(speed));
    return () => clearInterval(interval);
  }, [isRunning, speed, publish, recordCheckpoint]);

  return (
    <div className="app-shell">
      <SimWindow
        title="Project Origins — Living World"
        titleAs="h1"
        className="app-shell__window"
        bodyClassName="app-shell__window-body"
        controls={(
          <>
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
            </div>
            <button
              type="button"
              className="sim-button sim-button--compact"
              aria-label="Send beta feedback"
              aria-controls="beta-feedback-panel"
              aria-expanded={feedbackOpen}
              onClick={() => setFeedbackOpen(true)}
            >
              Feedback
            </button>
          </>
        )}
      >
        {recoveryNotice && (
          <div className="app-shell__recovery-notice sim-status--warning" role="status">
            <span>{recoveryNotice}</span>
            <button type="button" className="sim-button sim-button--compact" onClick={() => setRecoveryNotice(null)}>Dismiss</button>
          </div>
        )}
        <EvolutionRibbon onOpenLineages={() => openSettings('remember')} legendOpen={legendOpen} onToggleLegend={() => setLegendOpen(!legendOpen)} />
        <div className="app-shell__stage">
          <main aria-label="Ecosystem world" className="app-shell__world">
            <LiveThreeWorldView />
            <WorldView />
            <WorldLegend open={legendOpen} onToggle={() => setLegendOpen(!legendOpen)} />
            <TileInfoPanel onOpenLineages={() => openSettings('remember')} />
          </main>
          <SettingsPanel
            activeTab={settingsTab}
            onTabChange={(tab) => setSettingsTab(tab)}
            worldName={worldName}
            worldSeed={worldSeed}
          >
            {settingsTab === 'watch' && <StatsPanel />}
            {settingsTab === 'diagnose' && (
              <>
                <EcosystemPressurePanel />
                <AdaptationEvidence />
                <EventTimeline
                  onReplayRecipe={startRecipeReplay}
                  replayStatus={replayStatus}
                />
              </>
            )}
            {settingsTab === 'act' && (
              <>
                <LLMSettingsPanel />
                <ControlPanel
                  onReset={reset}
                  onNewWorld={newWorld}
                  onExportWorld={exportWorld}
                  onExportDiagnostic={exportDiagnostic}
                  onImportWorld={importWorld}
                  onCloudBackup={backupWorld}
                  onCloudRestore={restoreCloudWorld}
                  onStartSeed={startWorld}
                  worldSeed={worldSeed}
                  worldName={worldName}
                  onIntroduceSpecies={addSpecies}
                  replayActive={replayActive}
                  checkpointTicks={checkpointTicks}
                  onRestoreCheckpoint={restoreToTick}
                />
              </>
            )}
            {settingsTab === 'remember' && (
              <>
                <FollowedLineageNotices />
                <FieldJournal onNavigateToTick={navigateToJournalTick} />
                <SpeciesPanel />
                <LineageHistory />
              </>
            )}
          </SettingsPanel>
        </div>
      </SimWindow>
      <TurningPointChoice onIntroduceSpecies={() => openSettings('act')} />
      <ExtinctionSummary
        onNewWorld={newWorld}
        onReplayWorld={replayWorld}
        onReplayFromTick={replayFromTick}
        checkpointTicks={checkpointTicks}
      />
      <BetaFeedbackPanel
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        backend={feedbackBackend}
      />
      <FirstRunOnboarding />
      <ObservatoryGuide />
      <AlertBanner
        onCompare={(alert) => setComparedAlert(alert)}
        onFocus={(alert) => {
          // Focus already handled in AlertBanner via setSelectedTile
          // This callback is optional but can be used for custom focus handling
        }}
        onPause={() => {
          // Pause already handled in AlertBanner via setRunning
          // This callback is optional but can be used for custom pause handling
        }}
      />
      {comparedAlert && (
        <CompareAlert
          alert={comparedAlert}
          onClose={() => setComparedAlert(null)}
        />
      )}
      {watchesPanelOpen && (
        <div className="modal-overlay" onClick={() => setWatchesPanelOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <WatchesPanel onClose={() => setWatchesPanelOpen(false)} />
          </div>
        </div>
      )}
      <button
        className="watches-fab"
        onClick={() => setWatchesPanelOpen(!watchesPanelOpen)}
        aria-label="Open ecosystem watches"
        title="Ecosystem Watches"
      >
        👁️
      </button>
    </div>
  );
}
