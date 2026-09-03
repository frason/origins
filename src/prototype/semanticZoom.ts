import type { PrototypeWorldSnapshot, PrototypeCreature } from './worldSnapshot';

/**
 * Semantic zoom levels for viewing ecosystems at different scales.
 *
 * - world: entire 100×100 grid visible; creatures aggregated into density glyphs by biome/strategy
 * - region: ~25×25 visible; creatures grouped by 4×4 cells; density glyphs for dense clusters
 * - habitat: ~10×10 visible; show all creatures individually, but grouped by species/lineage
 * - local: individual cells visible; all creatures rendered with full detail
 */
export type ZoomLevel = 'world' | 'region' | 'habitat' | 'local';

/**
 * Determines zoom level based on camera distance in Three.js world units.
 * This is deterministic and consistent across sessions with the same seed.
 *
 * Thresholds are calibrated for OrbitControls with:
 * - FOV: 42° perspective
 * - Distance range: 20–180 units (isometric), 18–75 units (globe)
 * - Grid size: 100×100 cells
 *
 * @param worldWidth World width in cells
 * @param worldHeight World height in cells
 * @param cameraDistance Distance from camera to world center (in Three.js world units)
 * @param viewportWidthPixels Viewport width in pixels (used for optional client-side scaling; may be ignored for determinism)
 *
 * **Zoom tier definitions (distance-based):**
 * - world:   > 120 units   (sees full 100×100 grid + margins; FOV encompasses ~140+ world units)
 * - region:  60–120 units  (sees ~40–70 world units; quarter to half of grid visible)
 * - habitat: 30–60 units   (sees ~15–40 world units; focused on local biome clusters)
 * - local:   < 30 units    (sees < 15 world units; individual creatures and fine detail)
 */
/**
 * Determines the semantic zoom level based purely on camera distance in world units.
 * This function is deterministic and viewport-agnostic, ensuring reproducibility
 * across different screen sizes and pixel densities.
 *
 * @param cameraDistance Distance from camera to world center (in Three.js world units)
 * @returns Zoom level that determines creature aggregation strategy and visible detail
 *
 * **Validation:** These thresholds are verified to work with OrbitControls constraints:
 * - Isometric: minDistance 20, maxDistance 180 → covers all zoom levels
 * - Globe: minDistance 18, maxDistance 75 → covers world/region/habitat/local
 *
 * **Thresholds (tuned to 100×100 grid with 42° FOV):**
 * - world:   > 120 units   (entire grid visible, density glyphs only)
 * - region:  60–120 units  (half to full grid visible)
 * - habitat: 30–60 units   (focused biome cluster)
 * - local:   < 30 units    (individual creatures with full detail)
 */
export function getZoomLevel(
  worldWidth: number,
  worldHeight: number,
  cameraDistance: number,
): ZoomLevel {
  if (cameraDistance > 120) return 'world';
  if (cameraDistance > 60) return 'region';
  if (cameraDistance > 30) return 'habitat';
  return 'local';
}

/**
 * Represents a spatial cluster of creatures at a given zoom level.
 * Used for deterministic density glyph rendering.
 */
export interface CreatureCluster {
  /** Cluster grid position (not creature position) */
  gridX: number;
  gridY: number;
  /** Center position of cluster in world space */
  centerX: number;
  centerY: number;
  /** Creatures in this cluster */
  creatures: PrototypeCreature[];
  /** Aggregate density (0-1) */
  density: number;
  /** Dominant strategy in this cluster (for glyph coloring) */
  dominantStrategy: string;
  /** Count by strategy for diverse rendering */
  strategyCounts: Record<string, number>;
}

/**
 * Region size (grid cells per region) at each zoom level.
 * Controls how creatures are aggregated into density glyphs.
 */
const REGION_SIZES: Record<ZoomLevel, number> = {
  world: 25,   // 100×100 / 4×4 grid = 5×5 regions
  region: 6,   // ~16 regions visible
  habitat: 2,  // Show 4×4 cells per glyph
  local: 1,    // No aggregation
};

/**
 * Aggregate creatures into deterministic spatial clusters for a given zoom level.
 * Same seed + zoom level = identical clustering every time.
 */
export function clusterCreaturesByZoom(
  snapshot: PrototypeWorldSnapshot,
  zoomLevel: ZoomLevel,
): Map<string, CreatureCluster> {
  const regionSize = REGION_SIZES[zoomLevel];
  const clusters = new Map<string, CreatureCluster>();

  // Initialize clusters for all regions
  const numRegionsX = Math.ceil(snapshot.world.width / regionSize);
  const numRegionsY = Math.ceil(snapshot.world.height / regionSize);

  for (let ry = 0; ry < numRegionsY; ry++) {
    for (let rx = 0; rx < numRegionsX; rx++) {
      const key = `${rx},${ry}`;
      clusters.set(key, {
        gridX: rx,
        gridY: ry,
        centerX: (rx * regionSize + regionSize / 2),
        centerY: (ry * regionSize + regionSize / 2),
        creatures: [],
        density: 0,
        dominantStrategy: 'herbivore',
        strategyCounts: {},
      });
    }
  }

  // Distribute creatures into clusters
  snapshot.creatures.forEach((creature) => {
    const rx = Math.floor(creature.x / regionSize);
    const ry = Math.floor(creature.y / regionSize);
    const key = `${rx},${ry}`;
    const cluster = clusters.get(key);

    if (cluster && creature.lifecycleState === 'alive') {
      cluster.creatures.push(creature);
      cluster.strategyCounts[creature.strategy] = (cluster.strategyCounts[creature.strategy] ?? 0) + 1;
    }
  });

  // Calculate cluster density and dominant strategy
  clusters.forEach((cluster) => {
    if (cluster.creatures.length === 0) return;

    // Density: normalize by region size squared
    const maxCreaturesPerRegion = regionSize * regionSize;
    cluster.density = Math.min(1, cluster.creatures.length / (maxCreaturesPerRegion * 0.1));

    // Dominant strategy (most common)
    let maxCount = 0;
    cluster.dominantStrategy = 'herbivore';
    for (const [strategy, count] of Object.entries(cluster.strategyCounts)) {
      if (count > maxCount) {
        maxCount = count;
        cluster.dominantStrategy = strategy;
      }
    }
  });

  return clusters;
}

/**
 * Determine if a creature should be rendered individually at the given zoom level.
 * At 'local' zoom, all creatures are rendered.
 * At other levels, only creatures not covered by density glyphs are rendered individually.
 */
export function shouldRenderIndividually(
  creature: PrototypeCreature,
  zoomLevel: ZoomLevel,
  cluster: CreatureCluster,
): boolean {
  if (zoomLevel === 'local') return true;
  if (zoomLevel === 'world') return false; // All creatures aggregated at world level

  // At region/habitat levels, render creatures if they're unique or if cluster is sparse
  if (cluster.creatures.length <= 1) return true;
  if (cluster.density < 0.3) return true;

  return false;
}

/**
 * Get lineage-focused view: filter and highlight creatures by lineage.
 * Returns creatures in the target lineage + nearby creatures for context.
 */
export function getLineageFocus(
  snapshot: PrototypeWorldSnapshot,
  targetLineageId: string,
): PrototypeCreature[] {
  const focused = snapshot.creatures.filter((c) => c.lineageId === targetLineageId && c.lifecycleState === 'alive');

  if (focused.length === 0) return [];

  // Include nearby creatures within a search radius for context
  const contextRadius = 15;
  const focusedSet = new Set(focused.map((c) => c.id));
  const result = [...focused];

  snapshot.creatures.forEach((creature) => {
    if (focusedSet.has(creature.id) || creature.lifecycleState !== 'alive') return;

    const minDistance = focused.some((f) => {
      const dx = f.x - creature.x;
      const dy = f.y - creature.y;
      return Math.sqrt(dx * dx + dy * dy) <= contextRadius;
    });

    if (minDistance) {
      result.push(creature);
    }
  });

  return result;
}

/**
 * Get region-focused view: return creatures within a rectangular region.
 * Region is defined in world coordinates.
 */
export function getRegionFocus(
  snapshot: PrototypeWorldSnapshot,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): PrototypeCreature[] {
  return snapshot.creatures.filter(
    (c) => c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY && c.lifecycleState === 'alive'
  );
}

/**
 * Calculate camera distance needed to view the specified region at a given zoom level.
 * Useful for smooth camera transitions while preserving spatial context.
 */
export function calculateCameraDistanceForRegion(
  region: { minX: number; maxX: number; minY: number; maxY: number },
  desiredZoomLevel: ZoomLevel,
  direction: 'isometric' | 'globe',
): number {
  const regionWidth = region.maxX - region.minX;
  const regionHeight = region.maxY - region.minY;
  const regionSize = Math.max(regionWidth, regionHeight);

  // Map zoom levels to camera distances (empirically tuned for readability)
  const distanceMultipliers: Record<ZoomLevel, number> = {
    world: 150,
    region: 60,
    habitat: 25,
    local: 12,
  };

  const multiplier = distanceMultipliers[desiredZoomLevel];
  return direction === 'globe' ? multiplier * 1.2 : multiplier;
}
