import { describe, it, expect } from 'vitest';
import {
  createFieldJournal,
  addJournalEntry,
  createFirstSightingEntry,
  createAdaptationEntry,
  createSpeationEntry,
  createExtinctionEntry,
  createInterventionEntry,
  updateJournalEntryNotes,
  searchJournal,
  getLineageHistory,
  getAllLineagesInJournal,
  createEntryId,
  boundJournalStorage,
} from '../simulation/fieldJournal';

describe('FieldJournal', () => {
  const speciesId = 'species-1';
  const lineageId = 'lineage-1';
  const parentSpeciesId = 'species-parent';

  it('should create an empty journal', () => {
    const journal = createFieldJournal(12345);
    expect(journal.entries).toHaveLength(0);
    expect(journal.worldSeed).toBe(12345);
    expect(journal.lastUpdatedTick).toBe(0);
  });

  it('should generate unique entry IDs', () => {
    const id1 = createEntryId('first-sighting', 100, speciesId, lineageId);
    const id2 = createEntryId('first-sighting', 101, speciesId, lineageId);
    const id3 = createEntryId('adaptation', 100, speciesId, lineageId);

    expect(id1).toContain('first-sighting');
    expect(id1).toContain('100');
    expect(id1).toContain(speciesId);
    expect(id1).toContain(lineageId);

    expect(id1).not.toBe(id2); // Different tick
    expect(id1).not.toBe(id3); // Different type
  });

  it('should create and add first sighting entry', () => {
    let journal = createFieldJournal();
    const entry = createFirstSightingEntry(speciesId, lineageId, 100, 5);

    expect(entry.type).toBe('first-sighting');
    expect(entry.speciesId).toBe(speciesId);
    expect(entry.lineageId).toBe(lineageId);
    expect(entry.tick).toBe(100);
    expect(entry.observed.population).toBe(5);
    expect(entry.observed.evidence).toContain('lineage-emergence');
    expect(entry.inferred?.confidence).toBeGreaterThan(0);

    journal = addJournalEntry(journal, entry);
    expect(journal.entries).toHaveLength(1);
    expect(journal.lastUpdatedTick).toBe(100);
    expect(journal.entryIndex.has(entry.id)).toBe(true);
  });

  it('should create adaptation entry with trait changes', () => {
    const journal = createFieldJournal();
    const traitChanges = [
      { trait: 'speed' as const, before: 5, after: 7 },
      { trait: 'size' as const, before: 10, after: 12 },
    ];

    const entry = createAdaptationEntry(
      speciesId,
      lineageId,
      150,
      traitChanges,
      20,
      0.5
    );

    expect(entry.type).toBe('adaptation');
    expect(entry.observed.traitChanges).toHaveLength(2);
    expect(entry.observed.population).toBe(20);
    expect(entry.inferred?.confidence).toBeGreaterThan(0.5);
  });

  it('should create speciation entry', () => {
    const journal = createFieldJournal();
    const entry = createSpeationEntry(parentSpeciesId, speciesId, lineageId, 200, 3);

    expect(entry.type).toBe('speciation');
    expect(entry.ancestralSpeciesId).toBe(parentSpeciesId);
    expect(entry.observed.population).toBe(3);
    expect(entry.observed.description).toContain('New species');
  });

  it('should create extinction entry with death cause', () => {
    const journal = createFieldJournal();
    const entry = createExtinctionEntry(speciesId, lineageId, 250, 100, 'starvation');

    expect(entry.type).toBe('extinction');
    expect(entry.observed.population).toBe(0);
    expect(entry.observed.deathCause).toBe('starvation');
    expect(entry.observed.description).toContain('extinct');
  });

  it('should create intervention entry', () => {
    const journal = createFieldJournal();
    const entry = createInterventionEntry(
      300,
      'settings-change',
      'Adjusted energy generation',
      speciesId,
      { x: 50, y: 50 }
    );

    expect(entry.type).toBe('intervention');
    expect(entry.observed.location).toEqual({ x: 50, y: 50 });
    expect(entry.inferred?.confidence).toBe(1.0); // Perfect certainty for player actions
  });

  it('should prevent duplicate entries', () => {
    let journal = createFieldJournal();
    const entry = createFirstSightingEntry(speciesId, lineageId, 100, 5);

    journal = addJournalEntry(journal, entry);
    journal = addJournalEntry(journal, entry); // Try to add same entry again

    expect(journal.entries).toHaveLength(1); // Should still be 1
  });

  it('should update player notes without affecting entry ID', () => {
    let journal = createFieldJournal();
    const entry = createFirstSightingEntry(speciesId, lineageId, 100, 5);
    journal = addJournalEntry(journal, entry);

    const notes = 'This lineage seems very adapted to the northern region.';
    journal = updateJournalEntryNotes(journal, entry.id, notes);

    const updated = journal.entryIndex.get(entry.id);
    expect(updated?.playerNotes).toBe(notes);
  });

  it('should search journal by species and lineage', () => {
    let journal = createFieldJournal();

    const entry1 = createFirstSightingEntry(speciesId, lineageId, 100, 5);
    const entry2 = createAdaptationEntry(speciesId, lineageId, 150, [], 10);
    const otherEntry = createFirstSightingEntry('other-species', 'other-lineage', 120, 3);

    journal = addJournalEntry(journal, entry1);
    journal = addJournalEntry(journal, entry2);
    journal = addJournalEntry(journal, otherEntry);

    const results = searchJournal(journal, {
      speciesId,
      lineageId,
    });

    expect(results).toHaveLength(2);
    expect(results.every((e) => e.speciesId === speciesId && e.lineageId === lineageId)).toBe(true);
  });

  it('should search journal by entry type', () => {
    let journal = createFieldJournal();

    const entry1 = createFirstSightingEntry(speciesId, lineageId, 100, 5);
    const entry2 = createAdaptationEntry(speciesId, lineageId, 150, [], 10);
    const entry3 = createExtinctionEntry(speciesId, lineageId, 200, 0);

    journal = addJournalEntry(journal, entry1);
    journal = addJournalEntry(journal, entry2);
    journal = addJournalEntry(journal, entry3);

    const adaptations = searchJournal(journal, { entryType: 'adaptation' });
    expect(adaptations).toHaveLength(1);
    expect(adaptations[0].type).toBe('adaptation');

    const noExtinctions = searchJournal(journal, { includeExtinct: false });
    expect(noExtinctions).toHaveLength(2);
  });

  it('should retrieve lineage history in tick order', () => {
    let journal = createFieldJournal();

    const entry1 = createFirstSightingEntry(speciesId, lineageId, 100, 5);
    const entry2 = createAdaptationEntry(speciesId, lineageId, 200, [], 10);
    const entry3 = createExtinctionEntry(speciesId, lineageId, 300, 0);

    // Add in mixed order
    journal = addJournalEntry(journal, entry3);
    journal = addJournalEntry(journal, entry1);
    journal = addJournalEntry(journal, entry2);

    const history = getLineageHistory(journal, speciesId, lineageId);

    expect(history).toHaveLength(3);
    expect(history[0].tick).toBe(100);
    expect(history[1].tick).toBe(200);
    expect(history[2].tick).toBe(300);
  });

  it('should list all lineages in journal', () => {
    let journal = createFieldJournal();

    const entry1 = createFirstSightingEntry(speciesId, 'lineage-1', 100, 5);
    const entry2 = createFirstSightingEntry(speciesId, 'lineage-2', 110, 3);
    const entry3 = createExtinctionEntry(speciesId, 'lineage-1', 200, 0);

    journal = addJournalEntry(journal, entry1);
    journal = addJournalEntry(journal, entry2);
    journal = addJournalEntry(journal, entry3);

    const lineages = getAllLineagesInJournal(journal);

    expect(lineages).toHaveLength(2);

    const lineage1 = lineages.find((l) => l.lineageId === 'lineage-1');
    expect(lineage1?.status).toBe('extinct');
    expect(lineage1?.firstTick).toBe(100);
    expect(lineage1?.lastTick).toBe(200);

    const lineage2 = lineages.find((l) => l.lineageId === 'lineage-2');
    expect(lineage2?.status).toBe('living');
  });

  it('should bound journal storage and keep recent entries', () => {
    let journal = createFieldJournal();

    // Add 100 entries
    for (let i = 0; i < 100; i++) {
      const entry = createFirstSightingEntry(speciesId, `lineage-${i}`, i * 10, 5);
      journal = addJournalEntry(journal, entry);
    }

    expect(journal.entries).toHaveLength(100);

    // Bound to 30 entries
    const bounded = boundJournalStorage(journal, 30);

    expect(bounded.entries.length).toBeLessThanOrEqual(30);
    // Should keep recent entries
    const newestEntry = bounded.entries[bounded.entries.length - 1];
    expect(newestEntry.tick).toBe(990); // Last entry should be most recent
  });

  it('should reconstruct lineage history after extinction', () => {
    let journal = createFieldJournal();

    // Create a full lineage history
    const firstSighting = createFirstSightingEntry(speciesId, lineageId, 100, 1);
    const adaptation1 = createAdaptationEntry(speciesId, lineageId, 200, [], 5);
    const adaptation2 = createAdaptationEntry(speciesId, lineageId, 300, [], 8);
    const extinction = createExtinctionEntry(speciesId, lineageId, 400, 8, 'predation');

    journal = addJournalEntry(journal, firstSighting);
    journal = addJournalEntry(journal, adaptation1);
    journal = addJournalEntry(journal, adaptation2);
    journal = addJournalEntry(journal, extinction);

    // Even after extinction, lineage history should be complete
    const history = getLineageHistory(journal, speciesId, lineageId);
    expect(history).toHaveLength(4);
    expect(history[3].type).toBe('extinction');

    // Lineage should be marked as extinct
    const lineages = getAllLineagesInJournal(journal);
    const lineageRef = lineages.find((l) => l.lineageId === lineageId);
    expect(lineageRef?.status).toBe('extinct');
  });

  it('should handle search with tick range', () => {
    let journal = createFieldJournal();

    const entry1 = createFirstSightingEntry(speciesId, lineageId, 50, 5);
    const entry2 = createAdaptationEntry(speciesId, lineageId, 150, [], 10);
    const entry3 = createExtinctionEntry(speciesId, lineageId, 250, 0);

    journal = addJournalEntry(journal, entry1);
    journal = addJournalEntry(journal, entry2);
    journal = addJournalEntry(journal, entry3);

    const range100to200 = searchJournal(journal, {
      tickMin: 100,
      tickMax: 200,
    });

    expect(range100to200).toHaveLength(1);
    expect(range100to200[0].tick).toBe(150);
  });

  it('should distinguish observed evidence from inferred explanation', () => {
    const journal = createFieldJournal();
    const entry = createAdaptationEntry(speciesId, lineageId, 150, [], 10, 0.3);

    // Observed should be factual
    expect(entry.observed.description).toBeTruthy();
    expect(entry.observed.evidence.length).toBeGreaterThan(0);

    // Inferred should be marked as such with confidence
    expect(entry.inferred).toBeTruthy();
    // Confidence is calculated as Math.min(0.95, 0.5 + mutationPressure) = 0.8
    expect(entry.inferred?.confidence).toBe(0.8);
    expect(entry.inferred?.explanation).toBeTruthy();
    expect(entry.inferred?.reasoning).toBeTruthy();
  });
});
