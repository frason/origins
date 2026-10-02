import { useState } from 'react';
import { useStore } from '../state/store';
import type { NaturalDisasterKind } from '../simulation/disasters';
import { getDisasterInfo } from '../simulation/disasters';
import type { DisasterCommand } from '../simulation/disasterCommand';

const DISASTER_KINDS: NaturalDisasterKind[] = [
  // Beneficial
  'nutrient-bloom',
  'mild-flood',
  'meteor-seeding',
  // Harmful
  'drought',
  'cold-snap',
  'wildfire',
  'toxic-vent',
  'temperature-spike',
];

interface DisasterPanelProps {
  onClose?: () => void;
  onApply?: () => void;
  onIntroduceDisaster?: (command: DisasterCommand) => string | null;
}

export default function DisasterPanel({ onClose, onApply, onIntroduceDisaster }: DisasterPanelProps) {
  const worldState = useStore((state) => state.worldState);
  const tick = useStore((state) => state.tick);

  const [selectedDisaster, setSelectedDisaster] = useState<NaturalDisasterKind | null>(null);
  const [centerX, setCenterX] = useState(50);
  const [centerY, setCenterY] = useState(50);
  const [radius, setRadius] = useState(8);
  const [error, setError] = useState<string | null>(null);

  const worldWidth = worldState?.width ?? 100;
  const worldHeight = worldState?.height ?? 100;

  const handleApplyDisaster = () => {
    if (!selectedDisaster) {
      setError('Please select a disaster type');
      return;
    }

    if (!onIntroduceDisaster) {
      setError('Cannot apply disaster - callback not available');
      return;
    }

    // Clamp coordinates to valid world bounds
    const clampedX = Math.max(0, Math.min(worldWidth - 1, centerX));
    const clampedY = Math.max(0, Math.min(worldHeight - 1, centerY));
    const clampedRadius = Math.max(1, Math.min(50, radius));

    const command = {
      id: `disaster-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tick,
      disasterKind: selectedDisaster,
      centerX: clampedX,
      centerY: clampedY,
      radius: clampedRadius,
    };

    const result = onIntroduceDisaster(command);
    if (result === null) {
      setError(null);
      onApply?.();
      onClose?.();
    } else {
      setError(result);
    }
  };

  const disasterInfo = selectedDisaster ? getDisasterInfo(selectedDisaster) : null;

  return (
    <div className="disaster-panel sim-panel">
      <div className="disaster-panel__header">
        <h2>Trigger Natural Disaster</h2>
        <button
          type="button"
          className="sim-button sim-button--compact"
          onClick={onClose}
          aria-label="Close disaster panel"
        >
          ✕
        </button>
      </div>

      <div className="disaster-panel__content">
        <div className="disaster-panel__section">
          <label htmlFor="disaster-select" className="sim-label">
            Disaster Type
          </label>
          <select
            id="disaster-select"
            className="sim-input"
            value={selectedDisaster || ''}
            onChange={(e) => {
              setSelectedDisaster((e.target.value as NaturalDisasterKind) || null);
              setError(null);
            }}
          >
            <option value="">Select a disaster...</option>
            <optgroup label="Beneficial">
              <option value="nutrient-bloom">Nutrient Bloom</option>
              <option value="mild-flood">Mild Flood</option>
              <option value="meteor-seeding">Meteor Seeding</option>
            </optgroup>
            <optgroup label="Harmful">
              <option value="drought">Drought</option>
              <option value="cold-snap">Cold Snap</option>
              <option value="wildfire">Wildfire</option>
              <option value="toxic-vent">Toxic Vent</option>
              <option value="temperature-spike">Temperature Spike</option>
            </optgroup>
          </select>
        </div>

        {disasterInfo && (
          <div className="disaster-panel__info">
            <div className={`disaster-panel__tone disaster-panel__tone--${disasterInfo.tone}`}>
              {disasterInfo.tone.toUpperCase()}
            </div>
            <p className="disaster-panel__description">{disasterInfo.description}</p>
          </div>
        )}

        <div className="disaster-panel__section">
          <label htmlFor="center-x" className="sim-label">
            Center X: {centerX}
          </label>
          <input
            id="center-x"
            type="range"
            className="sim-input"
            min="0"
            max={worldWidth - 1}
            value={centerX}
            onChange={(e) => setCenterX(parseInt(e.target.value, 10))}
          />
        </div>

        <div className="disaster-panel__section">
          <label htmlFor="center-y" className="sim-label">
            Center Y: {centerY}
          </label>
          <input
            id="center-y"
            type="range"
            className="sim-input"
            min="0"
            max={worldHeight - 1}
            value={centerY}
            onChange={(e) => setCenterY(parseInt(e.target.value, 10))}
          />
        </div>

        <div className="disaster-panel__section">
          <label htmlFor="radius" className="sim-label">
            Radius: {radius}
          </label>
          <input
            id="radius"
            type="range"
            className="sim-input"
            min="1"
            max="50"
            value={radius}
            onChange={(e) => setRadius(parseInt(e.target.value, 10))}
          />
        </div>

        {error && (
          <div className="disaster-panel__error sim-status--error">
            {error}
          </div>
        )}

        <div className="disaster-panel__actions">
          <button
            type="button"
            className="sim-button"
            onClick={handleApplyDisaster}
            disabled={!selectedDisaster}
          >
            Apply Disaster
          </button>
          <button
            type="button"
            className="sim-button sim-button--secondary"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
