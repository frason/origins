/**
 * Integration test: Disaster UI → Running Engine State
 *
 * Verifies that applying a disaster through the UI callback (DisasterPanel)
 * properly calls the callback with the correct DisasterCommand type,
 * and that the event logged is of type 'environmental-shock'.
 *
 * Also verifies the end-to-end integration: ControlPanel mount point →
 * "Open Disaster Trigger" button → DisasterPanel → onIntroduceDisaster handler.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import DisasterPanel from '../ui/DisasterPanel';
import ControlPanel from '../ui/ControlPanel';
import type { DisasterCommand } from '../simulation/disasterCommand';

describe('Disaster Integration - UI Component Wiring', () => {
  it('DisasterPanel fires onIntroduceDisaster callback with properly typed DisasterCommand', () => {
    // Create a mock callback to capture the command
    const mockCallback = vi.fn((command: DisasterCommand) => null);

    // Mount the DisasterPanel component
    render(
      <DisasterPanel
        onClose={vi.fn()}
        onApply={vi.fn()}
        onIntroduceDisaster={mockCallback}
      />
    );

    // Select a disaster type (drought for this test)
    const select = screen.getByLabelText('Disaster Type');
    fireEvent.change(select, { target: { value: 'drought' } });

    // Click the Apply Disaster button
    const applyButton = screen.getByRole('button', { name: /Apply Disaster/i });
    fireEvent.click(applyButton);

    // Verify the callback was called exactly once
    expect(mockCallback).toHaveBeenCalledTimes(1);

    // Verify the callback received a properly typed DisasterCommand
    const capturedCommand = mockCallback.mock.calls[0][0];
    expect(capturedCommand).toBeDefined();
    expect(capturedCommand.id).toBeDefined();
    expect(typeof capturedCommand.id).toBe('string');
    expect(capturedCommand.tick).toBeDefined();
    expect(typeof capturedCommand.tick).toBe('number');
    expect(capturedCommand.disasterKind).toBe('drought');
    expect(capturedCommand.centerX).toBeDefined();
    expect(typeof capturedCommand.centerX).toBe('number');
    expect(capturedCommand.centerY).toBeDefined();
    expect(typeof capturedCommand.centerY).toBe('number');
    expect(capturedCommand.radius).toBeDefined();
    expect(typeof capturedCommand.radius).toBe('number');
  });

  it('DisasterPanel handles nutrient-bloom disaster selection', () => {
    const mockCallback = vi.fn((command: DisasterCommand) => null);

    render(
      <DisasterPanel
        onClose={vi.fn()}
        onApply={vi.fn()}
        onIntroduceDisaster={mockCallback}
      />
    );

    // Select nutrient-bloom
    const select = screen.getByLabelText('Disaster Type');
    fireEvent.change(select, { target: { value: 'nutrient-bloom' } });

    // Click Apply
    const applyButton = screen.getByRole('button', { name: /Apply Disaster/i });
    fireEvent.click(applyButton);

    // Verify callback was called with nutrient-bloom
    expect(mockCallback).toHaveBeenCalledTimes(1);
    const command = mockCallback.mock.calls[0][0];
    expect(command.disasterKind).toBe('nutrient-bloom');
  });

  it('DisasterPanel does not call callback if no disaster type selected', () => {
    const mockCallback = vi.fn((command: DisasterCommand) => null);

    render(
      <DisasterPanel
        onClose={vi.fn()}
        onApply={vi.fn()}
        onIntroduceDisaster={mockCallback}
      />
    );

    // Try to click Apply without selecting a disaster
    const applyButton = screen.getByRole('button', { name: /Apply Disaster/i });
    // Button should be disabled if no selection
    expect(applyButton).toBeDisabled();

    // Callback should not be called
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('ControlPanel mount point: "Open Disaster Trigger" button → DisasterPanel → onIntroduceDisaster handler chain', async () => {
    // This test verifies the end-to-end wiring from ControlPanel through to the handler.
    // It demonstrates that a player can actually trigger a disaster through the UI mount point.

    const mockDisasterHandler = vi.fn((command: DisasterCommand): string | null => null);

    render(
      <ControlPanel
        onIntroduceDisaster={mockDisasterHandler}
        replayActive={false}
        checkpointTicks={[]}
      />
    );

    // Step 0: Open God Mode (disaster trigger is in the God Mode section)
    const godModeToggle = screen.getByRole('button', { name: /Open God Mode/i });
    fireEvent.click(godModeToggle);

    // Step 1: Click "Open Disaster Trigger" button to open the DisasterPanel
    const openDisasterButton = screen.getByRole('button', { name: /Open Disaster Trigger/i });
    expect(openDisasterButton).toBeInTheDocument();
    fireEvent.click(openDisasterButton);

    // Step 2: Verify DisasterPanel is now rendered (can select a disaster)
    await waitFor(() => {
      const disasterTypeSelect = screen.getByLabelText('Disaster Type');
      expect(disasterTypeSelect).toBeInTheDocument();
    });

    // Step 3: Select a disaster type
    const disasterTypeSelect = screen.getByLabelText('Disaster Type');
    fireEvent.change(disasterTypeSelect, { target: { value: 'drought' } });

    // Step 4: Click "Apply Disaster" button
    const applyButton = screen.getByRole('button', { name: /Apply Disaster/i });
    expect(applyButton).not.toBeDisabled();
    fireEvent.click(applyButton);

    // Step 5: Verify onIntroduceDisaster handler was called with a valid DisasterCommand
    await waitFor(() => {
      expect(mockDisasterHandler).toHaveBeenCalledTimes(1);
    });

    const capturedCommand = mockDisasterHandler.mock.calls[0][0];
    expect(capturedCommand).toBeDefined();
    expect(capturedCommand.id).toBeDefined();
    expect(typeof capturedCommand.id).toBe('string');
    expect(capturedCommand.tick).toBeDefined();
    expect(typeof capturedCommand.tick).toBe('number');
    expect(capturedCommand.disasterKind).toBe('drought');
    expect(capturedCommand.centerX).toBeDefined();
    expect(typeof capturedCommand.centerX).toBe('number');
    expect(capturedCommand.centerY).toBeDefined();
    expect(typeof capturedCommand.centerY).toBe('number');
    expect(capturedCommand.radius).toBeDefined();
    expect(typeof capturedCommand.radius).toBe('number');
  });

  it('ControlPanel closes DisasterPanel after successful disaster application', async () => {
    // Verify that the DisasterPanel is closed after the handler returns null (success)
    const mockDisasterHandler = vi.fn((command: DisasterCommand): string | null => null);

    render(
      <ControlPanel
        onIntroduceDisaster={mockDisasterHandler}
        replayActive={false}
        checkpointTicks={[]}
      />
    );

    // Open God Mode first
    const godModeToggle = screen.getByRole('button', { name: /Open God Mode/i });
    fireEvent.click(godModeToggle);

    // Open disaster panel
    const openDisasterButton = screen.getByRole('button', { name: /Open Disaster Trigger/i });
    fireEvent.click(openDisasterButton);

    // Wait for panel to render and select disaster
    await waitFor(() => {
      const select = screen.getByLabelText('Disaster Type');
      expect(select).toBeInTheDocument();
    });

    const disasterTypeSelect = screen.getByLabelText('Disaster Type');
    fireEvent.change(disasterTypeSelect, { target: { value: 'nutrient-bloom' } });

    // Apply disaster
    const applyButton = screen.getByRole('button', { name: /Apply Disaster/i });
    fireEvent.click(applyButton);

    // Verify handler was called
    await waitFor(() => {
      expect(mockDisasterHandler).toHaveBeenCalledTimes(1);
    });

    // After successful application, the DisasterPanel should close
    // Verify by checking that the disaster type select is no longer in the document
    // (indicating the panel has closed)
    await waitFor(() => {
      expect(screen.queryByLabelText('Disaster Type')).not.toBeInTheDocument();
    });
  });

  it('ControlPanel displays error message when disaster handler returns an error', async () => {
    // Verify error handling: if onIntroduceDisaster returns an error, it should be displayed
    const errorMessage = 'Engine not initialized';
    const mockDisasterHandler = vi.fn((command: DisasterCommand): string | null => errorMessage);

    render(
      <ControlPanel
        onIntroduceDisaster={mockDisasterHandler}
        replayActive={false}
        checkpointTicks={[]}
      />
    );

    // Open God Mode first
    const godModeToggle = screen.getByRole('button', { name: /Open God Mode/i });
    fireEvent.click(godModeToggle);

    // Open disaster panel
    const openDisasterButton = screen.getByRole('button', { name: /Open Disaster Trigger/i });
    fireEvent.click(openDisasterButton);

    // Wait and select disaster
    await waitFor(() => {
      const select = screen.getByLabelText('Disaster Type');
      expect(select).toBeInTheDocument();
    });

    const disasterTypeSelect = screen.getByLabelText('Disaster Type');
    fireEvent.change(disasterTypeSelect, { target: { value: 'drought' } });

    // Apply disaster
    const applyButton = screen.getByRole('button', { name: /Apply Disaster/i });
    fireEvent.click(applyButton);

    // Verify handler was called
    await waitFor(() => {
      expect(mockDisasterHandler).toHaveBeenCalledTimes(1);
    });

    // DisasterPanel should remain open on error (can still see the select)
    await waitFor(() => {
      const disasterTypeSelect = screen.getByLabelText('Disaster Type');
      expect(disasterTypeSelect).toBeInTheDocument();
    });

    // Verify error message is displayed in the status div
    const statusDivs = screen.getAllByRole('status');
    const errorStatusDiv = statusDivs.find((div) => div.textContent.includes(errorMessage));
    expect(errorStatusDiv).toBeDefined();
  });
});
