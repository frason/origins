import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { BALANCED_LONGEVITY_PRESET } from '../utils/constants';
import type { EnergyStrategy } from '../utils/traits';
import { parseWorldSeed } from './worldSeed';
import { getEcosystemPressures } from './ecosystemPressures';
import { getEcosystemTrajectories } from './ecosystemTrajectory';
import { getGodModeRecommendations, recommendationPatch } from './godModeRecommendations';
import { defaultValueFor, GOD_MODE_GROUPS, type GodModeSliderConfig } from './godModeControls';
import {
  MAX_SPECIES_NAME_LENGTH,
  suggestedIntroducedSpeciesName,
} from '../simulation/speciesNames';

interface ControlPanelProps {
  onReset?: () => void;
  onNewWorld?: (seed: number) => void;
  worldSeed?: number;
  onIntroduceSpecies?: (strategy: EnergyStrategy, name: string) => string | null;
  replayActive?: boolean;
}

function GodModeSlider({ config, disabled }: { config: GodModeSliderConfig; disabled: boolean }) {
  const value = useStore((state) => state.constants[config.key]);
  const updateConstants = useStore((state) => state.updateConstants);
  const displayValue = config.formatter ? config.formatter(value) : Math.round(value * 100) / 100;
  const defaultValue = defaultValueFor(config);
  const listId = `god-mode-${config.key}-defaults`;

  return (
    <label className="control-panel__slider">
      <span className="control-panel__slider-heading">
        <span>{config.label}</span>
        <output className="control-panel__slider-value sim-data">{displayValue}</output>
      </span>
      <input
        className="control-panel__range"
        type="range"
        disabled={disabled}
        min={config.min}
        max={config.max}
        step={config.step}
        value={value}
        list={listId}
        onChange={(event) => updateConstants({ [config.key]: Number(event.target.value) })}
      />
      <datalist id={listId}>
        <option value={defaultValue} label={`Default ${defaultValue}`} />
      </datalist>
      <span className="control-panel__default sim-data">Default: {defaultValue}</span>
    </label>
  );
}

export default function ControlPanel({
  onReset,
  onNewWorld,
  worldSeed = 12345,
  onIntroduceSpecies,
  replayActive = false,
}: ControlPanelProps) {
  const tick = useStore((state) => state.tick);
  const world = useStore((state) => state.worldState);
  const isRunning = useStore((state) => state.isRunning);
  const speed = useStore((state) => state.speed);
  const constants = useStore((state) => state.constants);
  const setRunning = useStore((state) => state.setRunning);
  const setSpeed = useStore((state) => state.setSpeed);
  const updateConstants = useStore((state) => state.updateConstants);
  const resetConstants = useStore((state) => state.resetConstants);
  const [showGodMode, setShowGodMode] = useState(false);
  const [introductionStrategy, setIntroductionStrategy] = useState<EnergyStrategy>('herbivore');
  const [introductionName, setIntroductionName] = useState('');
  const [introductionMessage, setIntroductionMessage] = useState<string | null>(null);
  const [seedDraft, setSeedDraft] = useState(String(worldSeed));
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [recommendationMessage, setRecommendationMessage] = useState<string | null>(null);

  const recommendations = showGodMode
    ? getGodModeRecommendations(
        getEcosystemPressures(world, tick, constants),
        getEcosystemTrajectories(world, tick),
        constants
      )
    : [];
  const introductionNumber = (world?.events ?? []).filter(
    (event) => event.interventionKind === 'species-introduction'
  ).length + 1;
  const suggestedName = suggestedIntroducedSpeciesName(
    introductionStrategy,
    introductionNumber
  );

  useEffect(() => setSeedDraft(String(worldSeed)), [worldSeed]);

  const startNewWorld = () => {
    if (!onNewWorld) return;
    const result = parseWorldSeed(seedDraft);
    if (result.seed === null) {
      setSeedMessage(result.message);
      return;
    }
    onNewWorld(result.seed);
    setSeedDraft(String(result.seed));
    setSeedMessage(
      result.message
        ? `Started seed ${result.seed.toLocaleString()}. ${result.message}`
        : `Started seed ${result.seed.toLocaleString()}`
    );
  };

  return (
    <section className="control-panel sim-panel" aria-labelledby="simulation-controls-title">
      <h2 className="sim-panel__heading" id="simulation-controls-title">Simulation</h2>
      <div className="control-panel__transport">
        <button
          className={`sim-button${isRunning ? ' sim-button--pressed' : ''}`}
          type="button"
          aria-pressed={isRunning}
          onClick={() => setRunning(!isRunning)}
        >
          {isRunning ? 'Pause' : 'Play'}
        </button>
        {onReset && <button className="sim-button" type="button" onClick={onReset}>Replay seed</button>}
        <output className="control-panel__tick sim-data">Tick {tick.toLocaleString()}</output>
      </div>

      <label className="control-panel__field">
        <span>Speed <span className="sim-data">{speed}×</span></span>
        <input className="control-panel__range" type="range" min="1" max="20" step="1" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />
      </label>

      {onNewWorld && (
        <section className="control-panel__section" aria-labelledby="world-seed-title">
          <h3 className="control-panel__section-title" id="world-seed-title">World seed</h3>
          <div className="control-panel__field-row">
            <input
              className="control-panel__input sim-data"
              id="world-seed"
              aria-label="World seed"
              inputMode="numeric"
              value={seedDraft}
              onChange={(event) => { setSeedDraft(event.target.value); setSeedMessage(null); }}
            />
            <button className="sim-button" type="button" onClick={startNewWorld}>New world</button>
          </div>
          <div className={`control-panel__status ${seedMessage?.startsWith('Started') ? 'sim-status--positive' : 'sim-status--warning'}`} role="status">
            {seedMessage ?? `Active seed: ${worldSeed.toLocaleString()}`}
          </div>
        </section>
      )}

      <button
        className={`sim-button control-panel__god-mode-toggle${showGodMode ? ' sim-button--pressed' : ''}`}
        type="button"
        aria-expanded={showGodMode}
        aria-controls="god-mode-controls"
        onClick={() => setShowGodMode((visible) => !visible)}
      >
        {showGodMode ? 'Hide God Mode' : 'Open God Mode'}
      </button>

      {showGodMode && (
        <section className="control-panel__god-mode sim-panel sim-panel--sunken" id="god-mode-controls" aria-labelledby="god-mode-title">
          <h3 className="control-panel__section-title" id="god-mode-title">God Mode / Intervention</h3>
          <p className="control-panel__help">
            {replayActive ? 'Recipe replay controls these values until playback completes.' : 'Changes apply on the next tick and are recorded in world history.'}
          </p>
          <div className="control-panel__field-row">
            <button className="sim-button" type="button" disabled={replayActive} onClick={() => updateConstants(BALANCED_LONGEVITY_PRESET)}>Apply longevity</button>
            <button className="sim-button" type="button" disabled={replayActive} onClick={resetConstants}>Reset defaults</button>
          </div>

          {recommendations.length > 0 && (
            <section className="control-panel__section" aria-labelledby="stewardship-title">
              <h4 className="control-panel__section-title" id="stewardship-title">Stewardship suggestions</h4>
              <p className="control-panel__help">Optional responses to measured conditions—not automatic fixes.</p>
              {recommendations.map((recommendation) => (
                <article className="control-panel__recommendation sim-panel" key={recommendation.id}>
                  <h5 className="control-panel__recommendation-title">{recommendation.title}</h5>
                  <p>{recommendation.reason}</p>
                  {recommendation.guidance && <p className="sim-status--warning">{recommendation.guidance}</p>}
                  {recommendation.changes.map((item) => (
                    <div className="control-panel__change sim-data" key={item.constant}>
                      <span>{item.label}</span><span>{item.before} → {item.after}</span>
                    </div>
                  ))}
                  {recommendation.changes.length > 0 && (
                    <button
                      className="sim-button control-panel__wide-button"
                      type="button"
                      disabled={replayActive}
                      onClick={() => {
                        updateConstants(recommendationPatch(recommendation));
                        setRecommendationMessage(`${recommendation.title} queued for the next tick`);
                      }}
                    >
                      Apply these changes
                    </button>
                  )}
                </article>
              ))}
              <div className="control-panel__status sim-status--positive" role="status">{recommendationMessage}</div>
            </section>
          )}

          {onIntroduceSpecies && (
            <section className="control-panel__section" aria-labelledby="introduce-species-title">
              <h4 className="control-panel__section-title" id="introduce-species-title">Introduce species</h4>
              <p className="control-panel__help">Select a habitable tile, then seed three founders nearby.</p>
              <label className="control-panel__field">
                <span>Species name</span>
                <input
                  className="control-panel__input"
                  aria-label="Introduced species name"
                  disabled={replayActive}
                  maxLength={MAX_SPECIES_NAME_LENGTH}
                  placeholder={suggestedName}
                  value={introductionName}
                  onChange={(event) => {
                    setIntroductionName(event.target.value);
                    setIntroductionMessage(null);
                  }}
                />
                <span className="control-panel__help">
                  Leave blank to use {suggestedName}.
                </span>
              </label>
              <div className="control-panel__field-row">
                <select
                  className="control-panel__input"
                  aria-label="Founder ecological strategy"
                  disabled={replayActive}
                  value={introductionStrategy}
                  onChange={(event) => { setIntroductionStrategy(event.target.value as EnergyStrategy); setIntroductionMessage(null); }}
                >
                  <option value="herbivore">Herbivore</option>
                  <option value="carnivore">Carnivore</option>
                  <option value="omnivore">Omnivore</option>
                  <option value="scavenger">Scavenger</option>
                </select>
                <button
                  className="sim-button"
                  type="button"
                  disabled={replayActive}
                  onClick={() => {
                    const error = onIntroduceSpecies(introductionStrategy, introductionName);
                    setIntroductionMessage(error ?? `${introductionName.trim() || suggestedName} introduced`);
                    if (!error) setIntroductionName('');
                  }}
                >
                  Introduce
                </button>
              </div>
              {introductionMessage && (
                <div className={`control-panel__status ${introductionMessage.includes('introduced') ? 'sim-status--positive' : 'sim-status--danger'}`} role="status">
                  {introductionMessage}
                </div>
              )}
            </section>
          )}

          <div className="control-panel__groups">
            {GOD_MODE_GROUPS.map((group, index) => (
              <details className="control-panel__group sim-panel" key={group.id} open={index === 0}>
                <summary className="control-panel__group-summary">
                  <span>{group.label}</span>
                  <span className="control-panel__group-count sim-data">{group.controls.length} controls</span>
                </summary>
                <p className="control-panel__help">{group.description}</p>
                {group.controls.map((config) => <GodModeSlider config={config} disabled={replayActive} key={config.key} />)}
              </details>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
