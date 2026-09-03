import { describe, it, expect } from 'vitest';
import {
  getFieldJournalStorageKey,
  serializeFieldJournal,
  deserializeFieldJournal,
  loadFieldJournal,
  saveFieldJournal,
  clearFieldJournal,
  listStoredJournals,
  estimateJournalStorageSize,
} from '../state/fieldJournalPersistence';
import { createFieldJournal, addJournalEntry, createFirstSightingEntry } from '../simulation/fieldJournal';
import type { StorageLike } from '../state/browserWorldSave';

describe('FieldJournalPersistence', () => {
  class MockStorage implements StorageLike {
    private data = new Map<string, string>();

    getItem(key: string): string | null {
      return this.data.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
      this.data.set(key, value);
    }

    removeItem(key: string): void {
      this.data.delete(key);
    }

    get length(): number {
      return this.data.size;
    }

    key(index: number): string | null {
      const keys = Array.from(this.data.keys());
      return keys[index] ?? null;
    }
  }

  it('should generate storage keys based on seed', () => {
    const key1 = getFieldJournalStorageKey(12345);
    const key2 = getFieldJournalStorageKey(undefined);

    expect(key1).toContain('seed-12345');
    expect(key2).toContain('default');
  });

  it('should serialize and deserialize journal', () => {
    let journal = createFieldJournal(12345);
    const entry = createFirstSightingEntry('species-1', 'lineage-1', 100, 5);
    journal = addJournalEntry(journal, entry);

    const serialized = serializeFieldJournal(journal);
    expect(typeof serialized).toBe('string');
    expect(serialized.length).toBeGreaterThan(0);

    const deserialized = deserializeFieldJournal(serialized, 12345);
    expect(deserialized.entries).toHaveLength(1);
    expect(deserialized.entries[0].id).toBe(entry.id);
    expect(deserialized.worldSeed).toBe(12345);
    expect(deserialized.lastUpdatedTick).toBe(100);

    // Should have reconstructed the index
    expect(deserialized.entryIndex.has(entry.id)).toBe(true);
  });

  it('should handle deserialization errors gracefully', () => {
    const invalid = 'not valid json {]';
    const result = deserializeFieldJournal(invalid, 12345);

    expect(result.entries).toHaveLength(0);
    expect(result.worldSeed).toBe(12345);
  });

  it('should save and load journal from storage', () => {
    const storage = new MockStorage();
    let journal = createFieldJournal(12345);
    const entry = createFirstSightingEntry('species-1', 'lineage-1', 100, 5);
    journal = addJournalEntry(journal, entry);

    saveFieldJournal(storage, journal);

    const loaded = loadFieldJournal(storage, 12345);
    expect(loaded.entries).toHaveLength(1);
    expect(loaded.entries[0].id).toBe(entry.id);
  });

  it('should load empty journal if not in storage', () => {
    const storage = new MockStorage();
    const journal = loadFieldJournal(storage, 99999);

    expect(journal.entries).toHaveLength(0);
    expect(journal.worldSeed).toBe(99999);
  });

  it('should clear journal from storage', () => {
    const storage = new MockStorage();
    let journal = createFieldJournal(12345);
    const entry = createFirstSightingEntry('species-1', 'lineage-1', 100, 5);
    journal = addJournalEntry(journal, entry);

    saveFieldJournal(storage, journal);
    expect(storage.getItem(getFieldJournalStorageKey(12345))).toBeTruthy();

    clearFieldJournal(storage, 12345);
    expect(storage.getItem(getFieldJournalStorageKey(12345))).toBeNull();
  });

  it('should list stored journals', () => {
    const storage = new MockStorage();

    // Add journals for different seeds
    let journal1 = createFieldJournal(111);
    let journal2 = createFieldJournal(222);
    let journal3 = createFieldJournal(333);

    const entry = createFirstSightingEntry('species-1', 'lineage-1', 100, 5);
    journal1 = addJournalEntry(journal1, entry);
    journal2 = addJournalEntry(journal2, entry);
    journal3 = addJournalEntry(journal3, entry);

    saveFieldJournal(storage, journal1);
    saveFieldJournal(storage, journal2);
    saveFieldJournal(storage, journal3);

    const seeds = listStoredJournals(storage);
    expect(seeds).toContain(111);
    expect(seeds).toContain(222);
    expect(seeds).toContain(333);
    expect(seeds).toEqual([111, 222, 333]); // Should be sorted
  });

  it('should estimate storage size', () => {
    const storage = new MockStorage();

    let journal = createFieldJournal(12345);
    const entry = createFirstSightingEntry('species-1', 'lineage-1', 100, 5);
    journal = addJournalEntry(journal, entry);

    saveFieldJournal(storage, journal);

    const size = estimateJournalStorageSize(storage);
    expect(size).toBeGreaterThan(0);
  });

  it('should preserve entry index on deserialization', () => {
    let journal = createFieldJournal();
    const entry1 = createFirstSightingEntry('species-1', 'lineage-1', 100, 5);
    const entry2 = createFirstSightingEntry('species-2', 'lineage-2', 110, 3);

    journal = addJournalEntry(journal, entry1);
    journal = addJournalEntry(journal, entry2);

    const serialized = serializeFieldJournal(journal);
    const deserialized = deserializeFieldJournal(serialized);

    // Index should be usable immediately
    expect(deserialized.entryIndex.get(entry1.id)).toBeTruthy();
    expect(deserialized.entryIndex.get(entry2.id)).toBeTruthy();

    // Should find entries by ID
    const found1 = deserialized.entryIndex.get(entry1.id);
    expect(found1?.speciesId).toBe('species-1');
  });

  it('should handle round-trip with player notes', () => {
    const storage = new MockStorage();

    let journal = createFieldJournal(12345);
    const entry = createFirstSightingEntry('species-1', 'lineage-1', 100, 5);
    journal = addJournalEntry(journal, entry);

    // Add player notes
    journal = {
      ...journal,
      entries: journal.entries.map((e) =>
        e.id === entry.id ? { ...e, playerNotes: 'Great observation!' } : e
      ),
    };

    saveFieldJournal(storage, journal);
    const loaded = loadFieldJournal(storage, 12345);

    expect(loaded.entries[0].playerNotes).toBe('Great observation!');
  });

  it('should preserve all entry types on serialization', async () => {
    const storage = new MockStorage();

    let journal = createFieldJournal(12345);

    // Add different entry types
    const { createAdaptationEntry, createExtinctionEntry } = await import(
      '../simulation/fieldJournal'
    );

    const firstSighting = createFirstSightingEntry('species-1', 'lineage-1', 100, 5);
    const adaptation = createAdaptationEntry('species-1', 'lineage-1', 200, [], 10);
    const extinction = createExtinctionEntry('species-1', 'lineage-1', 300, 0);

    journal = addJournalEntry(journal, firstSighting);
    journal = addJournalEntry(journal, adaptation);
    journal = addJournalEntry(journal, extinction);

    saveFieldJournal(storage, journal);
    const loaded = loadFieldJournal(storage, 12345);

    expect(loaded.entries).toHaveLength(3);
    expect(loaded.entries.map((e) => e.type)).toContain('first-sighting');
    expect(loaded.entries.map((e) => e.type)).toContain('adaptation');
    expect(loaded.entries.map((e) => e.type)).toContain('extinction');
  });
});
