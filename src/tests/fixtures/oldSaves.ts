/**
 * Migration test fixtures: pre-#263 save formats (missing hydrology fields)
 * These represent old save files that should load with deterministic defaults
 */

/**
 * Small 30x30 world with basic pre-#263 fields
 */
export const oldSaveSmall30x30 = {
  width: 30,
  height: 30,
  cells: Array.from({ length: 30 * 30 }, (_, idx) => ({
    // Pre-#263 fields only
    energy: 10 + (idx % 5) * 2,
    nutrients: 0,
    producerBiomass: 0,
    toxicity: 0,
    elevation: 0.5,
    moisture: 0.4 + (idx % 7) * 0.05,
    temperature: 0.5,
    biome: 'grassland' as const,
    producerArchetype: 'ground-cover' as const,
    // Missing: substrate, waterDepth, waterTable, dissolvedNutrients, salinity
  })),
};

/**
 * Medium 40x40 world for simulation testing
 */
export const oldSaveMedium40x40 = {
  width: 40,
  height: 40,
  cells: Array.from({ length: 40 * 40 }, (_, idx) => ({
    energy: 15,
    nutrients: 0,
    producerBiomass: 0,
    toxicity: 0,
    elevation: 0.5,
    moisture: 0.5,
    temperature: 0.5,
    biome: 'grassland' as const,
    producerArchetype: 'ground-cover' as const,
    // Intentionally omitting hydrology fields
  })),
};
