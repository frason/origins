/**
 * Field Journal for Origins — Persistent Documentation of Lineage History
 *
 * The Field Journal preserves the stories and evidence of a world across time,
 * including lineages that have gone extinct. Entries distinguish observed evidence
 * from inferred explanation.
 *
 * Key properties:
 * - Determinism: Journal entries are keyed to simulation tick and events (reproducible)
 * - Non-deterministic: Player notes and timestamps are NOT part of determinism
 * - Bounded: Storage limited to prevent memory bloat
 * - Searchable: Entries indexed by species, lineage, type, tick
 */

import type { SimEvent, TraitChange, DeathCause } from './events';
import type { Traits } from '../utils/traits';
import { speciesDisplayName, lineageDisplayName } from './speciesNames';

export type FieldJournalEntryType =
  | 'first-sighting'
  | 'adaptation'
  | 'speciation'
  | 'range-change'
  | 'intervention'
  | 'extinction';

/**
 * Observed evidence — hard facts from the simulation
 */
export interface ObservedEvidence {
  description: string; // Human-readable observation
  traitChanges?: TraitChange[];
  population?: number;
  evidence: string[]; // e.g., ["birth event", "trait frequency", "population census"]
  location?: {
    x: number;
    y: number;
  };
  parentLineageId?: string;
  deathCause?: DeathCause;
}

/**
 * Inferred explanation — causal claim about what happened (fallible)
 */
export interface InferredExplanation {
  explanation: string; // Causal hypothesis
  confidence: number; // 0-1 confidence in this explanation
  reasoning: string[];
}

/**
 * A single journal entry documenting a lineage event
 */
export interface FieldJournalEntry {
  id: string; // Unique entry ID based on tick, event, and lineage
  type: FieldJournalEntryType;
  speciesId: string;
  lineageId?: string;
  ancestralSpeciesId?: string; // For speciation events, track origin
  tick: number;

  // Observed facts from simulation
  observed: ObservedEvidence;

  // Causal explanation (may be refined over time)
  inferred?: InferredExplanation;

  // Player annotation (doesn't affect determinism)
  playerNotes?: string;

  // Linked entries (e.g., extinction links to first sighting)
  linkedEntryIds?: string[];

  // Storage metadata (NOT part of determinism)
  createdAtMs?: number; // Unix timestamp when journal entry was generated
}

/**
 * The complete journal for a world
 */
export interface FieldJournal {
  worldSeed?: number;
  createdAtMs?: number;
  entries: FieldJournalEntry[];
  lastUpdatedTick: number;
  entryIndex: Map<string, FieldJournalEntry>; // By entry.id for quick lookup
}

/**
 * Create a unique entry ID from simulation determinants
 */
export function createEntryId(
  type: FieldJournalEntryType,
  tick: number,
  speciesId: string,
  lineageId?: string
): string {
  const lineagePart = lineageId ? `.${lineageId}` : '';
  return `${type}:${tick}:${speciesId}${lineagePart}`;
}

/**
 * Create a first-sighting entry when a lineage is first observed
 */
export function createFirstSightingEntry(
  speciesId: string,
  lineageId: string,
  tick: number,
  population: number
): FieldJournalEntry {
  return {
    id: createEntryId('first-sighting', tick, speciesId, lineageId),
    type: 'first-sighting',
    speciesId,
    lineageId,
    tick,
    observed: {
      description: `First sighting of ${lineageDisplayName(speciesId, lineageId)} (${speciesDisplayName(speciesId)})`,
      population,
      evidence: ['lineage-emergence', 'population-census'],
    },
    inferred: {
      explanation: 'A new lineage emerged, likely from mutation or speciation',
      confidence: 0.9,
      reasoning: ['No previous records of this lineage ID', 'Consistent with mutation pressure and breeding'],
    },
  };
}

/**
 * Create an adaptation entry when a lineage shows trait evolution
 */
export function createAdaptationEntry(
  speciesId: string,
  lineageId: string,
  tick: number,
  traitChanges: TraitChange[],
  population: number,
  mutationPressure?: number
): FieldJournalEntry {
  const traitLabels = traitChanges.map((c) => c.trait.replace(/([A-Z])/g, ' $1').toLowerCase().trim());

  return {
    id: createEntryId('adaptation', tick, speciesId, lineageId),
    type: 'adaptation',
    speciesId,
    lineageId,
    tick,
    observed: {
      description: `Trait changes in ${lineageDisplayName(speciesId, lineageId)}: ${traitLabels.join(', ')}`,
      traitChanges,
      population,
      evidence: ['trait-frequency-change', 'mutation-event', `population-size-${population}`],
    },
    inferred: {
      explanation: `Environmental or reproductive pressure drove selection for: ${traitLabels.join(', ')}`,
      confidence: mutationPressure ? Math.min(0.95, 0.5 + mutationPressure) : 0.6,
      reasoning: [
        'Trait changes correlate with breeding events',
        'Multiple individuals show similar changes',
        mutationPressure ? `Mutation pressure elevated at ${Math.round(mutationPressure * 100)}%` : 'Baseline mutation rate',
      ],
    },
  };
}

/**
 * Create a speciation entry when a lineage branches
 */
export function createSpeationEntry(
  parentSpeciesId: string,
  newSpeciesId: string,
  newLineageId: string,
  tick: number,
  founderCount: number
): FieldJournalEntry {
  return {
    id: createEntryId('speciation', tick, newSpeciesId, newLineageId),
    type: 'speciation',
    speciesId: newSpeciesId,
    lineageId: newLineageId,
    ancestralSpeciesId: parentSpeciesId,
    tick,
    observed: {
      description: `New species emerged: ${speciesDisplayName(newSpeciesId)} (${founderCount} founders from ${speciesDisplayName(parentSpeciesId)})`,
      population: founderCount,
      evidence: ['speciation-event', 'reproductive-isolation', 'genetic-divergence'],
    },
    inferred: {
      explanation: 'Accumulated mutations and breeding pressure created reproductive isolation and a new species',
      confidence: 0.85,
      reasoning: [
        'Genetic differences now prevent successful hybridization',
        'Distinct ecological niche or trait combination',
      ],
    },
  };
}

/**
 * Create an extinction entry when a lineage disappears
 */
export function createExtinctionEntry(
  speciesId: string,
  lineageId: string,
  tick: number,
  previousPopulation: number,
  deathCause?: DeathCause
): FieldJournalEntry {
  const causeDescription = deathCause
    ? {
        predation: 'predation and competition from other species',
        starvation: 'inability to find sufficient food',
        age: 'natural aging without reproduction',
        'monoculture-pressure': 'pressure from ecological monoculture',
        overcrowding: 'overcrowding and resource exhaustion',
        'environmental-stress': 'environmental changes and toxicity',
        'dispersal-exhaustion': 'failed dispersal attempts',
        unknown: 'unknown causes',
      }[deathCause] || 'unknown causes'
    : 'unknown causes';

  return {
    id: createEntryId('extinction', tick, speciesId, lineageId),
    type: 'extinction',
    speciesId,
    lineageId,
    tick,
    observed: {
      description: `${lineageDisplayName(speciesId, lineageId)} (${speciesDisplayName(speciesId)}) went extinct after reaching ${previousPopulation} individuals`,
      population: 0,
      deathCause,
      evidence: ['population-zero', `last-seen-tick-unknown`, 'extinction-event'],
    },
    inferred: {
      explanation: `Extinction driven by ${causeDescription}. The lineage was unable to adapt or maintain population.`,
      confidence: 0.7,
      reasoning: [
        'Population declined over recent ticks',
        `Final individuals died from ${causeDescription}`,
        'No surviving offspring or related lineages',
      ],
    },
  };
}

/**
 * Create an intervention entry when player changes world settings
 */
export function createInterventionEntry(
  tick: number,
  interventionKind: 'settings-change' | 'species-introduction',
  detail: string,
  speciesId?: string,
  location?: { x: number; y: number }
): FieldJournalEntry {
  return {
    id: createEntryId('intervention', tick, speciesId ?? 'world', `intervention-${tick}`),
    type: 'intervention',
    speciesId: speciesId ?? 'world',
    tick,
    observed: {
      description: `Player intervention: ${detail}`,
      location,
      evidence: ['player-action', interventionKind],
    },
    inferred: {
      explanation: 'Player deliberately modified world state to test ecosystem response',
      confidence: 1.0,
      reasoning: ['Direct player action recorded', 'Intervention kind: ' + interventionKind],
    },
  };
}

/**
 * Create an empty field journal for a new world
 */
export function createFieldJournal(worldSeed?: number): FieldJournal {
  return {
    worldSeed,
    createdAtMs: Date.now(),
    entries: [],
    lastUpdatedTick: 0,
    entryIndex: new Map(),
  };
}

/**
 * Add an entry to the journal (deduplicates by ID)
 */
export function addJournalEntry(journal: FieldJournal, entry: FieldJournalEntry): FieldJournal {
  if (journal.entryIndex.has(entry.id)) {
    return journal; // Already exists, skip duplicate
  }

  const updated = {
    ...journal,
    entries: [...journal.entries, { ...entry, createdAtMs: Date.now() }],
    lastUpdatedTick: Math.max(journal.lastUpdatedTick, entry.tick),
  };

  updated.entryIndex.set(entry.id, updated.entries[updated.entries.length - 1]);
  return updated;
}

/**
 * Update player notes on an entry (does NOT affect determinism)
 */
export function updateJournalEntryNotes(
  journal: FieldJournal,
  entryId: string,
  notes: string
): FieldJournal {
  const entry = journal.entryIndex.get(entryId);
  if (!entry) return journal;

  const updated = {
    ...journal,
    entries: journal.entries.map((e) =>
      e.id === entryId ? { ...e, playerNotes: notes } : e
    ),
  };

  updated.entryIndex.set(entryId, { ...entry, playerNotes: notes });
  return updated;
}

/**
 * Search journal entries by criteria
 */
export interface JournalSearchCriteria {
  speciesId?: string;
  lineageId?: string;
  entryType?: FieldJournalEntryType;
  tickMin?: number;
  tickMax?: number;
  includeExtinct?: boolean; // If false, exclude extinction entries
}

export function searchJournal(
  journal: FieldJournal,
  criteria: JournalSearchCriteria
): FieldJournalEntry[] {
  return journal.entries.filter((entry) => {
    if (criteria.speciesId && entry.speciesId !== criteria.speciesId) return false;
    if (criteria.lineageId && entry.lineageId !== criteria.lineageId) return false;
    if (criteria.entryType && entry.type !== criteria.entryType) return false;
    if (criteria.tickMin !== undefined && entry.tick < criteria.tickMin) return false;
    if (criteria.tickMax !== undefined && entry.tick > criteria.tickMax) return false;
    if (criteria.includeExtinct === false && entry.type === 'extinction') return false;
    return true;
  });
}

/**
 * Get lineage history from journal (all entries for a specific lineage, in order)
 */
export function getLineageHistory(
  journal: FieldJournal,
  speciesId: string,
  lineageId: string
): FieldJournalEntry[] {
  return journal.entries
    .filter((e) => e.speciesId === speciesId && e.lineageId === lineageId)
    .sort((a, b) => a.tick - b.tick);
}

/**
 * Get all lineages with entries in the journal (living and extinct)
 */
export interface LineageRef {
  speciesId: string;
  lineageId: string;
  status: 'living' | 'extinct';
  firstTick: number;
  lastTick: number;
}

export function getAllLineagesInJournal(journal: FieldJournal): LineageRef[] {
  const refs = new Map<string, LineageRef>();

  for (const entry of journal.entries) {
    if (!entry.lineageId) continue;

    const key = `${entry.speciesId}:${entry.lineageId}`;
    const status = entry.type === 'extinction' ? 'extinct' : 'living';

    if (refs.has(key)) {
      const ref = refs.get(key)!;
      ref.lastTick = Math.max(ref.lastTick, entry.tick);
      if (status === 'extinct') ref.status = 'extinct';
    } else {
      refs.set(key, {
        speciesId: entry.speciesId,
        lineageId: entry.lineageId,
        status,
        firstTick: entry.tick,
        lastTick: entry.tick,
      });
    }
  }

  return Array.from(refs.values()).sort((a, b) => a.firstTick - b.firstTick);
}

/**
 * Bound journal storage to prevent unbounded growth
 * Keeps most recent entries and one historical sample per time period
 */
export function boundJournalStorage(
  journal: FieldJournal,
  maxEntries: number = 10000
): FieldJournal {
  if (journal.entries.length <= maxEntries) return journal;

  // Keep recent entries in full
  const recentCount = Math.floor(maxEntries * 0.7);
  const keepRecent = journal.entries.slice(-recentCount);

  // For older entries, sample every Nth to stay under limit
  const oldCount = journal.entries.length - recentCount;
  const oldBudget = maxEntries - recentCount;
  const sampleRate = Math.ceil(oldCount / oldBudget);

  const sampled = journal.entries
    .slice(0, -recentCount)
    .filter((_, i) => i % sampleRate === 0);

  const bounded: FieldJournal = {
    ...journal,
    entries: [...sampled, ...keepRecent],
    entryIndex: new Map(),
  };

  bounded.entries.forEach((e) => bounded.entryIndex.set(e.id, e));
  return bounded;
}
