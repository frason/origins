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

interface TurningPointDialogProps {
  turningPoint: TurningPoint;
  recommendations: GodModeRecommendation[];
  onApply: (recommendation: GodModeRecommendation) => void;
  onIntroduceSpecies: () => void;
  onDoNothing: () => void;
}

/** Presentational dialog content, kept free of store/portal wiring so it is unit-testable. */
export const TurningPointDialog = forwardRef<HTMLDivElement, TurningPointDialogProps>(
  function TurningPointDialog(
    { turningPoint, recommendations, onApply, onIntroduceSpecies, onDoNothing },
    dialogRef
  ) {
    return (
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="turning-point-choice"
        role="dialog"
        aria-modal="true"
        aria-labelledby="turning-point-choice-title"
      >
        <div className="turning-point-choice__card sim-window">
          <div className={`turning-point-choice__eyebrow turning-point-choice__eyebrow--${turningPoint.tone}`}>
            {turningPoint.dimension.toUpperCase()} TURNING POINT
          </div>
          <h2 className="turning-point-choice__title" id="turning-point-choice-title">
            {turningPoint.title}
          </h2>
          <p className="turning-point-choice__detail">{turningPoint.detail}</p>
          <p className="turning-point-choice__paused">
            The simulation is paused. Choose how to respond.
          </p>

          {recommendations.length === 0 ? (
            <p className="turning-point-choice__empty">
              No specific stewardship suggestion is available right now.
            </p>
          ) : (
            recommendations.map((recommendation) => (
              <article className="turning-point-choice__recommendation sim-panel" key={recommendation.id}>
                <h3 className="turning-point-choice__recommendation-title">{recommendation.title}</h3>
                <p>{recommendation.reason}</p>
                {recommendation.changes.map((item) => (
                  <div className="turning-point-choice__change sim-data" key={item.constant}>
                    <span>{item.label}</span><span>{item.before} → {item.after}</span>
                  </div>
                ))}
                {recommendation.changes.length > 0 && (
                  <button
                    type="button"
                    className="sim-button turning-point-choice__wide-button"
                    onClick={() => onApply(recommendation)}
                  >
                    Apply
                  </button>
                )}
              </article>
            ))
          )}

          <div className="turning-point-choice__actions">
            <button type="button" className="sim-button" onClick={onIntroduceSpecies}>
              Introduce species
            </button>
            <button type="button" className="sim-button" onClick={onDoNothing}>
              Do nothing
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
 * A turning point pauses the sim and asks for an explicit decision instead of
 * announcing itself as a toast that times out unanswered.
 */
export default function TurningPointChoice({ onIntroduceSpecies }: TurningPointChoiceProps) {
  const world = useStore((state) => state.worldState);
  const tick = useStore((state) => state.tick);
  const constants = useStore((state) => state.constants);
  const setRunning = useStore((state) => state.setRunning);
  const updateConstants = useStore((state) => state.updateConstants);
  const trajectories = getEcosystemTrajectories(world, tick);
  const candidate = selectTurningPoint(trajectories);
  const [turningPoint, setTurningPoint] = useState<TurningPoint | null>(null);
  const lastAnnounced = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const announcement = nextTurningPointAnnouncement(lastAnnounced.current, candidate);
    lastAnnounced.current = announcement.lastId;
    if (!announcement.notice) return;
    setRunning(false);
    setTurningPoint(announcement.notice);
  }, [candidate?.id, setRunning]);

  useEffect(() => {
    if (!turningPoint) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const app = document.querySelector('.app-shell');
    const previousAriaHidden = app?.getAttribute('aria-hidden') ?? null;
    app?.setAttribute('aria-hidden', 'true');
    app?.setAttribute('inert', '');
    dialogRef.current?.focus();

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTurningPoint(null);
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled])'
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('keydown', handleKeydown);
      app?.removeAttribute('inert');
      if (previousAriaHidden === null) app?.removeAttribute('aria-hidden');
      else app?.setAttribute('aria-hidden', previousAriaHidden);
      previousFocus?.focus();
    };
  }, [turningPoint]);

  if (!turningPoint) return null;

  const recommendations = getGodModeRecommendations(
    getEcosystemPressures(world, tick, constants),
    trajectories,
    constants
  );

  return createPortal(
    <TurningPointDialog
      ref={dialogRef}
      turningPoint={turningPoint}
      recommendations={recommendations}
      onApply={(recommendation) => {
        updateConstants(recommendationPatch(recommendation));
        setRunning(true);
        setTurningPoint(null);
      }}
      onIntroduceSpecies={() => {
        setTurningPoint(null);
        onIntroduceSpecies?.();
      }}
      onDoNothing={() => {
        setRunning(true);
        setTurningPoint(null);
      }}
    />,
    document.body
  );
}
