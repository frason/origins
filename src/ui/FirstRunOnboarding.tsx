import { useEffect, useState } from 'react';
import { useStore } from '../state/store';

export default function FirstRunOnboarding() {
  const tick = useStore((state) => state.tick);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('origins_onboarding_dismissed');
    if (stored) {
      setDismissed(true);
    }
  }, []);

  if (dismissed || tick > 0) {
    return null;
  }

  const handleDismiss = () => {
    localStorage.setItem('origins_onboarding_dismissed', 'true');
    setDismissed(true);
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
              <span className="first-run-onboarding__swatch" style={{ background: '#d89c3d' }} />
              <span>Different hues = different species</span>
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
