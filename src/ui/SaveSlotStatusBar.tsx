/**
 * Save Slot Status Bar (Phase A)
 *
 * Ambient, always-visible indicator showing current occupancy of auto and manual save slots.
 * Displayed as a compact status indicator (e.g., "Auto: 6/8 | Manual: 1/2").
 */

import React from 'react';
import { useStore } from '../state/store';
import './SaveSlotStatusBar.css';

export function SaveSlotStatusBar() {
  const saveSlotStatus = useStore((s) => s.saveSlotStatus);

  return (
    <div className="save-slot-status-bar">
      <div className="slot-indicator">
        <span className="slot-label">Slots:</span>
        <span
          className={`slot-count auto-slots ${
            saveSlotStatus.autoCount >= saveSlotStatus.autoCapacity ? 'full' : ''
          }`}
          title={`Auto-save slots: ${saveSlotStatus.autoCount}/${saveSlotStatus.autoCapacity}`}
        >
          Auto {saveSlotStatus.autoCount}/{saveSlotStatus.autoCapacity}
        </span>
        <span className="slot-separator">•</span>
        <span
          className={`slot-count manual-slots ${
            saveSlotStatus.manualCount >= saveSlotStatus.manualCapacity ? 'full' : ''
          }`}
          title={`Manual save slots: ${saveSlotStatus.manualCount}/${saveSlotStatus.manualCapacity}`}
        >
          Manual {saveSlotStatus.manualCount}/{saveSlotStatus.manualCapacity}
        </span>
      </div>
    </div>
  );
}
