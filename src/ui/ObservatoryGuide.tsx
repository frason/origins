import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import type { ObservatoryState } from './observatoryObjectives';
import {
  dismissOnboarding,
  skipObjective,
  completeObjective,
  saveObservatoryState,
} from './observatoryObjectives';

export default function ObservatoryGuide() {
  const observatoryState = useStore((s) => s.observatoryState);
  const tick = useStore((s) => s.tick);
  const selectedTile = useStore((s) => s.selectedTile);
  const followedLineages = useStore((s) => s.followedLineages);
  const worldState = useStore((s) => s.worldState);
  const setObservatoryState = useStore((s) => s.setObservatoryState);
  const constants = useStore((s) => s.constants);
  const setRunning = useStore((s) => s.setRunning);

  const [expanded, setExpanded] = useState(true);
  const [completedAtTick, setCompletedAtTick] = useState<number | null>(null);

  // Auto-mark inspection as complete when player inspects a tile or follows a lineage
  useEffect(() => {
    if (
      observatoryState &&
      !observatoryState.objectives.inspect.isCompleted &&
      !observatoryState.objectives.inspect.isSkipped &&
      observatoryState.currentObjective === 'inspect' &&
      (selectedTile !== null || followedLineages.length > 0)
    ) {
      const updated = completeObjective(observatoryState, 'inspect', tick);
      setObservatoryState(updated);
      saveObservatoryState(updated);
    }
  }, [selectedTile, followedLineages, observatoryState, tick, setObservatoryState]);

  // Auto-mark observation as complete after watching for 50+ ticks
  useEffect(() => {
    if (
      observatoryState &&
      !observatoryState.objectives.observe.isCompleted &&
      !observatoryState.objectives.observe.isSkipped &&
      observatoryState.currentObjective === 'observe' &&
      tick > 50
    ) {
      const updated = completeObjective(observatoryState, 'observe', tick);
      setObservatoryState(updated);
      saveObservatoryState(updated);
    }
  }, [tick, observatoryState, setObservatoryState]);

  // Auto-mark intervention as complete when settings change
  useEffect(() => {
    if (
      observatoryState &&
      !observatoryState.objectives.intervene.isCompleted &&
      !observatoryState.objectives.intervene.isSkipped &&
      observatoryState.currentObjective === 'intervene' &&
      constants
    ) {
      // Check if any constants differ from defaults (rough check)
      // This is heuristic; a more precise check would track intervention events
      const hasInterventionBeenMade = worldState?.events?.some(
        (e) => e.type === 'intervention'
      ) ?? false;

      if (hasInterventionBeenMade) {
        const updated = completeObjective(observatoryState, 'intervene', tick);
        setObservatoryState(updated);
        saveObservatoryState(updated);
      }
    }
  }, [worldState?.events, observatoryState, tick, setObservatoryState, constants]);

  // Auto-mark evaluation as complete after reviewing intervention impact (heuristic: 20+ ticks after intervention)
  useEffect(() => {
    if (
      observatoryState &&
      !observatoryState.objectives.evaluate.isCompleted &&
      !observatoryState.objectives.evaluate.isSkipped &&
      observatoryState.currentObjective === 'evaluate' &&
      worldState?.events
    ) {
      const lastInterventionTick = worldState.events
        .filter((e) => e.type === 'intervention')
        .map((e) => e.tick)
        .sort((a, b) => (b ?? 0) - (a ?? 0))[0];

      if (lastInterventionTick !== undefined && tick - lastInterventionTick > 20) {
        const updated = completeObjective(observatoryState, 'evaluate', tick);
        setObservatoryState(updated);
        saveObservatoryState(updated);
      }
    }
  }, [worldState?.events, tick, observatoryState, setObservatoryState]);

  if (
    observatoryState === null ||
    !observatoryState.isOnboarded ||
    observatoryState.allCompleted ||
    observatoryState.currentObjective === null
  ) {
    return null;
  }

  const currentObj = observatoryState.objectives[observatoryState.currentObjective];

  const handleSkip = () => {
    if (observatoryState && observatoryState.currentObjective) {
      const updated = skipObjective(
        observatoryState,
        observatoryState.currentObjective,
        tick
      );
      setObservatoryState(updated);
      saveObservatoryState(updated);
    }
  };

  const handleDismiss = () => {
    setExpanded(false);
  };

  return (
    <div className={`observatory-guide ${expanded ? 'observatory-guide--expanded' : 'observatory-guide--collapsed'}`}>
      {expanded && (
        <div className="observatory-guide__content">
          <div className="observatory-guide__header">
            <h3 className="observatory-guide__title">{currentObj.title}</h3>
            <button
              className="observatory-guide__close"
              type="button"
              aria-label="Dismiss"
              onClick={handleDismiss}
            >
              ×
            </button>
          </div>

          <p className="observatory-guide__description">{currentObj.description}</p>

          <div className="observatory-guide__hint">
            <strong>Hint:</strong> {currentObj.hint}
          </div>

          <div className="observatory-guide__progress">
            <div className="observatory-guide__progress-bar">
              <div
                className="observatory-guide__progress-fill"
                style={{
                  width: `${(
                    Object.values(observatoryState.objectives).filter((o) => o.isCompleted).length /
                    4
                  ) * 100}%`,
                }}
              />
            </div>
            <span className="observatory-guide__progress-text">
              {Object.values(observatoryState.objectives).filter((o) => o.isCompleted).length}/4 complete
            </span>
          </div>

          <div className="observatory-guide__actions">
            <button
              className="observatory-guide__action observatory-guide__action--skip"
              type="button"
              onClick={handleSkip}
            >
              Skip this step
            </button>
          </div>
        </div>
      )}

      {!expanded && (
        <button
          className="observatory-guide__toggle"
          type="button"
          aria-label="Show guide"
          onClick={() => setExpanded(true)}
          title={currentObj.title}
        >
          ?
        </button>
      )}
    </div>
  );
}
