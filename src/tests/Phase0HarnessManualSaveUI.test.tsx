/**
 * Phase 0 Harness Manual Save UI End-to-End Test
 *
 * Tests the complete manual save flow through the UI:
 * 1. Renders Phase0Harness component
 * 2. Clicks "Manual Save" button repeatedly to fill the 2-slot pool
 * 3. Verifies the overwrite-picker modal appears when pool is full
 * 4. Clicks a slot's "Overwrite This Slot" button
 * 5. Verifies the save succeeds and modal closes
 *
 * This is a real UI-level integration test using React Testing Library,
 * not a direct function call test.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import 'fake-indexeddb/auto';
import Phase0Harness from '../prototype/Phase0Harness';
import { clearAllSaves } from '../state/saveSlotManager';

describe('Phase 0 Harness Manual Save UI End-to-End', () => {
  beforeEach(async () => {
    // Clear all saves before each test
    await clearAllSaves();
  });

  afterEach(async () => {
    // Clean up after each test
    await clearAllSaves();
  });

  it('should render Manual Save button', async () => {
    render(<Phase0Harness />);

    // Wait for the component to fully load (saves list loads asynchronously)
    await waitFor(() => {
      const manualSaveButton = screen.queryByRole('button', { name: /Manual Save/i });
      expect(manualSaveButton).toBeTruthy();
    }, { timeout: 3000 });
  }, { timeout: 10000 });

  it('should create a manual save when button is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Phase0Harness />);

    // Wait for the Manual Save button to appear
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Manual Save/i })).toBeTruthy();
    }, { timeout: 3000 });

    const manualSaveButton = screen.getByRole('button', { name: /Manual Save/i });
    await user.click(manualSaveButton);

    // Wait for the success message
    await waitFor(() => {
      expect(screen.getByText(/Manual save created/i)).toBeTruthy();
    }, { timeout: 3000 });
  }, { timeout: 15000 });

  it('should show overwrite picker when manual save pool is full', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Phase0Harness />);

    // Wait for the Manual Save button to appear
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Manual Save/i })).toBeTruthy();
    }, { timeout: 3000 });

    const manualSaveButton = screen.getByRole('button', { name: /Manual Save/i });

    // Click Manual Save three times: first two fill the pool, third triggers picker
    await user.click(manualSaveButton);
    await waitFor(
      () => {
        const msg = screen.queryByText(/Manual save created|Manual save pool is full/i);
        expect(msg).toBeTruthy();
      },
      { timeout: 3000 }
    );

    // Wait for async operations to settle
    await waitFor(() => {
      // Check if savesLoading is false by looking for the manual saves section header
      const header = screen.queryByText(/Manual saves/i);
      expect(header).toBeTruthy();
    }, { timeout: 3000 });

    // Second click
    await user.click(manualSaveButton);
    await waitFor(
      () => {
        const msg = screen.queryByText(/Manual save created|Manual save pool is full/i);
        expect(msg).toBeTruthy();
      },
      { timeout: 3000 }
    );

    // Wait before third click
    await waitFor(() => {
      const header = screen.queryByText(/Manual saves/i);
      expect(header).toBeTruthy();
    }, { timeout: 3000 });

    // Third click - pool should be full, picker should appear
    await user.click(manualSaveButton);

    // Wait for the overwrite picker modal to appear
    await waitFor(() => {
      expect(screen.getByText(/Manual save pool is full/i)).toBeTruthy();
    }, { timeout: 5000 });

    // Verify the picker shows the instruction text (use colon to match only modal, not status banner)
    expect(screen.getByText(/Choose a slot to overwrite:/i)).toBeTruthy();
  }, { timeout: 20000 });

  it('should allow overwriting a slot when picker is shown', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Phase0Harness />);

    // Wait for the Manual Save button to appear
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Manual Save/i })).toBeTruthy();
    }, { timeout: 3000 });

    const manualSaveButton = screen.getByRole('button', { name: /Manual Save/i });

    // Fill the pool with two clicks
    await user.click(manualSaveButton);
    await waitFor(
      () => {
        const msg = screen.queryByText(/Manual save created|Manual save pool is full/i);
        expect(msg).toBeTruthy();
      },
      { timeout: 3000 }
    );

    await user.click(manualSaveButton);
    await waitFor(
      () => {
        const msg = screen.queryByText(/Manual save created|Manual save pool is full/i);
        expect(msg).toBeTruthy();
      },
      { timeout: 3000 }
    );

    // Third click - pool is full, picker should appear
    await user.click(manualSaveButton);

    // Wait for the overwrite picker modal
    await waitFor(() => {
      expect(screen.getByText(/Manual save pool is full/i)).toBeTruthy();
    }, { timeout: 5000 });

    // Find the first "Overwrite This Slot" button
    const overwriteButtons = screen.getAllByRole('button', { name: /Overwrite This Slot/i });
    expect(overwriteButtons.length).toBeGreaterThan(0);

    // Click the first overwrite button
    await user.click(overwriteButtons[0]);

    // Wait for the save to complete and modal to close
    await waitFor(() => {
      expect(screen.getByText(/Manual save overwritten/i)).toBeTruthy();
    }, { timeout: 5000 });

    // Verify the picker is no longer visible
    await waitFor(() => {
      expect(screen.queryByText(/Choose a slot to overwrite/i)).toBeFalsy();
    }, { timeout: 3000 });
  }, { timeout: 25000 });

  it('should allow canceling the overwrite picker', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Phase0Harness />);

    // Wait for the Manual Save button to appear
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Manual Save/i })).toBeTruthy();
    }, { timeout: 3000 });

    const manualSaveButton = screen.getByRole('button', { name: /Manual Save/i });

    // Fill the pool (click twice)
    await user.click(manualSaveButton);
    await waitFor(
      () => {
        const msg = screen.queryByText(/Manual save created|Manual save pool is full/i);
        expect(msg).toBeTruthy();
      },
      { timeout: 3000 }
    );

    await user.click(manualSaveButton);
    await waitFor(
      () => {
        const msg = screen.queryByText(/Manual save created|Manual save pool is full/i);
        expect(msg).toBeTruthy();
      },
      { timeout: 3000 }
    );

    // Third click to show picker
    await user.click(manualSaveButton);

    await waitFor(() => {
      expect(screen.getByText(/Manual save pool is full/i)).toBeTruthy();
    }, { timeout: 5000 });

    // Find and click the Cancel button
    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    await user.click(cancelButton);

    // Verify the picker closes and shows cancel message
    await waitFor(() => {
      expect(screen.getByText(/Save cancelled/i)).toBeTruthy();
    }, { timeout: 3000 });

    // Verify the modal is no longer visible
    await waitFor(() => {
      expect(screen.queryByText(/Choose a slot to overwrite/i)).toBeFalsy();
    }, { timeout: 3000 });
  }, { timeout: 25000 });
});
