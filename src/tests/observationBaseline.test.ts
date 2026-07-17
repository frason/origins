import { describe, expect, it } from 'vitest';
import {
  createObservationBaseline,
  isObservationBaselineValid,
  MAX_OBSERVATION_NOTE_LENGTH,
  normalizeObservationNote,
} from '../ui/observationBaseline';
import type { SessionSummary } from '../ui/sessionSummary';

function summary(): SessionSummary {
  return {
    seed: 42,
    status: 'living',
    ticksSurvived: 100,
    currentPopulation: 10,
    peakPopulation: 12,
    activeSpecies: 2,
    activeLineages: 3,
    births: 10,
    deaths: 3,
    mutations: 2,
    extinctions: 0,
    interventions: 1,
    speciesObserved: 2,
    remainingBiomass: 900,
    finalEvents: [],
    recentStories: [],
  };
}

describe('observation baseline notes', () => {
  it('trims and normalizes whitespace into a concise note', () => {
    expect(normalizeObservationNote(
      '  Raised producer growth.\n\n Expecting   grazers to recover.  '
    )).toBe('Raised producer growth. Expecting grazers to recover.');
  });

  it('treats blank notes as absent', () => {
    expect(normalizeObservationNote(' \n\t ')).toBeNull();
    expect(createObservationBaseline(summary(), '   ').note).toBeNull();
  });

  it('caps normalized notes at the UI limit', () => {
    const note = normalizeObservationNote('x'.repeat(MAX_OBSERVATION_NOTE_LENGTH + 50));
    expect(note).toHaveLength(MAX_OBSERVATION_NOTE_LENGTH);
  });

  it('captures context without mutating the summary or input text', () => {
    const source = summary();
    const note = '  Test lower metabolism  ';
    const before = JSON.stringify(source);
    const observation = createObservationBaseline(source, note);

    expect(observation).toEqual({ summary: source, note: 'Test lower metabolism' });
    expect(JSON.stringify(source)).toBe(before);
    expect(note).toBe('  Test lower metabolism  ');
  });

  it('invalidates observations after seed changes or time rewinds', () => {
    const observation = createObservationBaseline(summary(), 'baseline');
    expect(isObservationBaselineValid(observation, 42, 100)).toBe(true);
    expect(isObservationBaselineValid(observation, 42, 150)).toBe(true);
    expect(isObservationBaselineValid(observation, 99, 150)).toBe(false);
    expect(isObservationBaselineValid(observation, 42, 99)).toBe(false);
  });

  it('is deterministic for identical summary and note input', () => {
    expect(createObservationBaseline(summary(), 'same note'))
      .toEqual(createObservationBaseline(summary(), 'same note'));
  });
});
