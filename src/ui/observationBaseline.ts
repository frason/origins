import type { SessionSummary } from './sessionSummary';

export const MAX_OBSERVATION_NOTE_LENGTH = 160;

export interface ObservationBaseline {
  summary: SessionSummary;
  note: string | null;
}

export function normalizeObservationNote(note: string): string | null {
  const normalized = note.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.slice(0, MAX_OBSERVATION_NOTE_LENGTH).trimEnd();
}

/** Capture player context beside a recap without touching simulation or replay state. */
export function createObservationBaseline(
  summary: SessionSummary,
  note: string
): ObservationBaseline {
  return { summary, note: normalizeObservationNote(note) };
}

export function isObservationBaselineValid(
  baseline: ObservationBaseline,
  seed: number | null,
  tick: number
): boolean {
  return baseline.summary.seed === seed && baseline.summary.ticksSurvived <= tick;
}
