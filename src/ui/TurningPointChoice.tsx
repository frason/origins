import { forwardRef, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../state/store';
import { getEcosystemPressures } from './ecosystemPressures';
import { getEcosystemTrajectories } from './ecosystemTrajectory';
import {
  getGodModeRecommendations,
  recommendationPatch,
  type GodModeRecommendation,
} from './godModeRecommendations';
import {
  nextTurningPointAnnouncement,
  selectTurningPoint,
  type TurningPointNotice as TurningPoint,
} from './turningPointModel';

interface TurningPointToastProps {
  turningPoint: TurningPoint;
  recommendations: GodModeRecommendation[];
  onApply: (recommendation: GodModeRecommendation) => void;
  onIntroduceSpecies: () => void;
  onDoNothing: () => void;
  onDismiss: () => void;
}

/** Non-blocking toast notification for turning points. */
export const TurningPointToast = forwardRef<HTMLDivElement, TurningPointToastProps>(
  function TurningPointToast(
    { turningPoint, recommendations, onApply, onIntroduceSpecies, onDoNothing, onDismiss },
    toastRef
  ) {
    return (
      <div
        ref={toastRef}
        className="turning-point-choice turning-point-choice--toast"
        role="status"
        aria-live="assertive"
        aria-labelledby="turning-point-toast-title"
      >
        <div className="turning-point-choice__card">
          <div className="turning-point-choice__toast-header">
            <div>
              <div className={`turning-point-choice__eyebrow turning-point-choice__eyebrow--${turningPoint.tone}`}>
                {turningPoint.dimension.toUpperCase()} TURNING POINT
              </div>
              <h3 className="turning-point-choice__title" id="turning-point-toast-title">
                {turningPoint.title}
              </h3>
            </div>
            <button
              type="button"
              className="turning-point-choice__close"
              onClick={onDismiss}
              aria-label="Dismiss turning point notification"
            >
              ✕
            </button>
          </div>
          <p className="turning-point-choice__detail">{turningPoint.detail}</p>

          <div className="turning-point-choice__toast-actions">
            {recommendations.length > 0 && (
              <button
                type="button"
                className="sim-button sim-button--compact"
                onClick={() => onApply(recommendations[0])}
                title={recommendations[0].reason}
              >
                Apply: {recommendations[0].title.substring(0, 20)}
              </button>
            )}
            <button
              type="button"
              className="sim-button sim-button--compact"
              onClick={onIntroduceSpecies}
            >
              Introduce
            </button>
            <button
              type="button"
              className="sim-button sim-button--compact"
              onClick={onDoNothing}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }
);

interface TurningPointChoiceProps {
  onIntroduceSpecies?: () => void;
}

/**
 * A turning point displays as a non-blocking toast notification.
 * The simulation continues running. User can click a button to respond,
 * or dismiss the toast with Escape or the close button. Auto-dismisses after 10 seconds.
 */
export default function TurningPointChoice({ onIntroduceSpecies }: TurningPointChoiceProps) {
  const world = useStore((state) => state.worldState);
  const tick = useStore((state) => state.tick);
  const constants = useStore((state) => state.constants);
  const updateConstants = useStore((state) => state.updateConstants);
  const trajectories = getEcosystemTrajectories(world, tick);
  const candidate = selectTurningPoint(trajectories);
  const [turningPoint, setTurningPoint] = useState<TurningPoint | null>(null);
  const lastAnnounced = useRef<string | null>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const announcement = nextTurningPointAnnouncement(lastAnnounced.current, candidate);
    lastAnnounced.current = announcement.lastId;
    if (!announcement.notice) {
      setTurningPoint(null);
      return;
    }
    // Show the toast but don't pause the simulation
    setTurningPoint(announcement.notice);

    // Auto-dismiss after 10 seconds
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
    }
    dismissTimeoutRef.current = setTimeout(() => {
      setTurningPoint(null);
    }, 10000);
  }, [candidate?.id]);

  useEffect(() => {
    if (!turningPoint) return;

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTurningPoint(null);
        if (dismissTimeoutRef.current) {
          clearTimeout(dismissTimeoutRef.current);
        }
      }
    };
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [turningPoint]);

  if (!turningPoint) return null;

  const recommendations = getGodModeRecommendations(
    getEcosystemPressures(world, tick, constants),
    trajectories,
    constants
  );

  const handleDismiss = () => {
    setTurningPoint(null);
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
    }
  };

  return createPortal(
    <TurningPointToast
      ref={toastRef}
      turningPoint={turningPoint}
      recommendations={recommendations}
      onApply={(recommendation) => {
        updateConstants(recommendationPatch(recommendation));
        handleDismiss();
      }}
      onIntroduceSpecies={() => {
        handleDismiss();
        onIntroduceSpecies?.();
      }}
      onDoNothing={() => {
        handleDismiss();
      }}
      onDismiss={handleDismiss}
    />,
    document.body
  );
}
