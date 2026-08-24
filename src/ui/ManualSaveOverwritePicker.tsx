/**
 * Manual Save Overwrite Picker (Phase A)
 *
 * Modal shown when both manual save slots are full and player tries to save manually.
 * Displays the 2 existing manual slots and allows player to pick which one to overwrite.
 */

import React, { useState } from 'react';
import './ManualSaveOverwritePicker.css';

export interface ManualSlot {
  id: string;
  tick: number;
  timestamp: number;
  worldName?: string;
}

interface ManualSaveOverwritePickerProps {
  slots: ManualSlot[];
  onConfirm: (slotId: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ManualSaveOverwritePicker({
  slots,
  onConfirm,
  onCancel,
  isLoading = false,
}: ManualSaveOverwritePickerProps) {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(slots[0]?.id || null);
  const [error, setError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    if (!selectedSlotId) {
      setError('Please select a slot to overwrite');
      return;
    }

    setIsConfirming(true);
    setError(null);
    try {
      await onConfirm(selectedSlotId);
      // Success — parent should close the picker
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsConfirming(false);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="manual-save-overwrite-picker-overlay">
      <div className="manual-save-overwrite-picker-modal">
        <h2>Manual Save Slots Full</h2>
        <p>Both manual save slots are full. Pick one to overwrite:</p>

        <div className="slot-list">
          {slots.map((slot) => (
            <label key={slot.id} className="slot-option">
              <input
                type="radio"
                name="manual-slot-select"
                value={slot.id}
                checked={selectedSlotId === slot.id}
                onChange={(e) => setSelectedSlotId(e.target.value)}
                disabled={isConfirming || isLoading}
              />
              <span className="slot-info">
                <strong>{slot.worldName || `Manual Save (Tick ${slot.tick})`}</strong>
                <br />
                <small>Saved: {formatTime(slot.timestamp)}</small>
              </span>
            </label>
          ))}
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="modal-actions">
          <button
            onClick={onCancel}
            disabled={isConfirming || isLoading}
            className="cancel-button"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedSlotId || isConfirming || isLoading}
            className="confirm-button"
          >
            {isConfirming ? 'Saving...' : 'Overwrite Selected Slot'}
          </button>
        </div>
      </div>
    </div>
  );
}
