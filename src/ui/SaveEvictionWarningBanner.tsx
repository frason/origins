/**
 * Save Eviction Warning Banner (Phase A)
 *
 * Non-blocking banner that appears when the next auto-save would evict an existing save.
 * Displays the name and tick of the save at risk, and offers a one-click "protect" action
 * that promotes it to the manual save pool.
 */

import React, { useState } from 'react';
import { useStore } from '../state/store';
import { protectAutoSave } from '../state/saveSlotManager';
import './SaveEvictionWarningBanner.css';

export function SaveEvictionWarningBanner() {
  const pendingEviction = useStore((s) => s.pendingEviction);
  const setPendingEviction = useStore((s) => s.setPendingEviction);
  const [isProtecting, setIsProtecting] = useState(false);
  const [protectError, setProtectError] = useState<string | null>(null);

  if (!pendingEviction) {
    return null;
  }

  const handleProtect = async () => {
    setIsProtecting(true);
    setProtectError(null);
    try {
      await protectAutoSave(pendingEviction.slotId);
      // Clear the pending eviction warning after successful protection
      setPendingEviction(null);
    } catch (err) {
      setProtectError(err instanceof Error ? err.message : 'Failed to protect save');
    } finally {
      setIsProtecting(false);
    }
  };

  const saveName = pendingEviction.worldName || `Auto-save (tick ${pendingEviction.tick})`;

  return (
    <div className="save-eviction-warning-banner">
      <div className="banner-content">
        <span className="banner-text">
          ⚠️ Auto-save slot is full. "{saveName}" will be evicted on next save.
        </span>
        <button
          className="protect-button"
          onClick={handleProtect}
          disabled={isProtecting}
          title="Promote this save to the manual save pool"
        >
          {isProtecting ? 'Protecting...' : 'Protect This Save'}
        </button>
        {protectError && <span className="error-text">{protectError}</span>}
      </div>
    </div>
  );
}
