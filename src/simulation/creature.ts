import { Traits } from '../utils/traits';
import { World } from './world';
import { RngFn } from './rng';
import { MAX_ENERGY_MULTIPLIER } from '../utils/constants';
import type { CreatureSpatialIndex } from './creatureSpatialIndex';
import { moveAcrossTerrain, reachableTerrainCells } from './biomeTraversal';

/**
 * Lifecycle states for creatures
 */
export type LifecycleState = 'alive' | 'dead' | 'corpse';

/**
 * Decision types for per-tick creature behavior
 */
export type DecisionType = 'move-to-food' | 'flee' | 'search' | 'idle' | 'eat' | 'reproduce';

/**
 * Parameters for Creature construction (all fields except auto-generated id)
 */
export interface CreatureParams {
  speciesId: string;
  lineageId: string;
  parentId: string | null;
  traits: Traits;
  x: number;
  y: number;
  energy: number;
  age?: number;
  lifecycleState?: LifecycleState;
  corpseDecayTicks?: number;
  lastReproductionAge?: number | null;
  generation?: number;
  incipientSpeciesId?: string | null;
}

/**
 * Individual creature representing a single organism in the simulation.
 * Holds all MVP traits, position, energy, age, and lifecycle state.
 */
export class Creature {
  id: string;
  speciesId: string;
  lineageId: string;
  parentId: string | null;
  traits: Traits;
  x: number;
  y: number;
  energy: number;
  age: number;
  lifecycleState: LifecycleState;
  corpseDecayTicks: number;
  lastReproductionAge: number | null;
  generation: number;
  incipientSpeciesId: string | null;

  private static creatureCounter: number = 0;

  /**
   * Construct a new Creature with the given parameters.
   * Auto-generates a unique id.
   *
   * @param params - CreatureParams with all creature state
   */
  constructor(params: CreatureParams) {
    // Auto-generate unique id using counter-based approach
    this.id = `creature_${Creature.creatureCounter++}`;

    this.speciesId = params.speciesId;
    this.lineageId = params.lineageId;
    this.parentId = params.parentId;
    this.traits = params.traits;
    this.x = params.x;
    this.y = params.y;
    this.energy = params.energy;
    this.age = params.age ?? 0;
    this.lifecycleState = params.lifecycleState ?? 'alive';
    this.corpseDecayTicks = params.corpseDecayTicks ?? 0;
    this.lastReproductionAge = params.lastReproductionAge ?? null;
    this.generation = params.generation ?? 0;
    this.incipientSpeciesId = params.incipientSpeciesId ?? null;
  }

  /**
   * Serialize creature to a JSON-compatible object.
   * Includes all state needed to reconstruct the creature.
   *
   * @returns a snapshot of creature state
   */
  toJSON(): object {
    return {
      id: this.id,
      speciesId: this.speciesId,
      lineageId: this.lineageId,
      parentId: this.parentId,
      traits: { ...this.traits },
      x: this.x,
      y: this.y,
      energy: this.energy,
      age: this.age,
      lifecycleState: this.lifecycleState,
      corpseDecayTicks: this.corpseDecayTicks,
      lastReproductionAge: this.lastReproductionAge,
      generation: this.generation,
      incipientSpeciesId: this.incipientSpeciesId,
    };
  }

  /**
   * Reconstruct a Creature from a JSON snapshot.
   * The snapshot should have been created by toJSON().
   *
   * @param data - JSON object containing creature state
   * @returns reconstructed Creature instance
   * @throws if data format is invalid
   */
  static fromJSON(data: any): Creature {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid creature JSON: expected object');
    }

    const {
      speciesId,
      lineageId,
      parentId,
      traits,
      x,
      y,
      energy,
      age,
      lifecycleState,
      corpseDecayTicks,
      lastReproductionAge,
      generation,
      incipientSpeciesId,
    } = data;

    if (
      typeof speciesId !== 'string' ||
      typeof lineageId !== 'string' ||
      (parentId !== null && typeof parentId !== 'string') ||
      !traits ||
      typeof traits !== 'object' ||
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof energy !== 'number'
    ) {
      throw new Error('Invalid creature JSON: missing or invalid required fields');
    }

    const creature = new Creature({
      speciesId,
      lineageId,
      parentId,
      traits,
      x,
      y,
      energy,
      age,
      lifecycleState,
      corpseDecayTicks,
      lastReproductionAge,
      generation,
      incipientSpeciesId,
    });

    // Restore the original id from serialized data
    if (typeof data.id === 'string') {
      creature.id = data.id;
    }

    return creature;
  }

  /**
   * Reset the internal creature counter.
   * Useful for testing determinism with specific id sequences.
   */
  static resetIdCounter(): void {
    Creature.creatureCounter = 0;
  }

  /**
   * Get the current id counter value.
   * Useful for testing.
   */
  static getIdCounter(): number {
    return Creature.creatureCounter;
  }
}

/**
 * Calculate Chebyshev distance (max of absolute differences) between two points.
 * Used for vision range calculations on a grid.
 *
 * @param x1 - first point x coordinate
 * @param y1 - first point y coordinate
 * @param x2 - second point x coordinate
 * @param y2 - second point y coordinate
 * @returns Chebyshev distance
 */
export function chebyshevDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  return Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
}

/**
 * Scan the environment for nearby creatures and food within vision range.
 * Uses Chebyshev distance (grid-based square radius).
 *
 * Returns nearby threats (predators) and food sources based on creature's traits
 * and energy strategy. Accounts for camouflage when detecting threats.
 *
 * @param creature - the creature doing the scanning
 * @param world - the world grid
 * @param allCreatures - all creatures in the simulation
 * @param rng - deterministic RNG for camouflage checks
 * @returns object with threats, food locations, and food creatures
 */
export interface VisionScan {
  threats: Creature[];
  foodLocations: Array<{ x: number; y: number; biomass: number }>;
  foodCreatures: Creature[];
}

export function scanEnvironment(
  creature: Creature,
  world: World,
  allCreatures: Creature[],
  rng: RngFn,
  spatialIndex?: CreatureSpatialIndex
): VisionScan {
  const threats: Creature[] = [];
  const foodLocations: Array<{ x: number; y: number; biomass: number }> = [];
  const foodCreatures: Creature[] = [];
  const reachable = reachableTerrainCells(
    world,
    creature.x,
    creature.y,
    creature.traits.visionRange,
    creature.traits
  );

  // Scan for other creatures within vision range
  const nearbyCreatures = spatialIndex
    ? spatialIndex.querySquare(creature.x, creature.y, creature.traits.visionRange)
    : allCreatures;
  for (const other of nearbyCreatures) {
    if (other.id === creature.id) {
      continue;
    }

    const distance = chebyshevDistance(creature.x, creature.y, other.x, other.y);

    // Check if within vision range
    if (distance > creature.traits.visionRange) {
      continue;
    }

    if (other.lifecycleState !== 'alive') {
      if (
        creature.traits.energyStrategy === 'omnivore' ||
        creature.traits.energyStrategy === 'scavenger'
      ) {
        if (reachable.has(`${other.x},${other.y}`)) foodCreatures.push(other);
      }
      continue;
    }

    // Determine if this creature is a threat (predator)
    const isThreatsource =
      other.traits.energyStrategy === 'carnivore' ||
      other.traits.energyStrategy === 'omnivore';

    if (isThreatsource) {
      // Predators are always visible to their prey (camouflage doesn't affect threat detection)
      threats.push(other);
    }

    // Determine if this creature is food for the current creature
    const isFood =
      (creature.traits.energyStrategy === 'carnivore' ||
        creature.traits.energyStrategy === 'omnivore') &&
      (other.traits.energyStrategy === 'herbivore' ||
        other.traits.energyStrategy === 'omnivore' ||
        other.traits.energyStrategy === 'scavenger');

    if (isFood) {
      // Prey's camouflage reduces chance of being detected by predator
      if (rng() >= other.traits.camouflage) {
        if (reachable.has(`${other.x},${other.y}`)) foodCreatures.push(other);
      }
    }
  }

  // Scan for producer biomass within vision range (for herbivores and omnivores)
  if (
    creature.traits.energyStrategy === 'herbivore' ||
    creature.traits.energyStrategy === 'omnivore'
  ) {
    const minX = Math.max(0, creature.x - Math.floor(creature.traits.visionRange));
    const maxX = Math.min(
      world.width - 1,
      creature.x + Math.floor(creature.traits.visionRange)
    );
    const minY = Math.max(0, creature.y - Math.floor(creature.traits.visionRange));
    const maxY = Math.min(
      world.height - 1,
      creature.y + Math.floor(creature.traits.visionRange)
    );

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const distance = chebyshevDistance(creature.x, creature.y, x, y);
        if (distance <= creature.traits.visionRange) {
          const cell = world.getCell(x, y);
          if (cell.producerBiomass > 0 && reachable.has(`${x},${y}`)) {
            foodLocations.push({
              x,
              y,
              biomass: cell.producerBiomass,
            });
          }
        }
      }
    }
  }

  return {
    threats,
    foodLocations,
    foodCreatures,
  };
}

/**
 * Decide what action a creature should take this tick.
 * Scans environment and returns the creature's decision.
 *
 * Priority:
 * 1. If threatened by predators, flee
 * 2. If at full energy, idle (no need to eat)
 * 3. If hungry and food is nearby, move toward it
 * 4. If hungry but no food visible, search/explore to find food
 * 5. Otherwise, idle
 *
 * @param creature - the creature making the decision
 * @param world - the world grid
 * @param allCreatures - all creatures in the simulation
 * @param rng - deterministic RNG
 * @returns the decision type
 */
export function decideTick(
  creature: Creature,
  world: World,
  allCreatures: Creature[],
  rng: RngFn,
  spatialIndex?: CreatureSpatialIndex
): DecisionType {
  // Scan environment
  const scan = scanEnvironment(creature, world, allCreatures, rng, spatialIndex);

  // If threatened, flee
  if (scan.threats.length > 0) {
    return 'flee';
  }

  // If at or near maximum energy, idle (no need to eat)
  const MAX_ENERGY = creature.traits.size * MAX_ENERGY_MULTIPLIER;
  if (creature.energy >= MAX_ENERGY) {
    return 'idle';
  }

  // Creature is hungry (below max energy)
  const isHungry = creature.energy < MAX_ENERGY;

  // If there is food nearby, attempt to move toward it
  if (scan.foodLocations.length > 0 || scan.foodCreatures.length > 0) {
    return 'move-to-food';
  }

  // If hungry but no food visible, search for food
  if (isHungry) {
    return 'search';
  }

  // Default: idle
  return 'idle';
}

/**
 * Find the nearest target location (closest food or threat).
 * Uses Chebyshev distance for grid-based navigation.
 *
 * @param fromX - starting x coordinate
 * @param fromY - starting y coordinate
 * @param targets - array of {x, y} target coordinates
 * @returns the nearest target or null if no targets
 */
export function findNearestTarget(
  fromX: number,
  fromY: number,
  targets: Array<{ x: number; y: number }>
): { x: number; y: number } | null {
  if (targets.length === 0) {
    return null;
  }

  let nearest = targets[0];
  let nearestDistance = chebyshevDistance(fromX, fromY, nearest.x, nearest.y);

  for (const target of targets) {
    const distance = chebyshevDistance(fromX, fromY, target.x, target.y);
    if (distance < nearestDistance) {
      nearest = target;
      nearestDistance = distance;
    }
  }

  return nearest;
}

/**
 * Calculate the next step toward a target, moving up to speed cells.
 * Uses grid-based movement (cardinal or diagonal).
 *
 * @param fromX - starting x coordinate
 * @param fromY - starting y coordinate
 * @param toX - target x coordinate
 * @param toY - target y coordinate
 * @param speed - maximum cells to move per tick
 * @returns new {x, y} position
 */
export function calculateNextPosition(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  speed: number
): { x: number; y: number } {
  let x = fromX;
  let y = fromY;

  // Move toward target up to speed cells
  const remainingSpeed = Math.floor(speed);

  for (let i = 0; i < remainingSpeed; i++) {
    // If at target, stop
    if (x === toX && y === toY) {
      break;
    }

    // Move one step closer to target
    const dx = toX > x ? 1 : toX < x ? -1 : 0;
    const dy = toY > y ? 1 : toY < y ? -1 : 0;

    x += dx;
    y += dy;
  }

  return { x, y };
}

const SEARCH_HEADING_DURATION = 6;
const SEARCH_DIRECTIONS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
];

/** Stable heading that changes every few ticks, producing replay-safe roaming. */
export function getSearchTarget(creature: Creature, world: World): { x: number; y: number } {
  const center = { x: Math.floor(world.width / 2), y: Math.floor(world.height / 2) };

  // Recover immediately after reaching an edge rather than spending a heading
  // interval walking into the boundary.
  if (
    creature.x <= 0 ||
    creature.y <= 0 ||
    creature.x >= world.width - 1 ||
    creature.y >= world.height - 1
  ) {
    return center;
  }

  const headingPhase = Math.floor(creature.age / SEARCH_HEADING_DURATION);
  const key = `${creature.id}:${headingPhase}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const direction = SEARCH_DIRECTIONS[(hash >>> 0) % SEARCH_DIRECTIONS.length];
  const distance = Math.max(
    1,
    Math.ceil(creature.traits.visionRange),
    Math.ceil(creature.traits.speed * SEARCH_HEADING_DURATION)
  );
  return {
    x: creature.x + direction.dx * distance,
    y: creature.y + direction.dy * distance,
  };
}

/**
 * Apply movement to a creature based on its decision.
 * Mutates creature's x and y position.
 *
 * Decisions:
 * - 'move-to-food': move toward nearest food (creature or biomass)
 * - 'flee': move away from nearest threat
 * - 'search': move in a direction to explore and find food
 * - 'idle': no movement
 * - 'eat': no movement (handled elsewhere)
 * - 'reproduce': no movement (handled elsewhere)
 *
 * Movement is capped by traits.speed and clamped to world bounds.
 *
 * @param creature - the creature to move (mutated in-place)
 * @param decision - the decision type
 * @param world - the world grid
 * @param allCreatures - all creatures in the simulation
 * @param rng - deterministic RNG
 */
export function applyMovement(
  creature: Creature,
  decision: DecisionType,
  world: World,
  allCreatures: Creature[],
  rng: RngFn,
  spatialIndex?: CreatureSpatialIndex
): void {
  if (decision === 'idle' || decision === 'eat' || decision === 'reproduce') {
    // No movement
    return;
  }

  const scan = scanEnvironment(creature, world, allCreatures, rng, spatialIndex);

  let targetLocation: { x: number; y: number } | null = null;

  if (decision === 'move-to-food') {
    // Combine all food targets
    const allFoodTargets = [
      ...scan.foodLocations,
      ...scan.foodCreatures.map((c) => ({ x: c.x, y: c.y })),
    ];
    targetLocation = findNearestTarget(creature.x, creature.y, allFoodTargets);
  } else if (decision === 'search') {
    targetLocation = getSearchTarget(creature, world);
  } else if (decision === 'flee') {
    // Move away from nearest threat
    if (scan.threats.length > 0) {
      const nearestThreat = findNearestTarget(
        creature.x,
        creature.y,
        scan.threats.map((c) => ({ x: c.x, y: c.y }))
      );

      if (nearestThreat) {
        // Calculate a point away from the threat
        const dx = creature.x - nearestThreat.x;
        const dy = creature.y - nearestThreat.y;

        // Move away (direction opposite to threat)
        const awayX = creature.x + (dx > 0 ? 1 : dx < 0 ? -1 : 0);
        const awayY = creature.y + (dy > 0 ? 1 : dy < 0 ? -1 : 0);

        targetLocation = { x: awayX, y: awayY };
      }
    }
  }

  // Apply movement if we have a target
  if (targetLocation) {
    const previousX = creature.x;
    const previousY = creature.y;
    const nextPos = moveAcrossTerrain(creature, targetLocation, world);

    // Clamp to world bounds
    creature.x = Math.max(0, Math.min(world.width - 1, nextPos.x));
    creature.y = Math.max(0, Math.min(world.height - 1, nextPos.y));
    spatialIndex?.move(creature, previousX, previousY);
  }
}
