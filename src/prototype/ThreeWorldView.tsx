import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PrototypeWorldSnapshot } from './worldSnapshot';
import {
  globePosition,
  isometricPosition,
  type PrototypeDirection,
  type SelectedLocation,
} from './worldViewModel';

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
}

export default function ThreeWorldView({
  direction,
  snapshot,
  selected,
  onSelect,
  onMetrics,
  focusNonce,
}: ThreeWorldViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    const buildStarted = performance.now();
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x151a1d);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.screenSpacePanning = direction === 'isometric';
    controls.minDistance = direction === 'globe' ? 18 : 20;
    controls.maxDistance = direction === 'globe' ? 75 : 180;

    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 0.95, 24),
      new THREE.MeshBasicMaterial({ color: 0xffdd73, side: THREE.DoubleSide }),
    );
    markerRef.current = marker;
    scene.add(marker);

    let cellMesh: THREE.InstancedMesh;
    const dummy = new THREE.Object3D();
    const cellColor = new THREE.Color();
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
        cellMesh.setColorAt(index, cellColor.setHex(BIOME_COLORS[cell.biome] ?? 0x777777));
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
        cellMesh.setColorAt(index, cellColor.setHex(BIOME_COLORS[cell.biome] ?? 0x777777));
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

    const organismGeometry = new THREE.SphereGeometry(direction === 'globe' ? 0.22 : 0.55, 8, 6);
    const organismMaterial = new THREE.MeshBasicMaterial({ color: 0xffe089 });
    snapshot.creatures.forEach((creature) => {
      const organism = new THREE.Mesh(organismGeometry, organismMaterial);
      const position = direction === 'globe'
        ? globePosition(creature, snapshot.world.width, snapshot.world.height, 12.8)
        : isometricPosition(creature, snapshot.world.width, snapshot.world.height);
      organism.position.set(position[0], direction === 'globe' ? position[1] : 3.1, position[2]);
      scene.add(organism);
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const selectFromCanvas = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
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
      controls.update();
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerup', selectFromCanvas);
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
  }, [direction, snapshot, onMetrics, onSelect]);

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

  return (
    <div
      ref={hostRef}
      className="prototype-three-view"
      data-direction={direction}
      data-selected-tile={`${selected.x},${selected.y}`}
      aria-label={`${direction === 'isometric' ? 'Isometric' : 'Globe'} Three.js view of the frozen world`}
    />
  );
}
