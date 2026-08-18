import { useCallback, useEffect, useRef, useState } from 'react';
import { World } from '../simulation/world';
import { ResourceLedger, PHASE0_ECONOMY_CONSTANTS } from '../simulation/pivot/economy';
import {
  type Scout,
  issueWaypoint,
  tickScoutMovement,
  chebyshevDistance,
} from '../simulation/pivot/scout';
import {
  type Building,
  buildHarvester,
  setDormant,
  tickBuildingDecay,
  recommission,
  demolishManual,
  calculateRecommissionCost,
} from '../simulation/pivot/building';
import {
  type Crisis,
  detectCrises,
  resolveTier1,
  TOXICITY_CRISIS_THRESHOLD,
} from '../simulation/pivot/crisis';
import { EquilibriumTracker } from '../simulation/pivot/equilibrium';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import {
  captureCheckpoint,
  restoreCheckpoint,
  type SimulationCheckpoint,
  type Phase0State,
} from '../simulation/checkpointTimeline';

const BASE_X = 50;
const BASE_Y = 50;
const BUBBLE_RADIUS = 5;

interface Phase0HarnessState {
  world: World;
  ledger: ResourceLedger;
  scout: Scout;
  building: Building | null;
  crises: Crisis[];
  equilibrium: EquilibriumTracker;
  tick: number;
  selectedWaypoint: { x: number; y: number } | null;
}

function initializePhase0State(): Phase0HarnessState {
  const world = new World(100, 100, SIMULATION_CONSTANTS, 12345);

  // Set some initial toxicity for testing crisis detection
  world.setCell(25, 25, { toxicity: 1.5 });
  world.setCell(75, 75, { toxicity: 0.8 });

  const ledger = new ResourceLedger();
  const scout: Scout = {
    id: 'scout_0',
    x: BASE_X,
    y: BASE_Y,
    waypoint: null,
    battery: 100,
    inBubble: true,
    status: 'active',
    onboardDiscoveries: [],
  };

  return {
    world,
    ledger,
    scout,
    building: null,
    crises: [],
    equilibrium: new EquilibriumTracker(),
    tick: 0,
    selectedWaypoint: null,
  };
}

function serializePhase0State(state: Phase0HarnessState): Phase0State {
  const balances = state.ledger.getBalances();
  return {
    ledger: balances,
    scout: state.scout,
    buildings: state.building ? [state.building] : [],
    crises: state.crises,
  };
}

function restorePhase0State(phase0: Phase0State, world: World): Partial<Phase0HarnessState> {
  const restored: Partial<Phase0HarnessState> = {};

  if (phase0.ledger) {
    restored.ledger = new ResourceLedger(phase0.ledger.energy, phase0.ledger.biomass);
  }

  if (phase0.scout) {
    restored.scout = phase0.scout;
  }

  if (phase0.buildings && phase0.buildings.length > 0) {
    restored.building = phase0.buildings[0];
  }

  if (phase0.crises) {
    restored.crises = phase0.crises;
  }

  return restored;
}

export default function Phase0Harness() {
  const stateRef = useRef<Phase0HarnessState | null>(null);
  const checkpointsRef = useRef<SimulationCheckpoint<{ tick: number }>[]>([]);

  const [state, setState] = useState<Phase0HarnessState>(initializePhase0State());
  const [message, setMessage] = useState<string>('');
  const [checkpointTicks, setCheckpointTicks] = useState<number[]>([]);

  stateRef.current = state;

  const addCheckpoint = useCallback(() => {
    const phase0 = serializePhase0State(state);
    const checkpointState = { tick: state.tick };
    const next = captureCheckpoint(
      checkpointsRef.current,
      checkpointState,
      1, // capture every tick for testing
      30,
      phase0
    );
    checkpointsRef.current = next;
    setCheckpointTicks(next.map((c) => c.tick));
  }, [state]);

  const tickSimulation = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, tick: prev.tick + 1 };

      // Tick scout movement
      tickScoutMovement(prev.scout, BASE_X, BASE_Y, BUBBLE_RADIUS);

      // Tick building decay
      if (prev.building) {
        tickBuildingDecay(prev.building);
      }

      // Detect new crises
      const newCrises = detectCrises(prev.world, next.tick, prev.crises);
      next.crises = [...prev.crises, ...newCrises];

      // Record equilibrium progress
      const order = 60; // mock values
      const chaos = 45;
      const exploration = 50;
      const replacement = 1.0;
      prev.equilibrium.recordTick(order, chaos, exploration, replacement, false, false);

      next.scout = prev.scout;
      next.building = prev.building;
      next.crises = next.crises;

      addCheckpoint();
      return next;
    });
  }, [addCheckpoint]);

  const buildHarvesterAction = useCallback(() => {
    setState((prev) => {
      try {
        const building = buildHarvester(prev.ledger, BASE_X + 1, BASE_Y + 1, prev.tick);
        setMessage(`Built harvester at (${building.x}, ${building.y})`);
        return { ...prev, building };
      } catch (e) {
        setMessage(`Failed to build: ${e instanceof Error ? e.message : 'unknown error'}`);
        return prev;
      }
    });
  }, []);

  const setDormantAction = useCallback(() => {
    setState((prev) => {
      if (!prev.building) {
        setMessage('No building to set dormant');
        return prev;
      }
      setDormant(prev.building);
      setMessage(`Building set dormant (decay: ${prev.building.decayTicks})`);
      return prev;
    });
  }, []);

  const recommissionAction = useCallback(() => {
    setState((prev) => {
      if (!prev.building) {
        setMessage('No building to recommission');
        return prev;
      }
      if (prev.building.state !== 'dormant') {
        setMessage('Building is not dormant');
        return prev;
      }
      try {
        recommission(prev.building, prev.ledger, prev.tick);
        setMessage('Building recommissioned');
        return prev;
      } catch (e) {
        setMessage(`Failed to recommission: ${e instanceof Error ? e.message : 'unknown error'}`);
        return prev;
      }
    });
  }, []);

  const demolishAction = useCallback(() => {
    setState((prev) => {
      if (!prev.building) {
        setMessage('No building to demolish');
        return prev;
      }
      demolishManual(prev.building, prev.ledger);
      setMessage('Building demolished');
      return { ...prev, building: null };
    });
  }, []);

  const respondToCrisisAction = useCallback((crisisIndex: number) => {
    setState((prev) => {
      const crisis = prev.crises[crisisIndex];
      if (!crisis || crisis.status === 'resolved') {
        setMessage('Crisis not found or already resolved');
        return prev;
      }
      const success = resolveTier1(crisis, prev.world, prev.ledger);
      if (success) {
        setMessage(`Resolved crisis at (${crisis.x}, ${crisis.y})`);
        // Record intervention in equilibrium
        prev.equilibrium.recordTick(60, 45, 50, 1.0, true, false);
      } else {
        setMessage('Failed to resolve crisis: insufficient energy');
      }
      return prev;
    });
  }, []);

  const setWaypointFromGrid = useCallback((x: number, y: number) => {
    setState((prev) => {
      issueWaypoint(prev.scout, x, y);
      setMessage(`Waypoint set to (${x}, ${y}), distance: ${chebyshevDistance(prev.scout.x, prev.scout.y, x, y)}`);
      return { ...prev, selectedWaypoint: { x, y } };
    });
  }, []);

  const saveGame = useCallback(() => {
    addCheckpoint();
    setMessage(`Game saved at tick ${state.tick}`);
  }, [state.tick, addCheckpoint]);

  const loadGame = useCallback((tick: number) => {
    const checkpoint = checkpointsRef.current.find((c) => c.tick === tick);
    if (!checkpoint || !checkpoint.phase0) {
      setMessage('Checkpoint not found or missing Phase 0 state');
      return;
    }
    setState((prev) => {
      const restored = restorePhase0State(checkpoint.phase0!, prev.world);
      const newState = {
        ...prev,
        tick: checkpoint.tick,
        ...restored,
      };
      setMessage(`Loaded game from tick ${tick}`);
      return newState;
    });
  }, []);

  const gridCellSize = 8;

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', fontSize: '12px' }}>
      <h1>Phase 0 Debug Harness</h1>

      {message && (
        <div style={{ margin: '10px 0', padding: '8px', backgroundColor: '#eee', color: '#000' }}>
          {message}
        </div>
      )}

      {/* Economy Section */}
      <section style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '10px' }}>
        <h2>Economy</h2>
        <div>Energy: {state.ledger.getBalance('energy')} / {PHASE0_ECONOMY_CONSTANTS.energy.storageCap}</div>
        <div>Biomass: {state.ledger.getBalance('biomass')} / {PHASE0_ECONOMY_CONSTANTS.biomass.storageCap}</div>
        <div style={{ marginTop: '10px' }}>
          <button onClick={saveGame} style={{ marginRight: '10px' }}>Save Game</button>
          {checkpointTicks.length > 0 && (
            <>
              <select onChange={(e) => loadGame(parseInt(e.target.value, 10))}>
                <option value="">Load from checkpoint...</option>
                {checkpointTicks.map((tick) => (
                  <option key={tick} value={tick}>Tick {tick}</option>
                ))}
              </select>
            </>
          )}
        </div>
      </section>

      {/* Scout Section */}
      <section style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '10px' }}>
        <h2>Scout</h2>
        <div>Position: ({state.scout.x}, {state.scout.y})</div>
        <div>Battery: {state.scout.battery}</div>
        <div>In Bubble: {state.scout.inBubble ? 'Yes' : 'No'}</div>
        <div>Status: {state.scout.status}</div>
        {state.scout.waypoint && <div>Waypoint: ({state.scout.waypoint.x}, {state.scout.waypoint.y})</div>}
        <div style={{ marginTop: '10px' }}>
          <p>Click on the grid to set a waypoint:</p>
          <div
            style={{
              display: 'inline-block',
              border: '1px solid #999',
              backgroundColor: '#f5f5f5',
              padding: '2px',
            }}
          >
            {Array.from({ length: 100 }, (_, y) => (
              <div key={y} style={{ display: 'flex' }}>
                {Array.from({ length: 100 }, (_, x) => {
                  const isBase = x === BASE_X && y === BASE_Y;
                  const isScout = x === state.scout.x && y === state.scout.y;
                  const isWaypoint = state.scout.waypoint && x === state.scout.waypoint.x && y === state.scout.waypoint.y;
                  const distance = chebyshevDistance(x, y, BASE_X, BASE_Y);
                  const inBubble = distance <= BUBBLE_RADIUS;

                  let bg = '#ffffff';
                  if (isBase) bg = '#0f0';
                  else if (isScout) bg = '#00f';
                  else if (isWaypoint) bg = '#f00';
                  else if (inBubble) bg = '#efe';
                  else bg = '#f0f0f0';

                  return (
                    <div
                      key={`${x}-${y}`}
                      onClick={() => setWaypointFromGrid(x, y)}
                      style={{
                        width: gridCellSize,
                        height: gridCellSize,
                        backgroundColor: bg,
                        border: '1px solid #ddd',
                        cursor: 'pointer',
                      }}
                      title={`(${x}, ${y})`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ marginTop: '5px', fontSize: '10px' }}>
            Green = Base, Blue = Scout, Red = Waypoint, Light Green = Bubble, Pink = Outside
          </div>
        </div>
      </section>

      {/* Building Section */}
      <section style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '10px' }}>
        <h2>Harvester Building</h2>
        {state.building ? (
          <>
            <div>ID: {state.building.id}</div>
            <div>Position: ({state.building.x}, {state.building.y})</div>
            <div>State: {state.building.state}</div>
            <div>Decay Ticks: {state.building.decayTicks}</div>
            {state.building.state === 'operational' && (
              <button onClick={setDormantAction} style={{ marginRight: '10px', marginTop: '10px' }}>
                Set Dormant
              </button>
            )}
            {state.building.state === 'dormant' && (
              <>
                <div style={{ marginTop: '10px' }}>
                  Recommission Cost: {calculateRecommissionCost(state.building)} Energy
                </div>
                <button onClick={recommissionAction} style={{ marginRight: '10px', marginTop: '10px' }}>
                  Recommission
                </button>
              </>
            )}
            {state.building.state !== 'demolished' && (
              <button onClick={demolishAction} style={{ marginRight: '10px', marginTop: '10px' }}>
                Demolish
              </button>
            )}
          </>
        ) : (
          <div>
            <div>No building constructed</div>
            <button onClick={buildHarvesterAction} style={{ marginTop: '10px' }}>
              Build Harvester (Cost: {PHASE0_ECONOMY_CONSTANTS.energy.buildingConstructionCost} Energy)
            </button>
          </div>
        )}
      </section>

      {/* Crises Section */}
      <section style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '10px' }}>
        <h2>Active Crises</h2>
        {state.crises.length === 0 ? (
          <div>No crises detected</div>
        ) : (
          <div>
            {state.crises.map((crisis, idx) => (
              <div key={crisis.id} style={{ marginBottom: '10px', padding: '5px', backgroundColor: '#fff0f0' }}>
                <div>Position: ({crisis.x}, {crisis.y})</div>
                <div>Type: {crisis.type}</div>
                <div>Status: {crisis.status}</div>
                <div>Detected at tick: {crisis.tick}</div>
                <div>Toxicity: {state.world.getCell(crisis.x, crisis.y).toxicity.toFixed(2)}</div>
                {crisis.status === 'active' && (
                  <button
                    onClick={() => respondToCrisisAction(idx)}
                    style={{ marginTop: '5px' }}
                  >
                    Respond (Tier 1) - Cost: {PHASE0_ECONOMY_CONSTANTS.energy.tier1ResponseCost} Energy
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Equilibrium Section */}
      <section style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '10px' }}>
        <h2>Equilibrium Progress</h2>
        <div>
          {(() => {
            const progress = state.equilibrium.getProgress();
            return (
              <>
                <div>Streak Length: {progress.streakLength} / 2000</div>
                <div>All Conditions Met: {progress.allConditionsMet ? 'Yes' : 'No'}</div>
                <div>Ready for Completion: {progress.readyForCompletion ? 'Yes' : 'No'}</div>
              </>
            );
          })()}
        </div>
      </section>

      {/* Simulation Control */}
      <section style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '10px' }}>
        <h2>Simulation Control</h2>
        <div>Current Tick: {state.tick}</div>
        <button onClick={tickSimulation} style={{ marginTop: '10px' }}>
          Tick (→)
        </button>
      </section>
    </div>
  );
}
