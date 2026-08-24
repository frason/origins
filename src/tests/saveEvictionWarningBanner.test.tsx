/**
 * Component tests for SaveEvictionWarningBanner (Phase A)
 *
 * Tests:
 * - Banner renders nothing when pendingEviction is null
 * - Banner renders warning text and save name when pendingEviction is present
 * - Banner button has correct attributes and text
 * - Banner correctly formats save name from worldName or falls back to tick
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import type { PendingEviction } from '../state/saveSlotManager';

// Store state for mock
let mockPendingEviction: PendingEviction | null = null;
let mockSetPendingEviction: ((eviction: PendingEviction | null) => void) = () => {};

// Mock the store to return controlled state
vi.mock('../state/store', () => ({
  useStore: (selector: (state: any) => any) => {
    const state = {
      pendingEviction: mockPendingEviction,
      setPendingEviction: mockSetPendingEviction,
    };
    return selector(state);
  },
}));

// Mock protectAutoSave
vi.mock('../state/saveSlotManager', () => ({
  protectAutoSave: vi.fn(),
}));

import { SaveEvictionWarningBanner } from '../ui/SaveEvictionWarningBanner';

describe('SaveEvictionWarningBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPendingEviction = null;
    mockSetPendingEviction = () => {};
  });

  it('renders nothing when pendingEviction is null', () => {
    mockPendingEviction = null;
    const html = renderToStaticMarkup(React.createElement(SaveEvictionWarningBanner));
    expect(html).toBe('');
  });

  it('renders warning banner when pendingEviction is present', () => {
    const pendingEviction: PendingEviction = {
      slotId: 'auto-12345-abc',
      slotIndex: 0,
      tick: 5000,
      worldName: 'My Test World',
      timestamp: Date.now(),
    };

    mockPendingEviction = pendingEviction;
    const html = renderToStaticMarkup(React.createElement(SaveEvictionWarningBanner));

    expect(html).toContain('save-eviction-warning-banner');
    expect(html).toContain('⚠️');
    expect(html).toContain('My Test World');
    expect(html).toContain('will be evicted on next save');
  });

  it('displays tick in banner when worldName is not provided', () => {
    const pendingEviction: PendingEviction = {
      slotId: 'auto-12345-abc',
      slotIndex: 0,
      tick: 5000,
      timestamp: Date.now(),
    };

    mockPendingEviction = pendingEviction;
    const html = renderToStaticMarkup(React.createElement(SaveEvictionWarningBanner));

    expect(html).toContain('Auto-save (tick 5000)');
  });

  it('includes "Protect This Save" button with correct attributes', () => {
    const pendingEviction: PendingEviction = {
      slotId: 'auto-12345-abc',
      slotIndex: 0,
      tick: 5000,
      worldName: 'Protected World',
      timestamp: Date.now(),
    };

    mockPendingEviction = pendingEviction;
    const html = renderToStaticMarkup(React.createElement(SaveEvictionWarningBanner));

    expect(html).toContain('protect-button');
    expect(html).toContain('Protect This Save');
    expect(html).toContain('Promote this save to the manual save pool');
  });

  it('renders with consistent CSS classes for styling', () => {
    const pendingEviction: PendingEviction = {
      slotId: 'auto-12345-abc',
      slotIndex: 0,
      tick: 5000,
      worldName: 'Test World',
      timestamp: Date.now(),
    };

    mockPendingEviction = pendingEviction;
    const html = renderToStaticMarkup(React.createElement(SaveEvictionWarningBanner));

    expect(html).toContain('banner-content');
    expect(html).toContain('banner-text');
  });
});
