import { useEffect, useRef } from 'react';
import type { PrototypeWorldSnapshot } from './worldSnapshot';
import type { SelectedLocation } from './worldViewModel';
import { locationFromMapPoint } from './worldViewModel';

const BIOME_COLORS: Record<string, string> = {
  ocean: '#398e9e',
  desert: '#c7a65a',
  grassland: '#70a85a',
  forest: '#356b42',
  wetland: '#5d8f7d',
  tundra: '#a8b7ad',
  mountain: '#77776f',
};

interface PrototypeMapProps {
  snapshot: PrototypeWorldSnapshot;
  selected: SelectedLocation;
  onSelect: (location: SelectedLocation) => void;
}

export default function PrototypeMap({ snapshot, selected, onSelect }: PrototypeMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const image = context.createImageData(snapshot.world.width, snapshot.world.height);
    snapshot.world.cells.forEach((cell, index) => {
      const color = BIOME_COLORS[cell.biome] ?? '#777777';
      image.data[index * 4] = Number.parseInt(color.slice(1, 3), 16);
      image.data[index * 4 + 1] = Number.parseInt(color.slice(3, 5), 16);
      image.data[index * 4 + 2] = Number.parseInt(color.slice(5, 7), 16);
      image.data[index * 4 + 3] = 255;
    });
    context.putImageData(image, 0, 0);
    context.strokeStyle = '#ffe08a';
    context.lineWidth = 1;
    context.strokeRect(selected.x - 1, selected.y - 1, 3, 3);
  }, [selected, snapshot]);

  const selectFromPointer = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSelect(locationFromMapPoint(
      clientX,
      clientY,
      canvas.getBoundingClientRect(),
      snapshot.world.width,
      snapshot.world.height,
    ));
  };

  const moveWithKeyboard = (key: string) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const move = moves[key];
    if (!move) return false;
    onSelect({
      x: Math.max(0, Math.min(snapshot.world.width - 1, selected.x + move[0])),
      y: Math.max(0, Math.min(snapshot.world.height - 1, selected.y + move[1])),
    });
    return true;
  };

  return (
    <div className="prototype-map">
      <div className="prototype-map__canvas-wrap">
        <canvas
          ref={canvasRef}
          className="prototype-map__canvas"
          width={snapshot.world.width}
          height={snapshot.world.height}
          role="img"
          tabIndex={0}
          aria-label={`2D world navigator. Selected tile ${selected.x}, ${selected.y}. Use arrow keys to move.`}
          onClick={(event) => selectFromPointer(event.clientX, event.clientY)}
          onKeyDown={(event) => {
            if (moveWithKeyboard(event.key)) event.preventDefault();
          }}
        />
      </div>
      <p className="prototype-map__hint">Click, tap, or use arrow keys to select a tile.</p>
    </div>
  );
}
