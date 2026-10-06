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
import { EngineWorkerManager } from './simulation/engineWorkerManager';
import type { EnergyStrategy } from './utils/traits';
import type { FounderTraitOverrides } from './simulation/founderTraits';
import type { DisasterCommand } from './simulation/disasterCommand';
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
import { loadFieldJournal, saveFieldJournal } from './state/fieldJournalPersistence';
import ChallengePanel from './ui/ChallengePanel';
import { buildWorldRecipe } from './ui/worldRecipe';
import { buildSessionSummary } from './ui/sessionSummary';
import BranchComparisonView from './ui/BranchComparison';
import {
  createBranch as createBranchFromSnapshot,
  captureCheckpointOnBranch,
} from './simulation/worldBranch';

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
  const engineWorkerManagerRef = useRef<EngineWorkerManager | null>(null);
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
  const show2dView = useStore((s) => s.show2dView);
  const setRunning = useStore((s) => s.setRunning);
  const setSpeed = useStore((s) => s.setSpeed);
  const setShow2dView = useStore((s) => s.setShow2dView);
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
  const [challengePanelOpen, setChallengePanelOpen] = useState(false);
  const [branchComparisonOpen, setBranchComparisonOpen] = useState(false);
  const worldName = worldNameFromSeed(worldSeed);

  // Compute current world recipe and session summary from live engine state
  const worldState = useStore((s) => s.worldState);
  const currentRecipe = useMemo(() => buildWorldRecipe(worldState), [worldState]);
  const sessionSummary = useMemo(() => {
    if (!worldState) return null;
    return buildSessionSummary(worldState, tick);
  }, [worldState, tick]);

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
        // Persist journal to storage
        const storage = browserStorage();
        if (storage) {
          saveFieldJournal(storage, updatedJournal);
        }
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

    // Capture checkpoints on active branch
    const store = useStore.getState();
    if (store.branchCollection && store.activeBranchId !== null) {
      const activeBranch = store.branchCollection.alternatives.find((b) => b.id === store.activeBranchId);
      if (activeBranch) {
        // Capture the checkpoint on the active branch
        const worldSnapshot = snapshotEngine(engine);
        const updatedBranch = captureCheckpointOnBranch(
          activeBranch,
          worldSnapshot
        );
        // Update the branch in the store if it changed
        if (updatedBranch !== activeBranch) {
          store.updateBranch(store.activeBranchId, updatedBranch);
        }
      }
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
    autoPauseStateRef.current = {
      previousTick: 0,
      previousCreatureCount: 0,
      previousDeathCount: 0,
    };
    const engine = buildDemoEngine(worldSeed, store.constants);
    engineRef.current = engine;
    previousEngineRef.current = null;
    lineageTrackerRef.current = createLineageTracker();
    // Initialize engine worker manager with the new engine
    if (engineWorkerManagerRef.current) {
      engineWorkerManagerRef.current.dispose();
    }
    const manager = new EngineWorkerManager({ mode: 'worker' });
    engineWorkerManagerRef.current = manager;
    manager.init(engine).catch((err) => console.error('Failed to initialize engine worker manager:', err));
    // Load journal from storage if available, otherwise create new
    const storage = browserStorage();
    const loadedJournal = storage ? loadFieldJournal(storage, worldSeed) : createFieldJournal(worldSeed);
    store.setFieldJournal(loadedJournal);
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
    // Initialize engine worker manager with the new engine
    if (engineWorkerManagerRef.current) {
      engineWorkerManagerRef.current.dispose();
    }
    const manager = new EngineWorkerManager({ mode: 'worker' });
    engineWorkerManagerRef.current = manager;
    manager.init(engine).catch((err) => console.error('Failed to initialize engine worker manager:', err));
    // Load journal from storage if available, otherwise create new
    const storage = browserStorage();
    const loadedJournal = storage ? loadFieldJournal(storage, seed) : createFieldJournal(seed);
    store.setFieldJournal(loadedJournal);
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
      // Initialize engine worker manager with the imported engine
      if (engineWorkerManagerRef.current) {
        engineWorkerManagerRef.current.dispose();
      }
      const manager = new EngineWorkerManager({ mode: 'worker' });
      engineWorkerManagerRef.current = manager;
      await manager.init(engine);
      // Load field journal from storage if available, otherwise create new
      const storage = browserStorage();
      const loadedJournal = storage ? loadFieldJournal(storage, engine.seed) : createFieldJournal(engine.seed);
      store.setFieldJournal(loadedJournal);
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
    // Initialize engine worker manager with the restored engine
    if (engineWorkerManagerRef.current) {
      engineWorkerManagerRef.current.dispose();
    }
    const manager = new EngineWorkerManager({ mode: 'worker' });
    engineWorkerManagerRef.current = manager;
    await manager.init(engine);
    // Load field journal from storage if available, otherwise create new
    const storage = browserStorage();
    const loadedJournal = storage ? loadFieldJournal(storage, engine.seed) : createFieldJournal(engine.seed);
    store.setFieldJournal(loadedJournal);
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

  const addDisaster = useCallback((command: DisasterCommand): string | null => {
    if (recipeReplayRef.current) return 'Manual interventions are disabled during recipe replay';
    const engine = engineRef.current;
    if (!engine) return 'Engine not initialized';
    try {
      const store = useStore.getState();
      const newState = store.triggerDisaster(command, engine);
      if (!newState) return 'Failed to apply disaster';
      engineRef.current = newState;
      recordCheckpoint(newState);
      publish(newState);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not apply disaster';
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
    // Initialize engine worker manager with the restored engine state
    if (engineWorkerManagerRef.current) {
      engineWorkerManagerRef.current.dispose();
    }
    const manager = new EngineWorkerManager({ mode: 'worker' });
    engineWorkerManagerRef.current = manager;
    manager.init(restored.state).catch((err) => console.error('Failed to initialize engine worker manager:', err));
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

  const navigateToTile = useCallback((x: number, y: number): void => {
    // Pan/center the world view on the specified grid cell
    const store = useStore.getState();
    store.setSelectedTile({ x, y });
  }, []);

  const navigateToLineage = useCallback((speciesId: string, lineageId: string): void => {
    // Switch to the remember tab to show the journal filtered to this lineage
    // The journal component will handle the filtering via its onNavigateToLineage callback
    setSettingsTab('remember');
  }, []);

  const replayFromTick = useCallback((restoreTick: number): string | null => {
    const error = restoreToTick(restoreTick);
    if (!error) useStore.getState().setRunning(true);
    return error;
  }, [restoreToTick]);

  const createBranchFromCheckpoint = useCallback((): string | null => {
    const store = useStore.getState();
    if (!store.worldState) return 'No world state available';
    if (!engineRef.current) return 'Engine not initialized';

    try {
      // Create a new branch from the current world state
      const branchName = `Branch at Tick ${store.tick}`;
      const changedIntervention = {
        tick: store.tick,
        kind: 'settings-change' as const,
        label: 'Manual branch creation',
      };

      const newBranch = createBranchFromSnapshot(
        store.worldState,
        store.tick,
        changedIntervention,
        branchName
      );

      // Add the branch to the store
      store.createBranch(newBranch);

      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not create branch';
    }
  }, []);

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
      // Initialize engine worker manager with the replayed engine
      if (engineWorkerManagerRef.current) {
        engineWorkerManagerRef.current.dispose();
      }
      const manager = new EngineWorkerManager({ mode: 'worker' });
      engineWorkerManagerRef.current = manager;
      manager.init(session.state).catch((err) => console.error('Failed to initialize engine worker manager:', err));
      // Load field journal from storage if available, otherwise create new
      const storage = browserStorage();
      const loadedJournal = storage ? loadFieldJournal(storage, recipe.seed) : createFieldJournal(recipe.seed);
      store.setFieldJournal(loadedJournal);
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

  // Cleanup engine worker manager on unmount
  useEffect(() => {
    return () => {
      if (engineWorkerManagerRef.current) {
        engineWorkerManagerRef.current.dispose();
        engineWorkerManagerRef.current = null;
      }
    };
  }, []);

  // Keyboard shortcut for toggling 2D/3D view (press 'M' for map)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only trigger if 'm' or 'M' is pressed and no modifier keys
      if ((event.key === 'm' || event.key === 'M') && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        // Check if focus is not in an input or textarea
        const target = event.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          event.preventDefault();
          setShow2dView(!show2dView);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [show2dView, setShow2dView]);

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
      // Load field journal from storage if available, otherwise create new
      const loadedJournal = storage ? loadFieldJournal(storage, engine.seed) : createFieldJournal(engine.seed);
      store.setFieldJournal(loadedJournal);
      lineageTrackerRef.current = createLineageTracker();
      // Initialize engine worker manager with the loaded/created engine
      if (engineWorkerManagerRef.current) {
        engineWorkerManagerRef.current.dispose();
      }
      const manager = new EngineWorkerManager({ mode: 'worker' });
      engineWorkerManagerRef.current = manager;
      manager.init(engine).catch((err) => console.error('Failed to initialize engine worker manager:', err));
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
    let tickInProgress = false;

    const interval = setInterval(() => {
      // Update accumulator based on elapsed time
      const now = performance.now();
      acc += now - last;
      last = now;
      if (acc > tickMs * 5) acc = tickMs * 5;

      // Don't start a new tick if one is already in progress
      if (tickInProgress) return;

      // Handle recipe replay: process ticks synchronously in a loop
      const replay = recipeReplayRef.current;
      if (replay) {
        // Recipe replay is synchronous, run it in a loop to catch up
        while (acc >= tickMs) {
          try {
            const advanced = advanceRecipeReplay(replay);
            engineRef.current = advanced.state;
            useStore.getState().updateConstants(advanced.constants);
            recipeReplayRef.current = advanced.complete ? null : advanced;
            if (advanced.complete) {
              setReplayActive(false);
              setReplayStatus(`Replay complete at tick ${advanced.state.tick.toLocaleString()}`);
              useStore.getState().setRunning(false);
              break;
            } else {
              setReplayStatus(
                `Replaying tick ${advanced.state.tick.toLocaleString()} of ${advanced.recipe.throughTick.toLocaleString()}`
              );
            }
            if (engineRef.current) {
              recordCheckpoint(engineRef.current);
              publish(engineRef.current);
            }
            acc -= tickMs;
          } catch (error) {
            recipeReplayRef.current = null;
            setReplayActive(false);
            setReplayStatus(error instanceof Error ? error.message : 'Recipe replay diverged');
            useStore.getState().setRunning(false);
            break;
          }
        }
      } else {
        // Normal simulation: batch multiple ticks into a single async command
        if (acc >= tickMs) {
          const tickCount = Math.floor(acc / tickMs);
          tickInProgress = true;
          (async () => {
            try {
              const manager = engineWorkerManagerRef.current;
              if (manager) {
                // Use manager to execute batched ticks
                await manager.sendCommand({
                  type: 'tick',
                  count: tickCount,
                  constantOverrides: useStore.getState().constants,
                });
                // Retrieve updated engine state from manager
                const updated = manager.getCurrentEngine();
                if (updated) {
                  engineRef.current = updated;
                }
              } else {
                // Fallback if manager not initialized yet
                const prev = engineRef.current;
                if (prev) {
                  let currentEngine = prev;
                  for (let i = 0; i < tickCount; i++) {
                    currentEngine = tickEngine(currentEngine, useStore.getState().constants);
                  }
                  engineRef.current = currentEngine;
                }
              }
              if (engineRef.current) {
                recordCheckpoint(engineRef.current);
                publish(engineRef.current);
              }
            } catch (error) {
              console.error('Engine tick failed:', error);
              useStore.getState().setRunning(false);
            } finally {
              tickInProgress = false;
            }
          })();
          acc -= tickMs * tickCount;
        }
      }
      if (!useStore.getState().isRunning) return;
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
              className={`sim-button sim-button--compact${show2dView ? ' sim-button--pressed' : ''}`}
              aria-pressed={show2dView}
              aria-label="Toggle between 3D and 2D map view (press M)"
              title="Toggle 2D map view (M)"
              onClick={() => setShow2dView(!show2dView)}
              data-testid="toggle-view-button"
            >
              {show2dView ? '3D' : '2D'}
            </button>
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
            <button
              type="button"
              className={`sim-button sim-button--compact${branchComparisonOpen ? ' sim-button--pressed' : ''}`}
              aria-pressed={branchComparisonOpen}
              aria-label="Open branch comparison"
              onClick={() => setBranchComparisonOpen(!branchComparisonOpen)}
            >
              Compare
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
          <main aria-label="Ecosystem world" className="app-shell__world" data-view-mode={show2dView ? '2d' : '3d'}>
            {!show2dView && <LiveThreeWorldView />}
            {show2dView && <WorldView />}
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
                  onIntroduceDisaster={addDisaster}
                  replayActive={replayActive}
                  checkpointTicks={checkpointTicks}
                  onRestoreCheckpoint={restoreToTick}
                />
              </>
            )}
            {settingsTab === 'remember' && (
              <>
                <FollowedLineageNotices />
                <FieldJournal
                  onNavigateToTick={navigateToJournalTick}
                  onNavigateToTile={navigateToTile}
                  onNavigateToLineage={navigateToLineage}
                />
                <SpeciesPanel />
                <LineageHistory />
              </>
            )}
          </SettingsPanel>
        </div>
      </SimWindow>
      <TurningPointChoice
        onIntroduceSpecies={() => openSettings('act')}
      />
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
      {challengePanelOpen && (
        <div className="modal-overlay" onClick={() => setChallengePanelOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <ChallengePanel
              isVisible={challengePanelOpen}
              sessionSummary={sessionSummary}
              currentTick={tick}
              currentRecipe={currentRecipe}
              onStart={(challenge, recipe) => {
                const error = startRecipeReplay(recipe);
                if (!error) {
                  setChallengePanelOpen(false);
                }
              }}
              onExport={(json) => {
                downloadJsonFile('challenge-outcome.json', json);
              }}
            />
          </div>
        </div>
      )}
      {watchesPanelOpen && (
        <div className="modal-overlay" onClick={() => setWatchesPanelOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <WatchesPanel onClose={() => setWatchesPanelOpen(false)} />
          </div>
        </div>
      )}
      {branchComparisonOpen && (
        <div className="modal-overlay" onClick={() => setBranchComparisonOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Branch and Compare</h2>
              <button
                type="button"
                className="sim-button sim-button--compact"
                onClick={() => setBranchComparisonOpen(false)}
                aria-label="Close branch comparison"
              >
                ✕
              </button>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                className="sim-button"
                onClick={() => {
                  const error = createBranchFromCheckpoint();
                  if (!error) {
                    // Optionally close the panel or show success message
                  }
                }}
              >
                Create Branch from Current Checkpoint (Tick {tick})
              </button>
            </div>
            <BranchComparisonView />
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
      <button
        className="challenges-fab"
        onClick={() => setChallengePanelOpen(!challengePanelOpen)}
        aria-label="Open shared challenges"
        title="Shared Challenges"
      >
        🎯
      </button>
    </div>
  );
}
