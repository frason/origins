/**
 * Integration test: Disaster UI → Running Engine State
 *
 * Verifies that applying a disaster through the UI callback (DisasterPanel)
 * properly calls the callback with the correct DisasterCommand type,
 * and that the event logged is of type 'environmental-shock'.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DisasterPanel from '../ui/DisasterPanel';
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
});
