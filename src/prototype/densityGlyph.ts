import * as THREE from 'three';
import type { CreatureCluster, ZoomLevel } from './semanticZoom';
import type { PrototypeWorldSnapshot } from './worldSnapshot';

/**
 * Renders density glyphs for creature clusters at different zoom levels.
 * A glyph visually represents aggregated population density without drawing every organism.
 */

const CREATURE_COLORS: Record<string, number> = {
  herbivore: 0xffdc73,
  carnivore: 0xe8664a,
  omnivore: 0x6bb8d8,
  scavenger: 0xb58ad6,
};

/**
 * Glyph shape based on cluster diversity and density.
 * Deterministic based on cluster properties.
 */
type GlyphShape = 'sphere' | 'cube' | 'pyramid' | 'torus' | 'sparse';

/**
 * Determine glyph shape based on cluster properties.
 * Same cluster properties = same shape (deterministic).
 */
export function getGlyphShape(cluster: CreatureCluster): GlyphShape {
  const strategyCount = Object.keys(cluster.strategyCounts).length;
  const density = cluster.density;

  // High diversity: torus (mixed strategy)
  if (strategyCount >= 3 && density > 0.6) return 'torus';

  // Very dense: sphere (highly packed)
  if (density > 0.8) return 'sphere';

  // Moderately dense: cube (organized)
  if (density > 0.5) return 'cube';

  // Less dense: pyramid (sparse cluster)
  if (density > 0.2) return 'pyramid';

  // Very sparse: tiny dots
  return 'sparse';
}

/**
 * Create a Three.js mesh for a density glyph.
 * Geometry, size, and color are all deterministic based on cluster.
 */
export function createDensityGlyph(
  cluster: CreatureCluster,
  zoomLevel: ZoomLevel,
  worldWidth: number,
  worldHeight: number,
  direction: 'isometric' | 'globe',
): THREE.Mesh | null {
  if (cluster.creatures.length === 0) return null;

  const shape = getGlyphShape(cluster);
  const color = CREATURE_COLORS[cluster.dominantStrategy] ?? 0xfff0b5;
  const size = getGlyphSize(cluster, zoomLevel);

  let geometry: THREE.BufferGeometry;
  let material: THREE.Material;

  switch (shape) {
    case 'sphere':
      geometry = new THREE.SphereGeometry(size, 12, 8);
      break;
    case 'cube':
      geometry = new THREE.BoxGeometry(size, size, size);
      break;
    case 'pyramid':
      geometry = new THREE.TetrahedronGeometry(size, 0);
      break;
    case 'torus':
      geometry = new THREE.TorusGeometry(size * 0.6, size * 0.2, 8, 12);
      break;
    case 'sparse':
      // Multiple small spheres for sparse clusters
      geometry = new THREE.SphereGeometry(size * 0.3, 6, 4);
      break;
  }

  material = new THREE.MeshPhongMaterial({
    color,
    emissive: new THREE.Color(color).multiplyScalar(0.3),
    shininess: 20,
    wireframe: false,
    transparent: true,
    opacity: 0.8,
  });

  const mesh = new THREE.Mesh(geometry, material);

  // Position glyph at cluster center
  if (direction === 'isometric') {
    mesh.position.set(
      cluster.centerX - worldWidth / 2,
      1.5 + Math.log(cluster.creatures.length + 1) * 0.3,
      cluster.centerY - worldHeight / 2
    );
  } else {
    // Globe positioning: all glyphs at consistent radius from center
    const radius = 12.5;
    const longitude = ((cluster.centerX + 0.5) / worldWidth) * Math.PI * 2 - Math.PI;
    const latitude = Math.PI / 2 - ((cluster.centerY + 0.5) / worldHeight) * Math.PI;
    const cosLatitude = Math.cos(latitude);
    mesh.position.set(
      radius * cosLatitude * Math.sin(longitude),
      radius * Math.sin(latitude),
      radius * cosLatitude * Math.cos(longitude)
    );
    mesh.lookAt(0, 0, 0);
  }

  // Encode cluster metadata in userData for interactive selection
  mesh.userData = {
    isGlyph: true,
    clusterKey: `${cluster.gridX},${cluster.gridY}`,
    creatureCount: cluster.creatures.length,
    density: cluster.density,
    dominantStrategy: cluster.dominantStrategy,
  };

  return mesh;
}

/**
 * Calculate glyph size (in Three.js units) based on cluster properties and zoom level.
 * Size increases with creature count and density for visual feedback.
 */
function getGlyphSize(cluster: CreatureCluster, zoomLevel: ZoomLevel): number {
  // Base size depends on zoom level
  const baseSizes: Record<ZoomLevel, number> = {
    world: 0.8,
    region: 1.2,
    habitat: 1.5,
    local: 2,
  };

  const baseSize = baseSizes[zoomLevel];

  // Modulate by density and creature count
  const densityFactor = 1 + cluster.density * 0.5;
  const countFactor = Math.log(cluster.creatures.length + 1) * 0.3;

  return baseSize * densityFactor * (1 + countFactor);
}

/**
 * Create sparse glyphs (multiple small spheres) for low-density clusters.
 */
export function createSparseGlyph(
  cluster: CreatureCluster,
  zoomLevel: ZoomLevel,
  worldWidth: number,
  worldHeight: number,
  direction: 'isometric' | 'globe',
  count: number = 3,
): THREE.Group {
  const group = new THREE.Group();
  const color = CREATURE_COLORS[cluster.dominantStrategy] ?? 0xfff0b5;
  const baseSize = 0.3;

  const material = new THREE.MeshPhongMaterial({
    color,
    emissive: new THREE.Color(color).multiplyScalar(0.2),
    shininess: 10,
  });

  const geometry = new THREE.SphereGeometry(baseSize, 6, 4);

  // Arrange spheres in a small arc around cluster center
  for (let i = 0; i < Math.min(count, cluster.creatures.length); i++) {
    const mesh = new THREE.Mesh(geometry, material.clone());

    const angle = (i / count) * Math.PI * 2;
    const offset = baseSize * 2;

    if (direction === 'isometric') {
      mesh.position.set(
        cluster.centerX - worldWidth / 2 + Math.cos(angle) * offset,
        1.2,
        cluster.centerY - worldHeight / 2 + Math.sin(angle) * offset
      );
    } else {
      // Globe positioning
      const radius = 12.5;
      const baseAngle = ((cluster.centerX + 0.5) / worldWidth) * Math.PI * 2 - Math.PI;
      const baseLatitude = Math.PI / 2 - ((cluster.centerY + 0.5) / worldHeight) * Math.PI;
      const cosLatitude = Math.cos(baseLatitude);

      mesh.position.set(
        radius * cosLatitude * Math.sin(baseAngle) + Math.cos(angle) * offset * 0.2,
        radius * Math.sin(baseLatitude) + Math.sin(angle) * offset * 0.2,
        radius * cosLatitude * Math.cos(baseAngle)
      );
      mesh.lookAt(0, 0, 0);
    }

    mesh.userData = {
      isGlyph: true,
      isSparseComponent: true,
      clusterKey: `${cluster.gridX},${cluster.gridY}`,
    };

    group.add(mesh);
  }

  return group;
}
