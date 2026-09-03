import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { rgbToCss, strategyColor } from './creatureColor';
import {
  createFreshObservatoryState,
  dismissOnboarding,
  saveObservatoryState,
} from './observatoryObjectives';

export default function FirstRunOnboarding() {
  const tick = useStore((state) => state.tick);
  const setRunning = useStore((state) => state.setRunning);
  const observatoryState = useStore((state) => state.observatoryState);
  const setObservatoryState = useStore((state) => state.setObservatoryState);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check old onboarding state for backwards compatibility
    const stored = localStorage.getItem('origins_onboarding_dismissed');
    if (stored) {
      setDismissed(true);
    }
  }, []);

  if (dismissed || tick > 0 || (observatoryState?.isOnboarded)) {
    return null;
  }

  // "Start simulation" is a promise: dismissing the modal also starts the run,
  // rather than leaving the world paused behind it.
  const handleDismiss = () => {
    localStorage.setItem('origins_onboarding_dismissed', 'true');
    setDismissed(true);

    // Update observatory state to mark onboarding complete
    // This ensures the guided play loop can start
    if (observatoryState === null) {
      // If state hasn't been loaded yet, create fresh
      const fresh = createFreshObservatoryState();
      const onboarded = dismissOnboarding(fresh);
      setObservatoryState(onboarded);
      saveObservatoryState(onboarded);
    } else if (!observatoryState.isOnboarded) {
      // If state was loaded but not onboarded, update it
      const onboarded = dismissOnboarding(observatoryState);
      setObservatoryState(onboarded);
      saveObservatoryState(onboarded);
    }
    // If observatoryState.isOnboarded is already true, do nothing
    // (guide has already started or this is a resumption)

    setRunning(true);
  };

  return (
    <dialog className="first-run-onboarding" open>
      <div className="first-run-onboarding__content">
        <h1 className="first-run-onboarding__title">Welcome to Project Origins</h1>
        <p className="first-run-onboarding__subtitle">A living world simulator</p>

        <div className="first-run-onboarding__section">
          <h2>What you're looking at</h2>
          <p>The grid shows your world's terrain and ecosystem. Each colored dot is a creature.</p>

          <div className="first-run-onboarding__legend">
            <div className="first-run-onboarding__legend-item">
              <span className="first-run-onboarding__swatch first-run-onboarding__swatch--diet" style={{ background: rgbToCss(strategyColor('herbivore')) }} />
              <span>Blue = herbivore, red = carnivore</span>
            </div>
            <div className="first-run-onboarding__legend-item">
              <span className="first-run-onboarding__swatch first-run-onboarding__swatch--diet" style={{ background: rgbToCss(strategyColor('scavenger')) }} />
              <span>Amber = omnivore, violet = scavenger</span>
            </div>
            <div className="first-run-onboarding__legend-item">
              <span className="first-run-onboarding__swatch" style={{ background: 'linear-gradient(135deg, #26313a 0 45%, #f2e5bd 55% 100%)' }} />
              <span>Light and dark = terrain height</span>
            </div>
            <div className="first-run-onboarding__legend-item">
              <span className="first-run-onboarding__swatch" style={{ background: '#2d8d45' }} />
              <span>Green tint = plant food available</span>
            </div>
            <div className="first-run-onboarding__legend-item">
              <span className="first-run-onboarding__swatch" style={{ background: '#692d78' }} />
              <span>Purple overlay = toxic zones</span>
            </div>
          </div>
        </div>

        <div className="first-run-onboarding__section">
          <h2>How to play</h2>
          <ul className="first-run-onboarding__list">
            <li><strong>Watch:</strong> See how the ecosystem changes in real time</li>
            <li><strong>Diagnose:</strong> Explore why changes are happening</li>
            <li><strong>Act:</strong> Use God Mode to guide evolution</li>
            <li><strong>Remember:</strong> Track individual lineages across generations</li>
          </ul>
        </div>

        <div className="first-run-onboarding__actions">
          <button
            type="button"
            className="sim-button"
            onClick={handleDismiss}
          >
            Start simulation
          </button>
        </div>
      </div>
    </dialog>
  );
}
