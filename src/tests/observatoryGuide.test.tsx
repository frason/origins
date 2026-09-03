import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ObservatoryGuide from '../ui/ObservatoryGuide';
import { useStore } from '../state/store';
import {
  createFreshObservatoryState,
  dismissOnboarding,
  saveObservatoryState,
} from '../ui/observatoryObjectives';

// Mock the store
vi.mock('../state/store', () => ({
  useStore: vi.fn(),
}));

describe('ObservatoryGuide', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('does not render if observatoryState is null', () => {
    (useStore as any).mockImplementation((selector: any) => {
      const state: any = {
        observatoryState: null,
        tick: 0,
        selectedTile: null,
        followedLineages: [],
        worldState: null,
        constants: {},
        setObservatoryState: vi.fn(),
        setRunning: vi.fn(),
      };
      return selector(state);
    });

    const { container } = render(<ObservatoryGuide />);
    expect(container.firstChild).toBeNull();
  });

  it('does not render if not onboarded', () => {
    (useStore as any).mockImplementation((selector: any) => {
      const state: any = {
        observatoryState: createFreshObservatoryState(),
      };
      return selector(state);
    });

    const { container } = render(<ObservatoryGuide />);
    expect(container.firstChild).toBeNull();
  });

  it('does not render if all objectives completed', () => {
    const state = createFreshObservatoryState();
    const onboarded = dismissOnboarding(state);
    const allComplete = {
      ...onboarded,
      allCompleted: true,
      currentObjective: null as any,
    };

    (useStore as any).mockImplementation((selector: any) => {
      const store: any = {
        observatoryState: allComplete,
      };
      return selector(store);
    });

    const { container } = render(<ObservatoryGuide />);
    expect(container.firstChild).toBeNull();
  });

  it('renders guide when onboarded with active objective', () => {
    const state = createFreshObservatoryState();
    const onboarded = dismissOnboarding(state);

    (useStore as any).mockImplementation((selector: any) => {
      const store: any = {
        observatoryState: onboarded,
        tick: 0,
        selectedTile: null,
        followedLineages: [],
        worldState: null,
        constants: {},
        setObservatoryState: vi.fn(),
        setRunning: vi.fn(),
      };
      return selector(store);
    });

    render(<ObservatoryGuide />);
    expect(screen.getByText('Observe a Trend')).toBeTruthy();
  });

  it('displays hint and description for active objective', () => {
    const state = createFreshObservatoryState();
    const onboarded = dismissOnboarding(state);

    (useStore as any).mockImplementation((selector: any) => {
      const store: any = {
        observatoryState: onboarded,
        tick: 0,
        selectedTile: null,
        followedLineages: [],
        worldState: null,
        constants: {},
        setObservatoryState: vi.fn(),
        setRunning: vi.fn(),
      };
      return selector(store);
    });

    render(<ObservatoryGuide />);
    expect(screen.getByText(/Watch the ecosystem change in real time/)).toBeTruthy();
    expect(screen.getByText(/Watch the colored dots/)).toBeTruthy();
  });

  it('shows skip button', () => {
    const state = createFreshObservatoryState();
    const onboarded = dismissOnboarding(state);

    (useStore as any).mockImplementation((selector: any) => {
      const store: any = {
        observatoryState: onboarded,
        tick: 0,
        selectedTile: null,
        followedLineages: [],
        worldState: null,
        constants: {},
        setObservatoryState: vi.fn(),
        setRunning: vi.fn(),
      };
      return selector(store);
    });

    render(<ObservatoryGuide />);
    expect(screen.getByText('Skip this step')).toBeTruthy();
  });

  it('can dismiss guide by clicking close button', async () => {
    const state = createFreshObservatoryState();
    const onboarded = dismissOnboarding(state);

    (useStore as any).mockImplementation((selector: any) => {
      const store: any = {
        observatoryState: onboarded,
        tick: 0,
        selectedTile: null,
        followedLineages: [],
        worldState: null,
        constants: {},
        setObservatoryState: vi.fn(),
        setRunning: vi.fn(),
      };
      return selector(store);
    });

    render(<ObservatoryGuide />);

    // Click close button
    const closeButton = screen.getByLabelText('Dismiss');
    fireEvent.click(closeButton);

    // Guide should collapse to toggle button
    await waitFor(() => {
      expect(screen.getByLabelText('Show guide')).toBeTruthy();
    });
  });

  it('shows progress bar with completion percentage', () => {
    const state = createFreshObservatoryState();
    const onboarded = dismissOnboarding(state);
    const withProgress = {
      ...onboarded,
      objectives: {
        ...onboarded.objectives,
        observe: { ...onboarded.objectives.observe, isCompleted: true },
      },
    };

    (useStore as any).mockImplementation((selector: any) => {
      const store: any = {
        observatoryState: withProgress,
        tick: 50,
        selectedTile: null,
        followedLineages: [],
        worldState: null,
        constants: {},
        setObservatoryState: vi.fn(),
        setRunning: vi.fn(),
      };
      return selector(store);
    });

    render(<ObservatoryGuide />);
    expect(screen.getByText(/1\/4 complete/)).toBeTruthy();
  });

  it('collapses to toggle button and can re-expand', async () => {
    const state = createFreshObservatoryState();
    const onboarded = dismissOnboarding(state);

    const mockSetObservatoryState = vi.fn();

    (useStore as any).mockImplementation((selector: any) => {
      const store: any = {
        observatoryState: onboarded,
        tick: 0,
        selectedTile: null,
        followedLineages: [],
        worldState: null,
        constants: {},
        setObservatoryState: mockSetObservatoryState,
        setRunning: vi.fn(),
      };
      return selector(store);
    });

    const { rerender } = render(<ObservatoryGuide />);

    // Close the guide
    const closeButton = screen.getByLabelText('Dismiss');
    fireEvent.click(closeButton);

    // Open again
    await waitFor(() => {
      expect(screen.getByLabelText('Show guide')).toBeTruthy();
    });

    const toggleButton = screen.getByLabelText('Show guide');
    fireEvent.click(toggleButton);

    // Should expand again
    await waitFor(() => {
      expect(screen.getByText('Observe a Trend')).toBeTruthy();
    });
  });
});
