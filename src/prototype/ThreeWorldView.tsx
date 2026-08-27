import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PrototypeWorldSnapshot } from './worldSnapshot';
import {
  cellAt,
  creatureVisual,
  globePosition,
  isometricPosition,
  normalizedLayer,
  type PrototypeDirection,
  type SelectedLocation,
  type FocusState,
} from './worldViewModel';
import { PerformanceMonitor, prefersReducedMotion } from '../ui/performanceBudgets';
import type { OverlayKey } from '../ui/ThreeWorldLegend';
import Canvas2DFallback from './Canvas2DFallback';
import {
  getZoomLevel,
  clusterCreaturesByZoom,
  shouldRenderIndividually,
  getLineageFocus,
  getRegionFocus,
  type ZoomLevel,
  type CreatureCluster,
} from './semanticZoom';
import { createDensityGlyph, createSparseGlyph } from './densityGlyph';

const BIOME_COLORS: Record<string, number> = {
  ocean: 0x398e9e,
  desert: 0xc7a65a,
  grassland: 0x70a85a,
  forest: 0x356b42,
  wetland: 0x5d8f7d,
  tundra: 0xa8b7ad,
  mountain: 0x77776f,
};

interface ThreeWorldViewProps {
  direction: PrototypeDirection;
  snapshot: PrototypeWorldSnapshot;
  selected: SelectedLocation;
  onSelect: (location: SelectedLocation) => void;
  onMetrics: (
    direction: PrototypeDirection,
    metrics: { buildMs: number; drawCalls: number; triangles: number },
  ) => void;
  focusNonce: number;
  activeOverlays?: Set<OverlayKey>;
  onOverlayToggle?: (key: OverlayKey) => void;
  useFallbackRender?: boolean;
  onFallback?: (enabled: boolean) => void;
}

export default function ThreeWorldView({
  direction,
  snapshot,
  selected,
  onSelect,
  onMetrics,
  focusNonce,
  activeOverlays = new Set(['biomass', 'toxicity']),
  onOverlayToggle,
  useFallbackRender = false,
  onFallback,
}: ThreeWorldViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<THREE.Mesh | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const performanceMonitorRef = useRef(new PerformanceMonitor());
  const [isContextLost, setIsContextLost] = useState(false);
  const lastFrameTimeRef = useRef<number>(0);

  // Semantic zoom state management
  const [focus, setFocus] = useState<FocusState>({ zoom: 'world' });
  const cameraDistanceRef = useRef<number>(78); // Start at world view distance
  const lastZoomLevelRef = useRef<ZoomLevel | null>(null); // Track zoom changes
  const sceneRef = useRef<THREE.Scene | null>(null);
  const creatureGroupRef = useRef<THREE.Group | null>(null); // Container for dynamic creatures/glyphs

  // Semantic zoom controls
  const resetFocus = useCallback(() => {
    setFocus({ zoom: 'world' });
  }, []);

  const focusLineage = useCallback((lineageId: string) => {
    setFocus({
      zoom: 'habitat',
      lineageId,
    });
  }, []);

  const zoomToRegion = useCallback((minX: number, maxX: number, minY: number, maxY: number) => {
    setFocus({
      zoom: 'habitat',
      regionMinX: minX,
      regionMaxX: maxX,
      regionMinY: minY,
      regionMaxY: maxY,
    });
  }, []);

  // Keyboard navigation support
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!hostRef.current) return;
    const key = event.key.toLowerCase();

    // Arrow keys for tile selection (accessibility)
    const step = 5;
    let newX = selected.x;
    let newY = selected.y;
    let handled = false;

    if (key === 'arrowup') {
      newY = Math.max(0, selected.y - step);
      handled = true;
    } else if (key === 'arrowdown') {
      newY = Math.min(snapshot.world.height - 1, selected.y + step);
      handled = true;
    } else if (key === 'arrowleft') {
      newX = Math.max(0, selected.x - step);
      handled = true;
    } else if (key === 'arrowright') {
      newX = Math.min(snapshot.world.width - 1, selected.x + step);
      handled = true;
    } else if (key === 'home') {
      newX = 0;
      newY = 0;
      handled = true;
    } else if (key === 'end') {
      newX = snapshot.world.width - 1;
      newY = snapshot.world.height - 1;
      handled = true;
    } else if (key === 'escape') {
      hostRef.current?.blur();
      handled = true;
    } else if (key === 'r') {
      // 'R' key to reset focus
      resetFocus();
      handled = true;
    }

    if (handled) {
      event.preventDefault();
      onSelect({ x: newX, y: newY });
    }
  }, [selected, snapshot.world.width, snapshot.world.height, onSelect, resetFocus]);

  // Touch/pointer support
  const handleTouchStart = useCallback((event: TouchEvent) => {
    // OrbitControls handles touch events automatically
    // This handler is here for any custom touch logic if needed
    if (event.touches.length >= 2) {
      // Multi-touch gesture detected
      performanceMonitorRef.current.recordContextRecovery(); // Track interaction
    }
  }, []);

  const handleContextLoss = useCallback(() => {
    console.warn('[Three.js] WebGL context lost. Activating 2D fallback.');
    setIsContextLost(true);
    onFallback?.(true);
  }, [onFallback]);

  const handleContextRestore = useCallback(() => {
    console.log('[Three.js] WebGL context restored.');
    performanceMonitorRef.current.recordContextRecovery();
    setIsContextLost(false);
    onFallback?.(false);
  }, [onFallback]);

  // Render Canvas 2D fallback if WebGL is unavailable or requested
  if (useFallbackRender) {
    return (
      <Canvas2DFallback
        snapshot={snapshot}
        selected={selected}
        onSelect={onSelect}
        activeOverlays={activeOverlays}
        focus={focus}
        onFocusLineage={focusLineage}
      />
    );
  }

  useEffect(() => {
    const buildStarted = performance.now();
    const host = hostRef.current;
    if (!host) return;

    // Define keyboard handler outside try block so it's accessible in cleanup
    const handleKeyboardNav = (event: KeyboardEvent) => handleKeyDown(event);

    try {
      const scene = new THREE.Scene();
      sceneRef.current = scene;
      scene.background = new THREE.Color(0x151a1d);
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);

      // Create a group container for creatures and glyphs that will be updated on zoom changes
      const creatureGroup = new THREE.Group();
      creatureGroupRef.current = creatureGroup;
      scene.add(creatureGroup);
      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      rendererRef.current = renderer;

      // Respect user's reduced motion preference
      const reducedMotion = prefersReducedMotion();

      // Setup WebGL context loss/restore handlers
      renderer.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        handleContextLoss();
      });
      renderer.domElement.addEventListener('webglcontextrestored', handleContextRestore);

      host.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = !reducedMotion;
      controls.dampingFactor = 0.05;
      controls.screenSpacePanning = direction === 'isometric';
      controls.minDistance = direction === 'globe' ? 18 : 20;
      controls.maxDistance = direction === 'globe' ? 75 : 180;
      controls.autoRotate = false; // Don't auto-rotate; let player control

      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.65, 0.95, 24),
        new THREE.MeshBasicMaterial({ color: 0xffdd73, side: THREE.DoubleSide }),
      );
      markerRef.current = marker;
      scene.add(marker);

      // Register keyboard navigation handler
      host.addEventListener('keydown', handleKeyboardNav);

      // Register touch handler
      host.addEventListener('touchstart', handleTouchStart as any);

      let cellMesh: THREE.InstancedMesh;
      const dummy = new THREE.Object3D();
      const cellColor = new THREE.Color();
      const biomassColor = new THREE.Color(0xb6d967);
      const energyColor = new THREE.Color(0xffed4e);
      const mutationColor = new THREE.Color(0xffd659);

      // Compute overlay data
      const maximumBiomass = Math.max(
        ...snapshot.world.cells.map((cell) => cell.producerBiomass),
        1,
      );
      const maximumEnergy = Math.max(
        ...snapshot.world.cells.map((cell) => cell.energy),
        1,
      );
      const toxicCells = snapshot.world.cells.filter((cell) => cell.toxicity > 0.01);
      const maximumToxicity = Math.max(...toxicCells.map((cell) => cell.toxicity), 1);

      // Compute mutation pressure grid (miasma) for corpses
      const computeOverlayStart = performance.now();
      const miasmaPressure = new Float32Array(snapshot.world.width * snapshot.world.height);
      if (activeOverlays.has('mutation-pressure')) {
        const corpses = snapshot.creatures.filter((c) => c.lifecycleState !== 'alive');
        corpses.forEach((corpse) => {
          for (let y = 0; y < snapshot.world.height; y++) {
            for (let x = 0; x < snapshot.world.width; x++) {
              const dx = x - corpse.x;
              const dy = y - corpse.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 3) {
                const idx = y * snapshot.world.width + x;
                miasmaPressure[idx] = Math.max(miasmaPressure[idx], 1 - dist / 3);
              }
            }
          }
        });
      }
      const overlayComputeTime = performance.now() - computeOverlayStart;
      performanceMonitorRef.current.recordOverlayComputeTime(overlayComputeTime);

      if (direction === 'isometric') {
        const geometry = new THREE.BoxGeometry(0.94, 1, 0.94);
        cellMesh = new THREE.InstancedMesh(
          geometry,
          new THREE.MeshLambertMaterial(),
          snapshot.world.cells.length,
        );
        snapshot.world.cells.forEach((cell, index) => {
          const height = 0.15 + cell.elevation * 2.4;
          dummy.position.set(
            cell.x - snapshot.world.width / 2,
            height / 2,
            cell.y - snapshot.world.height / 2,
          );
          dummy.scale.set(1, height, 1);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          cellMesh.setMatrixAt(index, dummy.matrix);

          // Base biome color
          let baseColor = BIOME_COLORS[cell.biome] ?? 0x777777;
          cellColor.setHex(baseColor);

          // Apply overlays based on active set
          if (activeOverlays.has('biomass')) {
            cellColor.lerp(biomassColor, normalizedLayer(cell.producerBiomass, maximumBiomass) * 0.32);
          }
          if (activeOverlays.has('energy')) {
            cellColor.lerp(energyColor, normalizedLayer(cell.energy, maximumEnergy) * 0.25);
          }
          if (activeOverlays.has('mutation-pressure')) {
            cellColor.lerp(mutationColor, miasmaPressure[index] * 0.2);
          }

          cellMesh.setColorAt(index, cellColor);
        });
        camera.position.set(78, 72, 78);
        controls.target.set(0, 0, 0);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.6));
        const position = isometricPosition(selected, snapshot.world.width, snapshot.world.height);
        marker.position.set(position[0], 3.2, position[2]);
        marker.rotation.x = -Math.PI / 2;
      } else {
        const radius = 12;
        scene.add(new THREE.Mesh(
          new THREE.SphereGeometry(radius - 0.18, 48, 32),
          new THREE.MeshLambertMaterial({ color: 0x27383b }),
        ));
        const geometry = new THREE.BoxGeometry(0.72, 0.36, 0.38);
        cellMesh = new THREE.InstancedMesh(
          geometry,
          new THREE.MeshLambertMaterial(),
          snapshot.world.cells.length,
        );
        snapshot.world.cells.forEach((cell, index) => {
          const position = globePosition(cell, snapshot.world.width, snapshot.world.height, radius + cell.elevation * 0.45);
          dummy.position.set(...position);
          dummy.lookAt(0, 0, 0);
          dummy.rotateX(Math.PI);
          dummy.updateMatrix();
          cellMesh.setMatrixAt(index, dummy.matrix);

          // Base biome color
          let baseColor = BIOME_COLORS[cell.biome] ?? 0x777777;
          cellColor.setHex(baseColor);

          // Apply overlays based on active set
          if (activeOverlays.has('biomass')) {
            cellColor.lerp(biomassColor, normalizedLayer(cell.producerBiomass, maximumBiomass) * 0.32);
          }
          if (activeOverlays.has('energy')) {
            cellColor.lerp(energyColor, normalizedLayer(cell.energy, maximumEnergy) * 0.25);
          }
          if (activeOverlays.has('mutation-pressure')) {
            cellColor.lerp(mutationColor, miasmaPressure[index] * 0.2);
          }

          cellMesh.setColorAt(index, cellColor);
        });
        camera.position.set(0, 8, 31);
        controls.target.set(0, 0, 0);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x172129, 3));
        const position = globePosition(selected, snapshot.world.width, snapshot.world.height, radius + 0.8);
        marker.position.set(...position);
        marker.lookAt(0, 0, 0);
      }
      cellMesh.instanceMatrix.needsUpdate = true;
      if (cellMesh.instanceColor) cellMesh.instanceColor.needsUpdate = true;
      scene.add(cellMesh);

      // Toxicity overlay (if enabled)
      if (activeOverlays.has('toxicity') && toxicCells.length > 0) {
        const toxicityMesh = new THREE.InstancedMesh(
          direction === 'globe'
            ? new THREE.BoxGeometry(0.64, 0.3, 0.12)
            : new THREE.BoxGeometry(0.72, 0.06, 0.72),
          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.78,
            depthWrite: false,
          }),
          toxicCells.length,
        );
        toxicCells.forEach((cell, index) => {
          if (direction === 'globe') {
            const position = globePosition(
              cell,
              snapshot.world.width,
              snapshot.world.height,
              12.35 + cell.elevation * 0.45,
            );
            dummy.position.set(...position);
            dummy.scale.set(1, 1, 1);
            dummy.lookAt(0, 0, 0);
            dummy.rotateX(Math.PI);
          } else {
            const surface = 0.15 + cell.elevation * 2.4;
            dummy.position.set(
              cell.x - snapshot.world.width / 2,
              surface + 0.05,
              cell.y - snapshot.world.height / 2,
            );
            dummy.scale.set(1, 1, 1);
            dummy.rotation.set(0, 0, 0);
          }
          dummy.updateMatrix();
          toxicityMesh.setMatrixAt(index, dummy.matrix);
          toxicityMesh.setColorAt(
            index,
            cellColor.setHex(0xdc5b43).lerp(
              new THREE.Color(0xd459b7),
              normalizedLayer(cell.toxicity, maximumToxicity),
            ),
          );
        });
        toxicityMesh.instanceMatrix.needsUpdate = true;
        if (toxicityMesh.instanceColor) toxicityMesh.instanceColor.needsUpdate = true;
        scene.add(toxicityMesh);
      }

      // Corpse overlay (if enabled)
      if (activeOverlays.has('corpse')) {
        const corpses = snapshot.creatures.filter((c) => c.lifecycleState !== 'alive');
        if (corpses.length > 0) {
          const corpseGeometry = direction === 'globe'
            ? new THREE.OctahedronGeometry(0.28, 0)
            : new THREE.OctahedronGeometry(0.68, 0);
          corpses.forEach((corpse) => {
            const organism = new THREE.Mesh(
              corpseGeometry,
              new THREE.MeshBasicMaterial({ color: 0x8b6f55 }),
            );
            const position = direction === 'globe'
              ? globePosition(corpse, snapshot.world.width, snapshot.world.height, 12.8)
              : isometricPosition(corpse, snapshot.world.width, snapshot.world.height);
            organism.position.set(position[0], direction === 'globe' ? position[1] : 0.9, position[2]);
            if (direction === 'isometric') {
              const cell = cellAt(snapshot, corpse);
              if (cell) organism.position.y = 0.9 + 0.15 + cell.elevation * 2.4;
            }
            organism.scale.set(1.15, 0.45, 1.15);
            scene.add(organism);
          });
        }
      }

      // Habitat overlay (if enabled) - enhance biome color visibility
      if (activeOverlays.has('habitat')) {
        // Overlay a tinted plane over each cell to enhance biome visibility
        // This makes biome suitability more obvious via color intensity
        snapshot.world.cells.forEach((cell) => {
          const habitatMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({
              color: BIOME_COLORS[cell.biome],
              transparent: true,
              opacity: 0.15,
              depthWrite: false,
            }),
          );
          const position = direction === 'globe'
            ? globePosition(cell, snapshot.world.width, snapshot.world.height, 12.81)
            : isometricPosition(cell, snapshot.world.width, snapshot.world.height);
          habitatMesh.position.set(
            position[0],
            direction === 'globe' ? position[1] : (0.9 + cell.elevation * 2.4),
            position[2],
          );
          if (direction !== 'globe') {
            habitatMesh.rotation.x = -Math.PI / 2;
          } else {
            habitatMesh.lookAt(0, 0, 0);
          }
          scene.add(habitatMesh);
        });
      }

      // Lineage overlay (if enabled) - highlight creatures in the focused lineage
      if (activeOverlays.has('lineage')) {
        // If a lineage is focused, only highlight that lineage; otherwise show all
        const linageToHighlight = focus.lineageId ? new Set([focus.lineageId]) : undefined;

        snapshot.creatures.forEach((creature) => {
          const visual = creatureVisual(creature);
          if (visual.role === 'corpse') return; // Skip corpses

          // Only highlight if no focused lineage, or if this creature belongs to the focused lineage
          const shouldHighlight = !linageToHighlight || linageToHighlight.has(creature.lineageId);
          if (!shouldHighlight) return;

          // Add a white sphere outline around each highlighted creature
          const outlineGeom = new THREE.SphereGeometry(
            direction === 'globe' ? 0.28 : 0.66,
            8,
            6
          );
          const outlineMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.5,
            side: THREE.BackSide,
            depthWrite: false,
          });
          const outlineMesh = new THREE.Mesh(outlineGeom, outlineMat);
          const position = direction === 'globe'
            ? globePosition(creature, snapshot.world.width, snapshot.world.height, 12.8)
            : isometricPosition(creature, snapshot.world.width, snapshot.world.height);
          const cell = cellAt(snapshot, creature);
          const isometricHeight = 0.9 + (cell ? 0.15 + cell.elevation * 2.4 : 0);
          outlineMesh.position.set(
            position[0],
            direction === 'globe' ? position[1] : isometricHeight,
            position[2],
          );
          scene.add(outlineMesh);
        });
      }


      // Function to rebuild creatures and glyphs when zoom level changes
      const rebuildCreaturesAndGlyphs = (currentZoom: ZoomLevel) => {
        // Clear old creatures/glyphs
        if (creatureGroup.children.length > 0) {
          for (let i = creatureGroup.children.length - 1; i >= 0; i--) {
            const child = creatureGroup.children[i];
            creatureGroup.remove(child);
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((m) => m.dispose());
            } else if (child instanceof THREE.Group) {
              child.traverse((obj) => {
                if (obj instanceof THREE.Mesh) {
                  obj.geometry.dispose();
                  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                  mats.forEach((m) => m.dispose());
                }
              });
            }
          }
        }

        // Recompute clusters and visible creatures
        const clusters = clusterCreaturesByZoom(snapshot, currentZoom);

        // Apply focus filters
        let visibleCreatures = snapshot.creatures;
        if (focus.lineageId) {
          visibleCreatures = getLineageFocus(snapshot, focus.lineageId);
        } else if (focus.regionMinX !== undefined && focus.regionMaxX !== undefined &&
                   focus.regionMinY !== undefined && focus.regionMaxY !== undefined) {
          visibleCreatures = getRegionFocus(
            snapshot,
            focus.regionMinX,
            focus.regionMaxX,
            focus.regionMinY,
            focus.regionMaxY
          );
        }

        // Render density glyphs for dense clusters (world, region, habitat zoom levels)
        if (currentZoom !== 'local') {
          clusters.forEach((cluster) => {
            if (cluster.creatures.length === 0) return;

            // Skip this cluster if focus filtering excludes all its creatures
            const visibleInCluster = cluster.creatures.filter((c) => visibleCreatures.some((vc) => vc.id === c.id));
            if (visibleInCluster.length === 0) return;

            let glyph: THREE.Mesh | THREE.Group | null = null;

            // Sparse clusters get multiple small spheres
            if (cluster.density < 0.15) {
              glyph = createSparseGlyph(cluster, currentZoom, snapshot.world.width, snapshot.world.height, direction, 3);
            } else {
              glyph = createDensityGlyph(cluster, currentZoom, snapshot.world.width, snapshot.world.height, direction);
            }

            if (glyph) {
              creatureGroup.add(glyph);
            }
          });
        }

        // Render living creatures individually (for sparse clusters or local zoom)
        visibleCreatures.forEach((creature) => {
          const visual = creatureVisual(creature);
          // Skip corpses if corpse overlay is not enabled (they're rendered in corpse overlay)
          if (visual.role === 'corpse' && activeOverlays.has('corpse')) return;
          // Only render living creatures here
          if (visual.role !== 'corpse') {
            // Determine if this creature should be rendered individually
            const gridX = Math.floor(creature.x / (currentZoom === 'local' ? 1 : (currentZoom === 'habitat' ? 2 : (currentZoom === 'region' ? 6 : 25))));
            const gridY = Math.floor(creature.y / (currentZoom === 'local' ? 1 : (currentZoom === 'habitat' ? 2 : (currentZoom === 'region' ? 6 : 25))));
            const clusterKey = `${gridX},${gridY}`;
            const cluster = clusters.get(clusterKey);

            // Render individually if: local zoom, or cluster is sparse/single creature
            const shouldRender = currentZoom === 'local' || !cluster || shouldRenderIndividually(creature, currentZoom, cluster);

            if (shouldRender) {
              const organism = new THREE.Mesh(
                new THREE.SphereGeometry(direction === 'globe' ? 0.22 : 0.55, 8, 6),
                new THREE.MeshBasicMaterial({ color: visual.color }),
              );
              const position = direction === 'globe'
                ? globePosition(creature, snapshot.world.width, snapshot.world.height, 12.8)
                : isometricPosition(creature, snapshot.world.width, snapshot.world.height);
              const cell = cellAt(snapshot, creature);
              const isometricHeight = 0.9 + (cell ? 0.15 + cell.elevation * 2.4 : 0);
              organism.position.set(
                position[0],
                direction === 'globe' ? position[1] : isometricHeight,
                position[2],
              );
              // Store creature ID in userData for raycasting
              organism.userData = { creatureId: creature.id, lineageId: creature.lineageId };
              creatureGroup.add(organism);
            }
          }
        });
      };

      // Initial build of creatures and glyphs
      const initialZoom = getZoomLevel(snapshot.world.width, snapshot.world.height, cameraDistanceRef.current);
      lastZoomLevelRef.current = initialZoom;
      rebuildCreaturesAndGlyphs(initialZoom);

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const selectFromCanvas = (event: PointerEvent) => {
        const bounds = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
        pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);

        // Check for creature mesh intersections first (higher priority)
        const creatureMeshArray: THREE.Mesh[] = [];
        creatureGroup.traverse((child) => {
          if (child instanceof THREE.Mesh && child.userData.creatureId) {
            creatureMeshArray.push(child);
          }
        });
        const creatureHits = raycaster.intersectObjects(creatureMeshArray);
        if (creatureHits.length > 0) {
          const hitMesh = creatureHits[0].object as THREE.Mesh;
          if (hitMesh.userData.lineageId) {
            focusLineage(hitMesh.userData.lineageId);
            return;
          }
        }

        // Check for glyph intersections (medium priority)
        const glyphArray: THREE.Object3D[] = [];
        creatureGroup.traverse((child) => {
          if (child !== creatureGroup && !child.userData.creatureId && child instanceof THREE.Mesh) {
            glyphArray.push(child);
          } else if (child instanceof THREE.Group) {
            glyphArray.push(child);
          }
        });
        const glyphHits = raycaster.intersectObjects(glyphArray, true);
        if (glyphHits.length > 0) {
          const hitGlyph = glyphHits[0].object;
          let glyphParent = hitGlyph;
          while (glyphParent.parent && glyphParent.parent !== creatureGroup) {
            glyphParent = glyphParent.parent;
          }
          // Find cluster based on position
          const clusters = clusterCreaturesByZoom(snapshot, lastZoomLevelRef.current || initialZoom);
          for (const cluster of clusters.values()) {
            // Check if click was within cluster bounds
            const creatureInHit = cluster.creatures.find((c) => {
              const pos = direction === 'globe'
                ? globePosition(c, snapshot.world.width, snapshot.world.height, 12.8)
                : isometricPosition(c, snapshot.world.width, snapshot.world.height);
              const dist = Math.sqrt(
                Math.pow(hitGlyph.position.x - pos[0], 2) +
                Math.pow(hitGlyph.position.y - (direction === 'globe' ? pos[1] : hitGlyph.position.y), 2) +
                Math.pow(hitGlyph.position.z - pos[2], 2)
              );
              return dist < 2; // Approximate cluster radius
            });
            if (creatureInHit) {
              const regionSize = [25, 6, 2, 1][['world', 'region', 'habitat', 'local'].indexOf(lastZoomLevelRef.current || initialZoom)];
              zoomToRegion(
                cluster.gridX * regionSize,
                Math.min((cluster.gridX + 1) * regionSize - 1, snapshot.world.width - 1),
                cluster.gridY * regionSize,
                Math.min((cluster.gridY + 1) * regionSize - 1, snapshot.world.height - 1)
              );
              return;
            }
          }
        }

        // Fall back to cell selection (lowest priority)
        const hit = raycaster.intersectObject(cellMesh)[0];
        if (hit?.instanceId === undefined) return;
        const cell = snapshot.world.cells[hit.instanceId];
        onSelect({ x: cell.x, y: cell.y });
      };
      renderer.domElement.addEventListener('pointerup', selectFromCanvas);

      const resize = () => {
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      renderer.render(scene, camera);
      onMetrics(direction, {
        buildMs: performance.now() - buildStarted,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      });

      let frame = 0;
      const render = () => {
        const frameStart = performance.now();
        controls.update();
        // Track camera distance for semantic zoom
        cameraDistanceRef.current = camera.position.length();

        // Recalculate zoom level on every frame and rebuild glyphs/creatures if it changed
        const currentZoom = getZoomLevel(snapshot.world.width, snapshot.world.height, cameraDistanceRef.current);
        if (currentZoom !== lastZoomLevelRef.current) {
          lastZoomLevelRef.current = currentZoom;
          // Clear and rebuild creature/glyph layer
          creatureGroup.clear();
          rebuildCreaturesAndGlyphs(currentZoom);
        }

        renderer.render(scene, camera);
        const frameEnd = performance.now();

        // Record performance metrics
        performanceMonitorRef.current.recordFrameTime(frameEnd - frameStart);
        performanceMonitorRef.current.recordEntityCount(snapshot.creatures.length);
        performanceMonitorRef.current.recordDrawMetrics(
          renderer.info.render.calls,
          renderer.info.render.triangles
        );

        frame = window.requestAnimationFrame(render);
      };
      render();

      return () => {
        window.cancelAnimationFrame(frame);
        observer.disconnect();
        renderer.domElement.removeEventListener('pointerup', selectFromCanvas);
        host.removeEventListener('keydown', handleKeyboardNav);
        host.removeEventListener('touchstart', handleTouchStart as any);
        controls.dispose();
        markerRef.current = null;
        renderer.dispose();
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        });
        renderer.domElement.remove();
      };
    } catch (error) {
      console.error('[Three.js] Failed to initialize WebGL renderer:', error);
      setIsContextLost(true);
      onFallback?.(true);
    }
  }, [direction, snapshot, onMetrics, onSelect, activeOverlays, handleKeyDown, onFallback, focus]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.dataset.selectedTile = `${selected.x},${selected.y}`;
    const marker = markerRef.current;
    if (!marker) return;
    if (direction === 'isometric') {
      const position = isometricPosition(selected, snapshot.world.width, snapshot.world.height);
      marker.position.set(position[0], 3.2, position[2]);
      marker.rotation.set(-Math.PI / 2, 0, 0);
    } else {
      const position = globePosition(selected, snapshot.world.width, snapshot.world.height, 12.8);
      marker.position.set(...position);
      marker.lookAt(0, 0, 0);
    }
  }, [direction, focusNonce, selected, snapshot]);

  if (useFallbackRender) {
    // Render 2D fallback if WebGL is unavailable
    return (
      <Canvas2DFallback
        snapshot={snapshot}
        selected={selected}
        onSelect={onSelect}
        activeOverlays={activeOverlays}
      />
    );
  }

  return (
    <div
      ref={hostRef}
      className="prototype-three-view"
      data-direction={direction}
      data-selected-tile={`${selected.x},${selected.y}`}
      aria-label={`${direction === 'isometric' ? 'Isometric' : 'Globe'} Three.js view of the frozen world`}
      tabIndex={0}
      role="img"
    />
  );
}
