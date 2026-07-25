import type { PrototypeCell, PrototypeWorldSnapshot } from './worldSnapshot';

export type PrototypeDirection = 'isometric' | 'globe';

export interface SelectedLocation {
  x: number;
  y: number;
}

export const cellKey = ({ x, y }: SelectedLocation): string => `${x},${y}`;

export function cellAt(
  snapshot: PrototypeWorldSnapshot,
  location: SelectedLocation,
): PrototypeCell | undefined {
  if (location.x < 0 || location.y < 0 ||
      location.x >= snapshot.world.width || location.y >= snapshot.world.height) {
    return undefined;
  }
  return snapshot.world.cells[location.y * snapshot.world.width + location.x];
}

export function locationFromMapPoint(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  worldWidth: number,
  worldHeight: number,
): SelectedLocation {
  const normalizedX = Math.max(0, Math.min(0.999999, (clientX - bounds.left) / bounds.width));
  const normalizedY = Math.max(0, Math.min(0.999999, (clientY - bounds.top) / bounds.height));
  return {
    x: Math.floor(normalizedX * worldWidth),
    y: Math.floor(normalizedY * worldHeight),
  };
}

export function globePosition(
  location: SelectedLocation,
  worldWidth: number,
  worldHeight: number,
  radius: number,
): [number, number, number] {
  const longitude = ((location.x + 0.5) / worldWidth) * Math.PI * 2 - Math.PI;
  const latitude = Math.PI / 2 - ((location.y + 0.5) / worldHeight) * Math.PI;
  const cosLatitude = Math.cos(latitude);
  return [
    radius * cosLatitude * Math.sin(longitude),
    radius * Math.sin(latitude),
    radius * cosLatitude * Math.cos(longitude),
  ];
}

export function isometricPosition(
  location: SelectedLocation,
  worldWidth: number,
  worldHeight: number,
): [number, number, number] {
  return [
    location.x - worldWidth / 2,
    0,
    location.y - worldHeight / 2,
  ];
}

export function notableEvent(snapshot: PrototypeWorldSnapshot) {
  return [...snapshot.events].reverse().find((event) => event.type === 'mutation')
    ?? snapshot.events[snapshot.events.length - 1];
}
