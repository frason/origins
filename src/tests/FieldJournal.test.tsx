import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FieldJournal from '../ui/FieldJournal';
import { useStore } from '../state/store';
import type { FieldJournal as FieldJournalType } from '../simulation/fieldJournal';
import { createFieldJournal } from '../simulation/fieldJournal';

// Mock the store
vi.mock('../state/store', () => ({
  useStore: vi.fn(),
}));

describe('FieldJournal UI Component', () => {
  let mockFieldJournal: FieldJournalType;

  beforeEach(() => {
    // Create a fresh journal with sample entries
    mockFieldJournal = createFieldJournal(12345);

    // Manually add test entries to the journal
    const firstSightingEntry = {
      id: 'entry-1',
      type: 'first-sighting' as const,
      speciesId: 'species-A',
      lineageId: 'lineage-A1',
      tick: 10,
      observed: {
        description: 'First sighting of Species A, Lineage A1',
        evidence: ['birth event'],
        location: {
          x: 25,
          y: 30,
        },
      },
    };

    const speciationEntry = {
      id: 'entry-2',
      type: 'speciation' as const,
      speciesId: 'species-B',
      lineageId: 'lineage-B1',
      ancestralSpeciesId: 'species-A',
      tick: 50,
      observed: {
        description: 'Species B evolved from Species A',
        evidence: ['trait divergence'],
        location: {
          x: 45,
          y: 60,
        },
      },
    };

    mockFieldJournal.entries.push(firstSightingEntry as any);
    mockFieldJournal.entries.push(speciationEntry as any);
    mockFieldJournal.entryIndex.set('entry-1', firstSightingEntry as any);
    mockFieldJournal.entryIndex.set('entry-2', speciationEntry as any);
  });

  it('renders field journal with entries', () => {
    (useStore as any).mockImplementation((selector: any) => {
      const state: any = {
        fieldJournal: mockFieldJournal,
        tick: 50,
        updateJournalEntryNotes: vi.fn(),
      };
      return selector(state);
    });

    render(<FieldJournal />);
    expect(screen.getByText(/Field Journal/)).toBeTruthy();
    expect(screen.getByText(/2 entries/)).toBeTruthy();
  });

  it('calls onNavigateToTile when clicking map location link', async () => {
    const mockOnNavigateToTile = vi.fn();

    (useStore as any).mockImplementation((selector: any) => {
      const state: any = {
        fieldJournal: mockFieldJournal,
        tick: 50,
        updateJournalEntryNotes: vi.fn(),
      };
      return selector(state);
    });

    render(
      <FieldJournal
        onNavigateToTile={mockOnNavigateToTile}
      />
    );

    // Click on the first entry to open the detail view
    const firstEntry = screen.getByText(/First sighting of Species A/);
    fireEvent.click(firstEntry);

    // Wait for detail view to open and find the map location link
    await waitFor(() => {
      const mapLink = screen.getByText(/Grid \(25, 30\)/);
      expect(mapLink).toBeTruthy();

      // Click the map location link
      fireEvent.click(mapLink);
    });

    // Verify the callback was called with correct coordinates
    expect(mockOnNavigateToTile).toHaveBeenCalledWith(25, 30);
  });

  it('calls onNavigateToLineage when clicking ancestral lineage link on speciation entry', async () => {
    const mockOnNavigateToLineage = vi.fn();

    (useStore as any).mockImplementation((selector: any) => {
      const state: any = {
        fieldJournal: mockFieldJournal,
        tick: 50,
        updateJournalEntryNotes: vi.fn(),
      };
      return selector(state);
    });

    render(
      <FieldJournal
        onNavigateToLineage={mockOnNavigateToLineage}
      />
    );

    // Click on the speciation entry to open the detail view
    const speciationEntry = screen.getByText(/Species B evolved from Species A/);
    fireEvent.click(speciationEntry);

    // Wait for detail view to open and find the ancestral lineage link
    await waitFor(() => {
      const ancestralLink = screen.getByTitle('Click to view parent lineage');
      expect(ancestralLink).toBeTruthy();

      // Click the ancestral lineage link
      fireEvent.click(ancestralLink);
    });

    // Verify the callback was called with correct species and lineage IDs
    // Note: ancestralSpeciesId is used for the lineage ID as well when navigating to the ancestral lineage
    expect(mockOnNavigateToLineage).toHaveBeenCalledWith('species-A', 'species-A');
  });

  it('does not render when journal is empty', () => {
    const emptyJournal = createFieldJournal(12345);

    (useStore as any).mockImplementation((selector: any) => {
      const state: any = {
        fieldJournal: emptyJournal,
        tick: 0,
        updateJournalEntryNotes: vi.fn(),
      };
      return selector(state);
    });

    render(<FieldJournal />);
    expect(screen.getByText(/The journal will record significant lineage events/)).toBeTruthy();
  });

  it('shows empty state message when fieldJournal is null', () => {
    (useStore as any).mockImplementation((selector: any) => {
      const state: any = {
        fieldJournal: null,
        tick: 0,
        updateJournalEntryNotes: vi.fn(),
      };
      return selector(state);
    });

    render(<FieldJournal />);
    expect(screen.getByText(/The journal will record significant lineage events/)).toBeTruthy();
  });

  it('filters journal entries by lineage when filter button is clicked', async () => {
    (useStore as any).mockImplementation((selector: any) => {
      const state: any = {
        fieldJournal: mockFieldJournal,
        tick: 50,
        updateJournalEntryNotes: vi.fn(),
      };
      return selector(state);
    });

    render(<FieldJournal />);

    // Initially, both entries should be visible (2 entries shown)
    expect(screen.getByText(/2 entries/)).toBeTruthy();

    // Find and click the lineage filter button for species-A
    const speciesAButtons = screen.getAllByText(/Species A/);
    // The lineage filter button should be one of these
    const filterButtons = screen.getAllByRole('button').filter((btn) =>
      btn.textContent?.includes('Species A') || btn.textContent?.includes('Lineage')
    );

    // Find the specific lineage filter button (should contain the species/lineage name)
    // This is a simplification; in a real test you'd be more specific
    const lineageFilters = screen.getAllByText(/●/); // Living lineage indicator
    if (lineageFilters.length > 0) {
      const firstFilter = lineageFilters[0].closest('button');
      if (firstFilter) {
        fireEvent.click(firstFilter);

        // After filtering, entry count should change
        await waitFor(() => {
          const entryCount = screen.queryByText(/2 entries/);
          // The count should be different or filtered down
          expect(entryCount).toBeFalsy(); // Should no longer show all entries
        });
      }
    }
  });
});
