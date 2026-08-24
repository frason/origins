/**
 * Component tests for SaveSlotStatusBar (Phase A)
 *
 * Tests:
 * - Status bar renders with correct auto and manual slot counts
 * - Status bar applies "full" CSS class when slots are at capacity
 * - Status bar displays proper slot labels and separator
 * - Status bar includes accessible title attributes with slot information
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import type { SaveSlotStatus } from '../state/store';

// Store state for mock
let mockSaveSlotStatus: SaveSlotStatus = {
  autoCount: 0,
  autoCapacity: 8,
  manualCount: 0,
  manualCapacity: 2,
};

// Mock the store to return controlled state
vi.mock('../state/store', () => ({
  useStore: (selector: (state: any) => any) => {
    const state = {
      saveSlotStatus: mockSaveSlotStatus,
    };
    return selector(state);
  },
}));

import { SaveSlotStatusBar } from '../ui/SaveSlotStatusBar';

describe('SaveSlotStatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveSlotStatus = {
      autoCount: 0,
      autoCapacity: 8,
      manualCount: 0,
      manualCapacity: 2,
    };
  });

  it('renders with empty slot counts', () => {
    mockSaveSlotStatus = {
      autoCount: 0,
      autoCapacity: 8,
      manualCount: 0,
      manualCapacity: 2,
    };

    const html = renderToStaticMarkup(React.createElement(SaveSlotStatusBar));

    expect(html).toContain('save-slot-status-bar');
    expect(html).toContain('Slots:');
    expect(html).toContain('Auto 0/8');
    expect(html).toContain('Manual 0/2');
  });

  it('renders with partial slot occupancy', () => {
    mockSaveSlotStatus = {
      autoCount: 6,
      autoCapacity: 8,
      manualCount: 1,
      manualCapacity: 2,
    };

    const html = renderToStaticMarkup(React.createElement(SaveSlotStatusBar));

    expect(html).toContain('Auto 6/8');
    expect(html).toContain('Manual 1/2');
  });

  it('renders with full auto slots and empty manual slots', () => {
    mockSaveSlotStatus = {
      autoCount: 8,
      autoCapacity: 8,
      manualCount: 0,
      manualCapacity: 2,
    };

    const html = renderToStaticMarkup(React.createElement(SaveSlotStatusBar));

    expect(html).toContain('Auto 8/8');
    expect(html).toContain('full');
    expect(html).toContain('Manual 0/2');
  });

  it('renders with full manual slots', () => {
    mockSaveSlotStatus = {
      autoCount: 4,
      autoCapacity: 8,
      manualCount: 2,
      manualCapacity: 2,
    };

    const html = renderToStaticMarkup(React.createElement(SaveSlotStatusBar));

    expect(html).toContain('Auto 4/8');
    expect(html).toContain('Manual 2/2');
    // Should have "full" class for manual slots only
    expect(html.match(/full/g)?.length).toBe(1);
  });

  it('renders with both auto and manual slots full', () => {
    mockSaveSlotStatus = {
      autoCount: 8,
      autoCapacity: 8,
      manualCount: 2,
      manualCapacity: 2,
    };

    const html = renderToStaticMarkup(React.createElement(SaveSlotStatusBar));

    expect(html).toContain('Auto 8/8');
    expect(html).toContain('Manual 2/2');
    // Should have "full" class for both
    expect(html.match(/full/g)?.length).toBe(2);
  });

  it('includes accessible title attributes for slot tooltips', () => {
    mockSaveSlotStatus = {
      autoCount: 5,
      autoCapacity: 8,
      manualCount: 1,
      manualCapacity: 2,
    };

    const html = renderToStaticMarkup(React.createElement(SaveSlotStatusBar));

    expect(html).toContain('Auto-save slots: 5/8');
    expect(html).toContain('Manual save slots: 1/2');
  });

  it('includes consistent CSS classes for styling', () => {
    const html = renderToStaticMarkup(React.createElement(SaveSlotStatusBar));

    expect(html).toContain('slot-indicator');
    expect(html).toContain('slot-label');
    expect(html).toContain('slot-count');
    expect(html).toContain('auto-slots');
    expect(html).toContain('manual-slots');
    expect(html).toContain('slot-separator');
  });

  it('displays separator between auto and manual slot indicators', () => {
    const html = renderToStaticMarkup(React.createElement(SaveSlotStatusBar));

    expect(html).toContain('slot-separator');
    expect(html).toContain('•');
  });
});
