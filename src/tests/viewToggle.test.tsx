import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import { useStore } from '../state/store';

// Mock the Vitest worker to prevent worker initialization issues in tests
vi.mock('../simulation/engineWorkerProxy', () => ({
  useEngineWorkerProxy: vi.fn(() => ({ isReady: true })),
}));

// We need to mock browser APIs and components that aren't relevant to this test
vi.mock('../ui/LiveThreeWorldView', () => ({
  default: () => <div data-testid="live-three-world-view">3D View</div>,
}));

vi.mock('../ui/WorldView', () => ({
  default: () => <div data-testid="world-view">2D View</div>,
}));

vi.mock('../ui/ControlPanel', () => ({
  default: () => <div>Control Panel</div>,
}));

vi.mock('../ui/SpeciesPanel', () => ({
  default: () => <div>Species Panel</div>,
}));

vi.mock('../ui/StatsPanel', () => ({
  default: () => <div>Stats Panel</div>,
}));

vi.mock('../ui/TileInfoPanel', () => ({
  default: () => <div>Tile Info</div>,
}));

vi.mock('../ui/ExtinctionSummary', () => ({
  default: () => <div>Extinction Summary</div>,
}));

vi.mock('../ui/TurningPointChoice', () => ({
  default: () => <div>Turning Point</div>,
}));

vi.mock('../ui/FirstRunOnboarding', () => ({
  default: () => <div>Onboarding</div>,
}));

vi.mock('../ui/EventTimeline', () => ({
  default: () => <div>Timeline</div>,
}));

vi.mock('../ui/LineageHistory', () => ({
  default: () => <div>Lineage</div>,
}));

vi.mock('../ui/WorldLegend', () => ({
  default: () => <div>Legend</div>,
}));

vi.mock('../ui/EvolutionRibbon', () => ({
  default: () => <div>Evolution Ribbon</div>,
}));

vi.mock('../ui/SettingsPanel', () => ({
  default: (props: any) => <div>{props.children}</div>,
}));

vi.mock('../ui/EcosystemPressurePanel', () => ({
  default: () => <div>Pressure</div>,
}));

vi.mock('../ui/FollowedLineageNotices', () => ({
  default: () => <div>Notices</div>,
}));

vi.mock('../ui/FieldJournal', () => ({
  default: () => <div>Journal</div>,
}));

vi.mock('../ui/AdaptationEvidence', () => ({
  default: () => <div>Evidence</div>,
}));

vi.mock('../ui/ObservatoryGuide', () => ({
  default: () => <div>Guide</div>,
}));

vi.mock('../ui/BetaFeedbackPanel', () => ({
  default: () => <div>Feedback Panel</div>,
}));

vi.mock('../ui/AlertBanner', () => ({
  default: () => <div>Alert</div>,
}));

vi.mock('../ui/CompareAlert', () => ({
  default: () => <div>Compare</div>,
}));

vi.mock('../ui/ChallengePanel', () => ({
  default: () => <div>Challenge</div>,
}));

vi.mock('../ui/WatchesPanel', () => ({
  default: () => <div>Watches</div>,
}));

vi.mock('../ui/LLMSettingsPanel', () => ({
  default: () => <div>LLM</div>,
}));

vi.mock('../ui/SimWindow', () => ({
  default: (props: any) => (
    <div data-testid="sim-window">
      <div className="app-shell__window" data-testid="sim-window-header">
        {props.controls}
      </div>
      {props.children}
    </div>
  ),
}));

vi.mock('../services/betaFeedbackClient', () => ({
  loadBetaFeedbackBackend: vi.fn(() => null),
}));

vi.mock('../services/betaWorldBackupClient', () => ({
  loadBetaWorldBackupBackend: vi.fn(() => null),
}));

vi.mock('../prototype/Phase0Harness', () => ({
  default: () => <div>Phase0</div>,
}));

describe('2D/3D View Toggle', () => {
  beforeEach(() => {
    // Reset the store state before each test
    useStore.setState({
      show2dView: false,
    });
  });

  it('renders the toggle button with correct initial state (showing 2D label when 3D is active)', () => {
    render(<App />);
    const toggleButton = screen.getByTestId('toggle-view-button');
    expect(toggleButton).toBeInTheDocument();
    expect(toggleButton).toHaveTextContent('2D');
    expect(toggleButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles the view when the button is clicked', async () => {
    const { container } = render(<App />);
    const toggleButton = screen.getByTestId('toggle-view-button');

    // Initially, 3D view should be visible
    expect(toggleButton).toHaveTextContent('2D');
    expect(toggleButton).toHaveAttribute('aria-pressed', 'false');

    // Click to switch to 2D view
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(toggleButton).toHaveTextContent('3D');
      expect(toggleButton).toHaveAttribute('aria-pressed', 'true');
    });

    // Verify the main world element has data-view-mode attribute
    const worldElement = container.querySelector('[data-view-mode]');
    expect(worldElement).toHaveAttribute('data-view-mode', '2d');

    // Click to switch back to 3D view
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(toggleButton).toHaveTextContent('2D');
      expect(toggleButton).toHaveAttribute('aria-pressed', 'false');
      expect(worldElement).toHaveAttribute('data-view-mode', '3d');
    });
  });

  it('toggles view when M key is pressed', async () => {
    const { container } = render(<App />);
    const toggleButton = screen.getByTestId('toggle-view-button');

    expect(toggleButton).toHaveAttribute('aria-pressed', 'false');

    // Simulate pressing 'M' key
    fireEvent.keyDown(window, { key: 'm', code: 'KeyM' });

    await waitFor(() => {
      expect(toggleButton).toHaveAttribute('aria-pressed', 'true');
    });

    // Press M again to toggle back
    fireEvent.keyDown(window, { key: 'm', code: 'KeyM' });

    await waitFor(() => {
      expect(toggleButton).toHaveAttribute('aria-pressed', 'false');
    });
  });

  it('does not toggle view when M key is pressed with modifier keys', async () => {
    const { container } = render(<App />);
    const toggleButton = screen.getByTestId('toggle-view-button');

    expect(toggleButton).toHaveAttribute('aria-pressed', 'false');

    // Simulate pressing 'Ctrl+M' (should not toggle)
    fireEvent.keyDown(window, { key: 'm', code: 'KeyM', ctrlKey: true });

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(toggleButton).toHaveAttribute('aria-pressed', 'false');

    // Simulate pressing 'Meta+M' (should not toggle)
    fireEvent.keyDown(window, { key: 'm', code: 'KeyM', metaKey: true });

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(toggleButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not toggle when M key is pressed inside an input', async () => {
    render(<App />);
    const toggleButton = screen.getByTestId('toggle-view-button');

    // Create an input element and focus it
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    expect(toggleButton).toHaveAttribute('aria-pressed', 'false');

    // Simulate pressing 'M' key while focused on input
    fireEvent.keyDown(input, { key: 'm', code: 'KeyM' });

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(toggleButton).toHaveAttribute('aria-pressed', 'false');

    document.body.removeChild(input);
  });

  it('displays the correct view based on show2dView state', async () => {
    const { rerender } = render(<App />);

    // 3D view should be rendered
    let threeView = screen.getByTestId('live-three-world-view');
    expect(threeView).toBeInTheDocument();
    expect(screen.queryByTestId('world-view')).not.toBeInTheDocument();

    // Toggle to 2D view
    const toggleButton = screen.getByTestId('toggle-view-button');
    fireEvent.click(toggleButton);

    await waitFor(() => {
      // 2D view should be rendered
      const twoView = screen.getByTestId('world-view');
      expect(twoView).toBeInTheDocument();
      expect(screen.queryByTestId('live-three-world-view')).not.toBeInTheDocument();
    });
  });
});
