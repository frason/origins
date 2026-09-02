/**
 * Ecosystem Watches Panel
 *
 * UI for creating, viewing, and managing ecosystem watches.
 * Allows players to define thresholds and receive alerts.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useStore } from '../state/store';
import type { EcosystemWatch, WatchType } from '../simulation/watches';
import { generateWatchId, describeWatch } from '../simulation/watches';
import type { Traits } from '../utils/traits';
import './WatchesPanel.css';

type WatchFormMode = 'create' | 'edit' | null;

interface WatchFormData {
  name: string;
  type: WatchType;
  speciesId?: string;
  x?: number;
  y?: number;
  regionRadius?: number;
  trait?: keyof Traits;
  thresholdType: 'below' | 'above' | 'change-by';
  thresholdValue: number;
  minTicksBetweenAlerts: number;
}

const WATCH_TYPES: WatchType[] = [
  'species-population',
  'species-energy',
  'species-biomass',
  'trait-frequency',
  'extinction-risk',
  'regional-pressure',
  'energy-depletion',
  'biomass-collapse',
];

const TRAIT_OPTIONS: (keyof Traits)[] = [
  'size',
  'speed',
  'visionRange',
  'hearingRange',
  'camouflage',
  'armor',
  'boneDensity',
  'metabolism',
  'reproductionRate',
  'brainSize',
];

interface WatchesPanelProps {
  onClose?: () => void;
}

export default function WatchesPanel({ onClose }: WatchesPanelProps) {
  const ecosystemWatches = useStore((s) => s.ecosystemWatches);
  const speciesList = useStore((s) => s.speciesList);
  const selectedTile = useStore((s) => s.selectedTile);
  const addWatch = useStore((s) => s.addWatch);
  const updateWatch = useStore((s) => s.updateWatch);
  const removeWatch = useStore((s) => s.removeWatch);

  const [formMode, setFormMode] = useState<WatchFormMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<WatchFormData>({
    name: '',
    type: 'species-population',
    thresholdType: 'below',
    thresholdValue: 10,
    minTicksBetweenAlerts: 100,
  });

  const handleCreateNew = useCallback(() => {
    setFormData({
      name: '',
      type: 'species-population',
      thresholdType: 'below',
      thresholdValue: 10,
      minTicksBetweenAlerts: 100,
      ...(selectedTile && { x: selectedTile.x, y: selectedTile.y, regionRadius: 5 }),
    });
    setEditingId(null);
    setFormMode('create');
  }, [selectedTile]);

  const handleEdit = useCallback((watch: EcosystemWatch) => {
    setFormData({
      name: watch.name,
      type: watch.type,
      speciesId: watch.speciesId,
      x: watch.x,
      y: watch.y,
      regionRadius: watch.regionRadius,
      trait: watch.trait,
      thresholdType: watch.thresholdType,
      thresholdValue: watch.thresholdValue,
      minTicksBetweenAlerts: watch.minTicksBetweenAlerts,
    });
    setEditingId(watch.id);
    setFormMode('edit');
  }, []);

  const handleSave = useCallback(() => {
    if (!formData.name.trim()) {
      alert('Watch name is required');
      return;
    }

    if (editingId) {
      // Update existing watch
      updateWatch(editingId, {
        name: formData.name,
        type: formData.type,
        speciesId: formData.speciesId,
        x: formData.x,
        y: formData.y,
        regionRadius: formData.regionRadius,
        trait: formData.trait,
        thresholdType: formData.thresholdType,
        thresholdValue: formData.thresholdValue,
        minTicksBetweenAlerts: formData.minTicksBetweenAlerts,
      });
    } else {
      // Create new watch
      const watch: EcosystemWatch = {
        id: generateWatchId(),
        createdAtTick: 0, // Will be set by store
        name: formData.name,
        type: formData.type,
        enabled: true,
        speciesId: formData.speciesId,
        x: formData.x,
        y: formData.y,
        regionRadius: formData.regionRadius,
        trait: formData.trait,
        thresholdType: formData.thresholdType,
        thresholdValue: formData.thresholdValue,
        minTicksBetweenAlerts: formData.minTicksBetweenAlerts,
      };
      addWatch(watch);
    }

    setFormMode(null);
  }, [formData, editingId, updateWatch, addWatch]);

  const handleCancel = useCallback(() => {
    setFormMode(null);
    setEditingId(null);
  }, []);

  const handleDelete = useCallback((id: string) => {
    if (confirm('Delete this watch?')) {
      removeWatch(id);
    }
  }, [removeWatch]);

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      } else if (e.key === 'Enter' && formMode && e.ctrlKey) {
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formMode, onClose, handleSave]);

  const watchTypeLabel = (type: WatchType): string => {
    const labels: Record<WatchType, string> = {
      'species-population': 'Population',
      'species-energy': 'Energy',
      'species-biomass': 'Biomass',
      'trait-frequency': 'Trait Frequency',
      'extinction-risk': 'Extinction Risk',
      'regional-pressure': 'Regional Pressure',
      'energy-depletion': 'Energy Depletion',
      'biomass-collapse': 'Biomass Collapse',
    };
    return labels[type];
  };

  const requiresSpecies = (type: WatchType): boolean =>
    [
      'species-population',
      'species-energy',
      'species-biomass',
      'trait-frequency',
      'extinction-risk',
    ].includes(type);

  const requiresRegion = (type: WatchType): boolean => type === 'regional-pressure';

  return (
    <div className="watches-panel">
      <div className="watches-panel__header">
        <h2>Ecosystem Watches</h2>
        {onClose && (
          <button
            className="watches-panel__close"
            onClick={onClose}
            aria-label="Close watches panel"
            type="button"
          >
            ✕
          </button>
        )}
      </div>

      {formMode && (
        <div className="watches-panel__form">
          <h3>{editingId ? 'Edit Watch' : 'Create Watch'}</h3>

          <div className="watches-panel__form-group">
            <label htmlFor="watch-name">Name</label>
            <input
              id="watch-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Monitor extinction risk"
            />
          </div>

          <div className="watches-panel__form-group">
            <label htmlFor="watch-type">Watch Type</label>
            <select
              id="watch-type"
              value={formData.type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  type: e.target.value as WatchType,
                })
              }
            >
              {WATCH_TYPES.map((type) => (
                <option key={type} value={type}>
                  {watchTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>

          {requiresSpecies(formData.type) && (
            <div className="watches-panel__form-group">
              <label htmlFor="watch-species">Target Species</label>
              <select
                id="watch-species"
                value={formData.speciesId || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    speciesId: e.target.value || undefined,
                  })
                }
              >
                <option value="">Select species...</option>
                {speciesList.map((species) => {
                  const id = (species?.id as string) || '';
                  const name = (species?.name as string) || id;
                  return (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {formData.type === 'trait-frequency' && formData.speciesId && (
            <div className="watches-panel__form-group">
              <label htmlFor="watch-trait">Trait</label>
              <select
                id="watch-trait"
                value={formData.trait || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    trait: (e.target.value as keyof Traits) || undefined,
                  })
                }
              >
                <option value="">Select trait...</option>
                {TRAIT_OPTIONS.map((trait) => (
                  <option key={trait} value={trait}>
                    {String(trait)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {requiresRegion(formData.type) && (
            <>
              <div className="watches-panel__form-group">
                <label htmlFor="watch-x">Region X</label>
                <input
                  id="watch-x"
                  type="number"
                  min="0"
                  value={formData.x || 0}
                  onChange={(e) =>
                    setFormData({ ...formData, x: parseInt(e.target.value, 10) })
                  }
                />
              </div>

              <div className="watches-panel__form-group">
                <label htmlFor="watch-y">Region Y</label>
                <input
                  id="watch-y"
                  type="number"
                  min="0"
                  value={formData.y || 0}
                  onChange={(e) =>
                    setFormData({ ...formData, y: parseInt(e.target.value, 10) })
                  }
                />
              </div>

              <div className="watches-panel__form-group">
                <label htmlFor="watch-radius">Radius (tiles)</label>
                <input
                  id="watch-radius"
                  type="number"
                  min="1"
                  value={formData.regionRadius || 5}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      regionRadius: parseInt(e.target.value, 10),
                    })
                  }
                />
              </div>
            </>
          )}

          <div className="watches-panel__form-group">
            <label htmlFor="watch-threshold-type">Threshold Type</label>
            <select
              id="watch-threshold-type"
              value={formData.thresholdType}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  thresholdType: e.target.value as 'below' | 'above' | 'change-by',
                })
              }
            >
              <option value="below">Alert if below</option>
              <option value="above">Alert if above</option>
              <option value="change-by">Alert if change ≥</option>
            </select>
          </div>

          <div className="watches-panel__form-group">
            <label htmlFor="watch-threshold-value">Threshold Value</label>
            <input
              id="watch-threshold-value"
              type="number"
              value={formData.thresholdValue}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  thresholdValue: parseFloat(e.target.value) || 0,
                })
              }
            />
          </div>

          <div className="watches-panel__form-group">
            <label htmlFor="watch-rate-limit">Min Ticks Between Alerts</label>
            <input
              id="watch-rate-limit"
              type="number"
              min="1"
              value={formData.minTicksBetweenAlerts}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  minTicksBetweenAlerts: parseInt(e.target.value, 10) || 1,
                })
              }
            />
          </div>

          <div className="watches-panel__form-actions">
            <button
              className="watches-panel__button watches-panel__button--primary"
              onClick={handleSave}
              type="button"
            >
              {editingId ? 'Save' : 'Create'}
            </button>
            <button
              className="watches-panel__button"
              onClick={handleCancel}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="watches-panel__content">
        {!formMode && (
          <button
            className="watches-panel__button watches-panel__button--primary"
            onClick={handleCreateNew}
            type="button"
          >
            + New Watch
          </button>
        )}

        {ecosystemWatches.length === 0 && !formMode ? (
          <p className="watches-panel__empty">No watches yet. Create one to monitor ecosystem changes.</p>
        ) : (
          <ul className="watches-panel__list">
            {ecosystemWatches.map((watch) => (
              <li key={watch.id} className="watches-panel__item">
                <div className="watches-panel__item-header">
                  <h4>{watch.name}</h4>
                  <span className="watches-panel__item-type">
                    {watchTypeLabel(watch.type)}
                  </span>
                </div>
                <p className="watches-panel__item-description">
                  {describeWatch(watch)}
                </p>
                {!watch.enabled && (
                  <p className="watches-panel__item-status">Disabled</p>
                )}
                <div className="watches-panel__item-actions">
                  <button
                    className="watches-panel__item-action"
                    onClick={() => handleEdit(watch)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="watches-panel__item-action watches-panel__item-action--danger"
                    onClick={() => handleDelete(watch.id)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
