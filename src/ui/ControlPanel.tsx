import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { BALANCED_LONGEVITY_PRESET } from '../utils/constants';
import { DEFAULT_TRAITS, type EnergyStrategy } from '../utils/traits';
import {
  FOUNDER_TRAIT_CONTROLS,
  FOUNDER_TRAIT_PRESETS,
  type FounderTraitOverrides,
  type FounderTraitPreset,
} from '../simulation/founderTraits';
import { parseWorldSeed } from './worldSeed';
import { getEcosystemPressures } from './ecosystemPressures';
import { getEcosystemTrajectories } from './ecosystemTrajectory';
import { getGodModeRecommendations, recommendationPatch } from './godModeRecommendations';
import { defaultValueFor, GOD_MODE_GROUPS, type GodModeSliderConfig } from './godModeControls';
import {
  MAX_SPECIES_NAME_LENGTH,
  suggestedIntroducedSpeciesName,
} from '../simulation/speciesNames';
import { describeFounderSuitability } from './habitatSuitability';

interface ControlPanelProps {
  onReset?: () => void;
  onNewWorld?: () => void;
  onExportWorld?: () => void;
  onImportWorld?: (file: File) => Promise<string | null>;
  onStartSeed?: (seed: number) => void;
  worldSeed?: number;
  worldName?: string;
  onIntroduceSpecies?: (
    strategy: EnergyStrategy,
    name: string,
    traits: FounderTraitOverrides
  ) => string | null;
  replayActive?: boolean;
  checkpointTicks?: number[];
  onRestoreCheckpoint?: (tick: number) => string | null;
}

function GodModeHelp({
  config,
  open,
  onToggle,
  onClose,
}: {
  config: GodModeSliderConfig;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const popoverId = `god-mode-${config.key}-help`;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClose();
      containerRef.current?.querySelector('button')?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose, open]);

  return (
    <span className="control-panel__control-help" ref={containerRef}>
      <button
        className="control-panel__help-trigger"
        type="button"
        aria-label={`About ${config.label}`}
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={onToggle}
      >
        ?
      </button>
      {open && (
        <span
          className="control-panel__help-popover"
          id={popoverId}
          role="dialog"
          aria-label={`About ${config.label}`}
        >
          <strong>{config.label}</strong>
          <span>{config.description}</span>
          <button
            aria-label={`Close help for ${config.label}`}
            className="control-panel__help-close"
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </span>
      )}
    </span>
  );
}

function GodModeSlider({
  config,
  disabled,
  helpOpen,
  onHelpToggle,
  onHelpClose,
}: {
  config: GodModeSliderConfig;
  disabled: boolean;
  helpOpen: boolean;
  onHelpToggle: () => void;
  onHelpClose: () => void;
}) {
  const value = useStore((state) => state.constants[config.key]);
  const updateConstants = useStore((state) => state.updateConstants);
  const displayValue = config.formatter ? config.formatter(value) : Math.round(value * 100) / 100;
  const defaultValue = defaultValueFor(config);
  const listId = `god-mode-${config.key}-defaults`;

  const inputId = `god-mode-${config.key}`;

  return (
    <div className="control-panel__slider">
      <span className="control-panel__slider-heading">
        <label htmlFor={inputId}>{config.label}</label>
        <GodModeHelp
          config={config}
          open={helpOpen}
          onToggle={onHelpToggle}
          onClose={onHelpClose}
        />
        <output className="control-panel__slider-value sim-data">{displayValue}</output>
      </span>
      <input
        id={inputId}
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
    </div>
  );
}

export default function ControlPanel({
  onReset,
  onNewWorld,
  onExportWorld,
  onImportWorld,
  onStartSeed,
  worldSeed = 12345,
  worldName = 'Living World',
  onIntroduceSpecies,
  replayActive = false,
  checkpointTicks = [],
  onRestoreCheckpoint,
}: ControlPanelProps) {
  const tick = useStore((state) => state.tick);
  const world = useStore((state) => state.worldState);
  const isRunning = useStore((state) => state.isRunning);
  const speed = useStore((state) => state.speed);
  const constants = useStore((state) => state.constants);
  const selectedTile = useStore((state) => state.selectedTile);
  const setRunning = useStore((state) => state.setRunning);
  const setSpeed = useStore((state) => state.setSpeed);
  const updateConstants = useStore((state) => state.updateConstants);
  const resetConstants = useStore((state) => state.resetConstants);
  const [showGodMode, setShowGodMode] = useState(false);
  const [introductionStrategy, setIntroductionStrategy] = useState<EnergyStrategy>('herbivore');
  const [introductionName, setIntroductionName] = useState('');
  const [founderPreset, setFounderPreset] = useState<FounderTraitPreset | 'custom'>('balanced');
  const [founderTraits, setFounderTraits] = useState<FounderTraitOverrides>({});
  const [introductionMessage, setIntroductionMessage] = useState<string | null>(null);
  const [seedDraft, setSeedDraft] = useState(String(worldSeed));
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [recommendationMessage, setRecommendationMessage] = useState<string | null>(null);
  const [checkpointDraft, setCheckpointDraft] = useState('');
  const [checkpointMessage, setCheckpointMessage] = useState<string | null>(null);
  const [openHelpKey, setOpenHelpKey] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

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
  const selectedCell = world && selectedTile
    ? world.cells[selectedTile.y * world.width + selectedTile.x]
    : null;
  const introductionSuitability = selectedCell && selectedTile && world
    ? describeFounderSuitability(
        selectedCell,
        introductionStrategy,
        world.creatures.filter((creature) =>
          creature.lifecycleState === 'alive'
          && creature.x === selectedTile.x
          && creature.y === selectedTile.y
        ).length,
        world.cells.some((candidate, index) => {
          const x = index % world.width;
          const y = Math.floor(index / world.width);
          return Math.max(Math.abs(x - selectedTile.x), Math.abs(y - selectedTile.y)) <= 1
            && (candidate.biome === 'ocean' || candidate.biome === 'wetland');
        }),
        founderTraits
      )
    : null;

  useEffect(() => setSeedDraft(String(worldSeed)), [worldSeed]);
  useEffect(() => {
    if (checkpointTicks.length === 0) {
      setCheckpointDraft('');
      return;
    }
    if (checkpointTicks.includes(Number(checkpointDraft))) return;
    setCheckpointDraft(String(checkpointTicks[checkpointTicks.length - 1]));
  }, [checkpointDraft, checkpointTicks]);

  const startSeededWorld = () => {
    if (!onStartSeed) return;
    const result = parseWorldSeed(seedDraft);
    if (result.seed === null) {
      setSeedMessage(result.message);
      return;
    }
    onStartSeed(result.seed);
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
        {onReset && <button className="sim-button" type="button" onClick={onReset}>Replay world</button>}
        {onNewWorld && <button className="sim-button" type="button" onClick={onNewWorld}>New world</button>}
        {onExportWorld && <button className="sim-button" type="button" onClick={onExportWorld}>Export world</button>}
        {onImportWorld && <label className="sim-button">Import world<input aria-label="Import world save" type="file" accept="application/json,.json,.origins.json" hidden onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setImportMessage(await onImportWorld(file));
          event.target.value = '';
        }} /></label>}
        <output className="control-panel__tick sim-data">Tick {tick.toLocaleString()}</output>
      </div>
      {importMessage && <div className={`control-panel__status ${importMessage.startsWith('Restored') ? 'sim-status--positive' : 'sim-status--danger'}`} role="status">{importMessage}</div>}

      <label className="control-panel__field">
        <span>Speed <span className="sim-data">{speed}×</span></span>
        <input className="control-panel__range" type="range" min="1" max="20" step="1" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />
      </label>

      {onStartSeed && (
        <section className="control-panel__section" aria-labelledby="world-name-title">
          <h3 className="control-panel__section-title" id="world-name-title">{worldName}</h3>
          <details>
            <summary>World details</summary>
            <div className="control-panel__field-row">
              <input
                className="control-panel__input sim-data"
                id="world-seed"
                aria-label="World seed"
                inputMode="numeric"
                value={seedDraft}
                onChange={(event) => { setSeedDraft(event.target.value); setSeedMessage(null); }}
              />
              <button className="sim-button" type="button" onClick={startSeededWorld}>Start seed</button>
            </div>
            <div className={`control-panel__status ${seedMessage?.startsWith('Started') ? 'sim-status--positive' : 'sim-status--warning'}`} role="status">
              {seedMessage ?? `Active seed: ${worldSeed.toLocaleString()}`}
            </div>
          </details>
        </section>
      )}

      {onRestoreCheckpoint && checkpointTicks.length > 0 && (
        <section className="control-panel__section" aria-labelledby="restore-point-title">
          <h3 className="control-panel__section-title" id="restore-point-title">Restore point</h3>
          <p className="control-panel__help sim-status--warning">
            Restoring pauses the simulation. Continuing replaces the current future and removes later events and interventions.
          </p>
          <div className="control-panel__field-row">
            <select
              className="control-panel__input sim-data"
              aria-label="Restore point tick"
              disabled={replayActive}
              value={checkpointDraft}
              onChange={(event) => { setCheckpointDraft(event.target.value); setCheckpointMessage(null); }}
            >
              {checkpointTicks.map((checkpointTick) => (
                <option key={checkpointTick} value={checkpointTick}>Tick {checkpointTick.toLocaleString()}</option>
              ))}
            </select>
            <button
              className="sim-button"
              type="button"
              disabled={replayActive || checkpointDraft === '' || Number(checkpointDraft) === tick}
              onClick={() => {
                const restoreTick = Number(checkpointDraft);
                const error = onRestoreCheckpoint(restoreTick);
                setCheckpointMessage(error ?? `Restored tick ${restoreTick.toLocaleString()}; future history was removed`);
              }}
            >
              Restore
            </button>
          </div>
          {checkpointMessage && (
            <div className={`control-panel__status ${checkpointMessage.startsWith('Restored') ? 'sim-status--positive' : 'sim-status--danger'}`} role="status">
              {checkpointMessage}
            </div>
          )}
        </section>
      )}

      <button
        className={`sim-button control-panel__god-mode-toggle${showGodMode ? ' sim-button--pressed' : ''}`}
        type="button"
        aria-expanded={showGodMode}
        aria-controls="god-mode-controls"
        onClick={() => {
          setShowGodMode((visible) => !visible);
          setOpenHelpKey(null);
        }}
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
              {introductionSuitability && (
                <p className="control-panel__help sim-status--warning">
                  Selected tile: {introductionSuitability}
                </p>
              )}
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
              </div>
              <label className="control-panel__field">
                <span>Founder traits</span>
                <select
                  className="control-panel__input"
                  aria-label="Founder trait preset"
                  disabled={replayActive}
                  value={founderPreset}
                  onChange={(event) => {
                    const preset = event.target.value as FounderTraitPreset;
                    setFounderPreset(preset);
                    setFounderTraits({ ...FOUNDER_TRAIT_PRESETS[preset] });
                    setIntroductionMessage(null);
                  }}
                >
                  <option value="balanced">Balanced</option>
                  <option value="efficient">Small efficient survivor</option>
                  <option value="explorer">Fast explorer</option>
                  <option value="adaptable">Adaptable generalist</option>
                  {founderPreset === 'custom' && <option value="custom">Custom</option>}
                </select>
              </label>
              <details className="control-panel__trait-editor sim-panel">
                <summary className="control-panel__group-summary">
                  <span>Fine-tune traits</span>
                  <span className="control-panel__group-count sim-data">
                    {Object.keys(founderTraits).length} changed
                  </span>
                </summary>
                <p className="control-panel__help">
                  Every advantage has an ecological cost. These values become the founders’ inherited traits.
                </p>
                {FOUNDER_TRAIT_CONTROLS.map((control) => {
                  const value = founderTraits[control.key] ?? DEFAULT_TRAITS[control.key];
                  return (
                    <label className="control-panel__trait" key={control.key}>
                      <span className="control-panel__slider-heading">
                        <span>{control.label}</span>
                        <output className="sim-data">{value}</output>
                      </span>
                      <input
                        className="control-panel__range"
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        disabled={replayActive}
                        value={value}
                        onChange={(event) => {
                          setFounderPreset('custom');
                          setFounderTraits((current) => ({
                            ...current,
                            [control.key]: Number(event.target.value),
                          }));
                          setIntroductionMessage(null);
                        }}
                      />
                      <span className="control-panel__help">{control.description}</span>
                    </label>
                  );
                })}
              </details>
              <button
                className="sim-button control-panel__wide-button"
                type="button"
                disabled={replayActive}
                onClick={() => {
                  const error = onIntroduceSpecies(
                    introductionStrategy,
                    introductionName,
                    founderTraits
                  );
                  setIntroductionMessage(error ?? `${introductionName.trim() || suggestedName} introduced`);
                  if (!error) setIntroductionName('');
                }}
              >
                Introduce three founders
              </button>
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
                {group.controls.map((config) => (
                  <GodModeSlider
                    config={config}
                    disabled={replayActive}
                    helpOpen={openHelpKey === config.key}
                    key={config.key}
                    onHelpClose={() => setOpenHelpKey(null)}
                    onHelpToggle={() => setOpenHelpKey((key) => nextOpenHelpKey(key, config.key))}
                  />
                ))}
              </details>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

export function nextOpenHelpKey(currentKey: string | null, requestedKey: string): string | null {
  return currentKey === requestedKey ? null : requestedKey;
}
