/**
 * Natural Disaster System
 *
 * Provides player-triggered environmental events (beneficial and harmful)
 * that modify world state and creature conditions. All disasters are seeded
 * through the RNG system for determinism and replay consistency.
 *
 * Disaster Types:
 * - Beneficial: nutrient-bloom, mild-flood, meteor-seeding
 * - Harmful: drought, cold-snap, wildfire, toxic-vent
 */

import type { World, Cell } from './world';
import type { Creature } from './creature';
import type { RngFn } from './rng';
import type { SimEvent } from './events';

export type NaturalDisasterKind =
  | 'nutrient-bloom'      // Beneficial: boosts nutrients in an area
  | 'mild-flood'          // Beneficial: increases moisture, opens wetland habitat
  | 'meteor-seeding'      // Beneficial: deposits minerals/nutrients
  | 'drought'             // Harmful: reduces moisture and energy
  | 'cold-snap'           // Harmful: lowers temperature, increases energy costs
  | 'wildfire'            // Harmful: reduces producer biomass, increases toxicity
  | 'toxic-vent'          // Harmful: releases toxins
  | 'temperature-spike';  // Harmful: raises temperature rapidly

export type DisasterTone = 'beneficial' | 'harmful';

/**
 * Natural disaster parameters and effects
 */
export interface NaturalDisaster {
  kind: NaturalDisasterKind;
  tone: DisasterTone;
  title: string;
  description: string;
  /** Center of affected region */
  centerX: number;
  centerY: number;
  /** Radius of effect (in tiles) */
  radius: number;
}

/**
 * Result of applying a disaster, including affected creatures and cells
 */
export interface DisasterOutcome {
  disaster: NaturalDisaster;
  affectedCreatures: string[]; // Creature IDs affected
  affectedCells: number; // Number of cells modified
  event: SimEvent;
}

/**
 * Returns disaster metadata for a given kind
 */
export function getDisasterInfo(kind: NaturalDisasterKind): Omit<NaturalDisaster, 'centerX' | 'centerY' | 'radius'> {
  const infos: Record<NaturalDisasterKind, Omit<NaturalDisaster, 'centerX' | 'centerY' | 'radius'>> = {
    'nutrient-bloom': {
      kind: 'nutrient-bloom',
      tone: 'beneficial',
      title: 'Nutrient Bloom',
      description: 'A burst of nutrient-rich water enriches the soil, boosting producer growth and food availability.',
    },
    'mild-flood': {
      kind: 'mild-flood',
      tone: 'beneficial',
      title: 'Mild Flood',
      description: 'Controlled flooding moistens the landscape, opening new wetland habitat and spreading seeds.',
    },
    'meteor-seeding': {
      kind: 'meteor-seeding',
      tone: 'beneficial',
      title: 'Meteor Seeding',
      description: 'A mineral-rich meteor impacts, spreading rare nutrients across the landscape.',
    },
    'drought': {
      kind: 'drought',
      tone: 'harmful',
      title: 'Drought',
      description: 'Prolonged water scarcity desiccates the landscape, stressing herbivores and producers.',
    },
    'cold-snap': {
      kind: 'cold-snap',
      tone: 'harmful',
      title: 'Cold Snap',
      description: 'A sudden temperature drop increases energy costs for all creatures across an affected region.',
    },
    'wildfire': {
      kind: 'wildfire',
      tone: 'harmful',
      title: 'Wildfire',
      description: 'Uncontrolled fire devastates vegetation and leaves toxic ash, killing creatures in the area.',
    },
    'toxic-vent': {
      kind: 'toxic-vent',
      tone: 'harmful',
      title: 'Toxic Vent',
      description: 'A toxic emission contaminates the region, poisoning creatures and inhibiting producer growth.',
    },
    'temperature-spike': {
      kind: 'temperature-spike',
      tone: 'harmful',
      title: 'Temperature Spike',
      description: 'Extreme heat waves stress cold-adapted creatures and increase metabolic costs.',
    },
  };
  return infos[kind];
}

/**
 * Default radius for disasters (tiles)
 */
export const DISASTER_RADIUS = 8;

/**
 * Apply a nutrient bloom disaster to the world
 */
function applyNutrientBloom(
  world: World,
  centerX: number,
  centerY: number,
  radius: number,
  rng: RngFn
): number {
  let affectedCount = 0;
  const nutrientBoost = 50; // Nutrients added per cell

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || x >= world.width || y < 0 || y >= world.height) continue;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;

      // Falloff with distance
      const falloff = 1 - (dist / radius) * 0.3;
      const boost = nutrientBoost * falloff * (0.8 + rng() * 0.4);

      const cell = world.getCell(x, y);
      world.setCell(x, y, {
        nutrients: Math.min(cell.nutrients + boost, 200),
      });
      affectedCount++;
    }
  }

  return affectedCount;
}

/**
 * Apply a mild flood disaster to the world
 */
function applyMildFlood(
  world: World,
  centerX: number,
  centerY: number,
  radius: number,
  rng: RngFn
): number {
  let affectedCount = 0;
  const moistureBoost = 0.25;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || x >= world.width || y < 0 || y >= world.height) continue;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;

      // Falloff with distance
      const falloff = 1 - (dist / radius) * 0.2;
      const boost = moistureBoost * falloff;

      const cell = world.getCell(x, y);
      world.setCell(x, y, {
        moisture: Math.min(cell.moisture + boost, 1),
      });
      affectedCount++;
    }
  }

  return affectedCount;
}

/**
 * Apply a meteor seeding disaster (similar to nutrient bloom but more dramatic)
 */
function applyMeteorSeeding(
  world: World,
  centerX: number,
  centerY: number,
  radius: number,
  rng: RngFn
): number {
  let affectedCount = 0;
  const nutrientBoost = 100; // Much more dramatic than bloom

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || x >= world.width || y < 0 || y >= world.height) continue;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;

      // Steeper falloff for meteor impact
      const falloff = Math.pow(1 - (dist / radius), 1.5);
      const boost = nutrientBoost * falloff * (0.9 + rng() * 0.2);

      const cell = world.getCell(x, y);
      world.setCell(x, y, {
        nutrients: Math.min(cell.nutrients + boost, 250),
      });
      affectedCount++;
    }
  }

  return affectedCount;
}

/**
 * Apply a drought disaster to the world
 */
function applyDrought(
  world: World,
  centerX: number,
  centerY: number,
  radius: number,
  rng: RngFn
): number {
  let affectedCount = 0;
  const moistureReduction = 0.3;
  const energyReduction = 0.15;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || x >= world.width || y < 0 || y >= world.height) continue;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;

      // Falloff with distance
      const falloff = 1 - (dist / radius) * 0.3;

      const cell = world.getCell(x, y);
      world.setCell(x, y, {
        moisture: Math.max(cell.moisture - moistureReduction * falloff, 0),
        energy: Math.max(cell.energy - energyReduction * falloff, 0),
      });
      affectedCount++;
    }
  }

  return affectedCount;
}

/**
 * Apply a cold snap disaster to the world
 */
function applyColdSnap(
  world: World,
  centerX: number,
  centerY: number,
  radius: number,
  rng: RngFn
): number {
  let affectedCount = 0;
  const temperatureDrop = 0.3;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || x >= world.width || y < 0 || y >= world.height) continue;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;

      // Falloff with distance
      const falloff = 1 - (dist / radius) * 0.3;

      const cell = world.getCell(x, y);
      world.setCell(x, y, {
        temperature: Math.max(cell.temperature - temperatureDrop * falloff, 0),
      });
      affectedCount++;
    }
  }

  return affectedCount;
}

/**
 * Apply a wildfire disaster to the world
 */
function applyWildfire(
  world: World,
  centerX: number,
  centerY: number,
  radius: number,
  rng: RngFn
): number {
  let affectedCount = 0;
  const biomassReduction = 0.6;
  const toxicityIncrease = 80;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || x >= world.width || y < 0 || y >= world.height) continue;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;

      // Steeper falloff for fire intensity
      const falloff = Math.pow(1 - (dist / radius), 1.5);

      const cell = world.getCell(x, y);
      world.setCell(x, y, {
        producerBiomass: Math.max(cell.producerBiomass * (1 - biomassReduction * falloff), 0),
        toxicity: Math.min(cell.toxicity + toxicityIncrease * falloff, 100),
      });
      affectedCount++;
    }
  }

  return affectedCount;
}

/**
 * Apply a toxic vent disaster to the world
 */
function applyToxicVent(
  world: World,
  centerX: number,
  centerY: number,
  radius: number,
  rng: RngFn
): number {
  let affectedCount = 0;
  const toxicityIncrease = 100;
  const nutrientReduction = 0.5;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || x >= world.width || y < 0 || y >= world.height) continue;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;

      // Gaussian-like falloff for toxin spread
      const falloff = Math.exp(-Math.pow(dist / radius, 2));

      const cell = world.getCell(x, y);
      world.setCell(x, y, {
        toxicity: Math.min(cell.toxicity + toxicityIncrease * falloff, 100),
        nutrients: Math.max(cell.nutrients - cell.nutrients * nutrientReduction * falloff, 0),
      });
      affectedCount++;
    }
  }

  return affectedCount;
}

/**
 * Apply a temperature spike disaster to the world
 */
function applyTemperatureSpike(
  world: World,
  centerX: number,
  centerY: number,
  radius: number,
  rng: RngFn
): number {
  let affectedCount = 0;
  const temperatureIncrease = 0.4;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || x >= world.width || y < 0 || y >= world.height) continue;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;

      // Falloff with distance
      const falloff = 1 - (dist / radius) * 0.3;

      const cell = world.getCell(x, y);
      world.setCell(x, y, {
        temperature: Math.min(cell.temperature + temperatureIncrease * falloff, 1),
      });
      affectedCount++;
    }
  }

  return affectedCount;
}

/**
 * Apply creature effects of a disaster (direct damage, stress, etc.)
 */
function applyCreatureEffects(
  disaster: NaturalDisaster,
  creatures: Creature[],
  world: World,
  rng: RngFn
): string[] {
  const affectedCreatures: string[] = [];

  for (const creature of creatures) {
    if (creature.lifecycleState !== 'alive') continue;

    const dx = creature.x - disaster.centerX;
    const dy = creature.y - disaster.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > disaster.radius) continue;

    const falloff = Math.max(0, 1 - (dist / disaster.radius) * 0.5);
    affectedCreatures.push(creature.id);

    switch (disaster.kind) {
      case 'wildfire':
        // Direct damage from fire
        creature.energy = Math.max(0, creature.energy - 100 * falloff);
        if (creature.energy === 0) creature.lifecycleState = 'dead';
        break;

      case 'toxic-vent':
        // Toxin exposure
        creature.toxinExposure = Math.min(1, creature.toxinExposure + 0.5 * falloff);
        creature.energy = Math.max(0, creature.energy - 30 * falloff);
        if (creature.energy === 0) creature.lifecycleState = 'dead';
        break;

      case 'cold-snap':
        // Energy cost from cold
        creature.energy = Math.max(0, creature.energy - 40 * falloff);
        if (creature.energy === 0) creature.lifecycleState = 'dead';
        break;

      case 'temperature-spike':
        // Energy cost from heat (similar to cold snap)
        creature.energy = Math.max(0, creature.energy - 35 * falloff);
        if (creature.energy === 0) creature.lifecycleState = 'dead';
        break;

      // Beneficial disasters don't directly harm creatures
      // but they modify the world which affects them indirectly
      case 'nutrient-bloom':
      case 'mild-flood':
      case 'meteor-seeding':
      case 'drought':
        // World state changes handle the effects
        break;
    }
  }

  return affectedCreatures;
}

/**
 * Main disaster application function
 * Applies world and creature effects, returns event for logging
 */
export function applyDisaster(
  disaster: NaturalDisaster,
  world: World,
  creatures: Creature[],
  tick: number,
  rng: RngFn
): DisasterOutcome {
  const affectedCells = applyDisasterToWorld(disaster, world, rng);
  const affectedCreatures = applyCreatureEffects(disaster, creatures, world, rng);

  const info = getDisasterInfo(disaster.kind);
  const event: SimEvent = {
    type: 'environmental-shock',
    tick,
    shockKind: disaster.kind as any,
    affectedRegion: {
      x: disaster.centerX,
      y: disaster.centerY,
      radius: disaster.radius,
    },
    detail: `${info.title} at (${disaster.centerX}, ${disaster.centerY}): affected ${affectedCells} cells, ${affectedCreatures.length} creatures`,
  };

  return {
    disaster,
    affectedCreatures,
    affectedCells,
    event,
  };
}

/**
 * Apply world-level effects of a disaster
 */
function applyDisasterToWorld(
  disaster: NaturalDisaster,
  world: World,
  rng: RngFn
): number {
  switch (disaster.kind) {
    case 'nutrient-bloom':
      return applyNutrientBloom(world, disaster.centerX, disaster.centerY, disaster.radius, rng);
    case 'mild-flood':
      return applyMildFlood(world, disaster.centerX, disaster.centerY, disaster.radius, rng);
    case 'meteor-seeding':
      return applyMeteorSeeding(world, disaster.centerX, disaster.centerY, disaster.radius, rng);
    case 'drought':
      return applyDrought(world, disaster.centerX, disaster.centerY, disaster.radius, rng);
    case 'cold-snap':
      return applyColdSnap(world, disaster.centerX, disaster.centerY, disaster.radius, rng);
    case 'wildfire':
      return applyWildfire(world, disaster.centerX, disaster.centerY, disaster.radius, rng);
    case 'toxic-vent':
      return applyToxicVent(world, disaster.centerX, disaster.centerY, disaster.radius, rng);
    case 'temperature-spike':
      return applyTemperatureSpike(world, disaster.centerX, disaster.centerY, disaster.radius, rng);
    default:
      return 0;
  }
}
