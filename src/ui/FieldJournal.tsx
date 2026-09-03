/**
 * Field Journal UI Component
 *
 * Presents a searchable, filterable view of all lineage history entries.
 * Supports viewing living and extinct species side-by-side.
 * Mobile and desktop responsive.
 */

import { useState, useMemo, type CSSProperties } from 'react';
import { useStore } from '../state/store';
import type { FieldJournalEntry, FieldJournalEntryType, JournalSearchCriteria } from '../simulation/fieldJournal';
import { searchJournal, getLineageHistory, getAllLineagesInJournal } from '../simulation/fieldJournal';
import { speciesDisplayName, lineageDisplayName } from '../simulation/speciesNames';
import { formatTraitChange } from './lineageHistoryModel';

const panelStyle: CSSProperties = {
  backgroundColor: 'var(--sim-color-screen)',
  borderRadius: 8,
  padding: '0.75rem 1rem',
  color: 'var(--sim-color-screen-ink)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '0.8rem',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: CSSProperties = {
  fontWeight: 600,
  marginBottom: '0.6rem',
  fontSize: '0.9rem',
};

const searchBoxStyle: CSSProperties = {
  marginBottom: '0.5rem',
  display: 'flex',
  gap: '0.35rem',
  flexWrap: 'wrap',
};

const filterButtonStyle = (active: boolean): CSSProperties => ({
  padding: '0.25rem 0.45rem',
  borderRadius: 4,
  border: `1px solid ${active ? 'var(--sim-color-screen-accent)' : 'var(--sim-color-screen-border)'}`,
  background: active ? '#2a3d4a' : '#1a2023',
  color: active ? 'var(--sim-color-screen-accent)' : 'var(--sim-color-screen-ink-faint)',
  cursor: 'pointer',
  fontSize: '0.7rem',
  whiteSpace: 'nowrap',
});

const entriesContainerStyle: CSSProperties = {
  overflowY: 'auto',
  flex: 1,
  borderTop: '1px solid var(--sim-color-screen-border)',
  paddingTop: '0.5rem',
};

const entryItemStyle: CSSProperties = {
  background: '#1b2023',
  borderRadius: 6,
  padding: '0.55rem',
  marginBottom: '0.45rem',
  borderLeft: '3px solid #527786',
  cursor: 'pointer',
  transition: 'background 0.15s',
};

const entryItemHoverStyle: CSSProperties = {
  ...entryItemStyle,
  background: '#222834',
};

const entryTypeColors: Record<FieldJournalEntryType, string> = {
  'first-sighting': '#78cf83',
  adaptation: '#70c7d8',
  speciation: '#a8d5e8',
  'range-change': '#bdb76b',
  intervention: '#d4a5ff',
  extinction: '#ef7c7c',
};

interface FieldJournalEntryDisplayProps {
  entry: FieldJournalEntry;
  isSelected: boolean;
  onSelect: () => void;
  onViewInTimeline?: () => void;
}

function FieldJournalEntryDisplay({ entry, isSelected, onSelect, onViewInTimeline }: FieldJournalEntryDisplayProps) {
  const speciesName = speciesDisplayName(entry.speciesId);
  const lineageName = entry.lineageId ? lineageDisplayName(entry.speciesId, entry.lineageId) : null;
  const typeColor = entryTypeColors[entry.type];

  return (
    <div
      style={isSelected ? entryItemHoverStyle : entryItemStyle}
      onClick={onSelect}
      role="button"
      tabIndex={0}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.3rem', marginBottom: '0.25rem' }}>
        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flex: 1 }}>
          <span style={{ color: typeColor, fontWeight: 600, fontSize: '0.67rem' }}>
            {entry.type.replace('-', ' ').toUpperCase()}
          </span>
          {entry.type === 'extinction' && <span style={{ fontSize: '0.65rem', color: '#999' }}>†</span>}
        </div>
        <span style={{ color: '#666', fontSize: '0.67rem', whiteSpace: 'nowrap' }}>
          Tick {entry.tick}
        </span>
      </div>
      <div style={{ fontSize: '0.72rem', lineHeight: 1.3 }}>
        {lineageName ? (
          <>
            <span style={{ color: '#a8d5e8' }}>{lineageName}</span>
            <span style={{ color: '#999' }}> · {speciesName}</span>
          </>
        ) : (
          <span style={{ color: '#a8d5e8' }}>{speciesName}</span>
        )}
      </div>
      <div style={{ fontSize: '0.68rem', color: '#899ba2', marginTop: '0.2rem', lineHeight: 1.3 }}>
        {entry.observed.description}
      </div>
    </div>
  );
}

interface DetailViewProps {
  entry: FieldJournalEntry;
  onClose: () => void;
  onUpdateNotes: (notes: string) => void;
  onNavigateToTick?: (tick: number) => void;
}

function FieldJournalDetailView({ entry, onClose, onUpdateNotes, onNavigateToTick }: DetailViewProps) {
  const [notes, setNotes] = useState(entry.playerNotes ?? '');
  const [notesChanged, setNotesChanged] = useState(false);

  const speciesName = speciesDisplayName(entry.speciesId);
  const lineageName = entry.lineageId ? lineageDisplayName(entry.speciesId, entry.lineageId) : null;
  const typeColor = entryTypeColors[entry.type];

  const handleSaveNotes = () => {
    onUpdateNotes(notes);
    setNotesChanged(false);
  };

  const handleNavigateToTick = () => {
    onNavigateToTick?.(entry.tick);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--sim-color-screen)',
          borderRadius: 8,
          padding: '1rem',
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          color: 'var(--sim-color-screen-ink)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.3rem' }}>
              <span style={{ color: typeColor, fontWeight: 600, fontSize: '0.9rem' }}>
                {entry.type.replace('-', ' ').toUpperCase()}
              </span>
              {entry.type === 'extinction' && <span style={{ fontSize: '1rem' }}>†</span>}
            </div>
            {lineageName ? (
              <div style={{ fontSize: '0.9rem' }}>
                <span style={{ color: '#a8d5e8', fontWeight: 600 }}>{lineageName}</span>
                <span style={{ color: '#999' }}> · {speciesName}</span>
              </div>
            ) : (
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#a8d5e8' }}>{speciesName}</div>
            )}
            <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.2rem' }}>Tick {entry.tick}</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {onNavigateToTick && (
              <button
                onClick={handleNavigateToTick}
                style={{
                  background: 'var(--sim-color-screen-accent)',
                  border: 'none',
                  color: '#000',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  padding: '0.35rem 0.6rem',
                  borderRadius: 4,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
                title="Navigate to this moment in the timeline"
              >
                View Timeline
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--sim-color-screen-ink-faint)',
                cursor: 'pointer',
                fontSize: '1.2rem',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--sim-color-screen-border)', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.85rem' }}>Observed Evidence</div>
          <div style={{ fontSize: '0.75rem', lineHeight: 1.5, color: '#899ba2', marginBottom: '0.5rem' }}>
            {entry.observed.description}
          </div>

          {entry.observed.traitChanges && entry.observed.traitChanges.length > 0 && (
            <div style={{ fontSize: '0.72rem', color: '#7f898d', marginBottom: '0.4rem' }}>
              {entry.observed.traitChanges.map((change, i) => (
                <div key={i}>• {formatTraitChange(change)}</div>
              ))}
            </div>
          )}

          {entry.observed.population !== undefined && (
            <div style={{ fontSize: '0.72rem', color: '#7f898d', marginBottom: '0.4rem' }}>
              Population: {entry.observed.population}
            </div>
          )}

          <div style={{ fontSize: '0.7rem', color: '#667178', marginTop: '0.3rem' }}>
            Evidence: {entry.observed.evidence.join(', ')}
          </div>
        </div>

        {entry.observed.location && (
          <div style={{ borderTop: '1px solid var(--sim-color-screen-border)', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.85rem' }}>Map Location</div>
            <div style={{ fontSize: '0.75rem', color: '#899ba2' }}>
              Grid ({entry.observed.location.x}, {entry.observed.location.y})
            </div>
            <div style={{ fontSize: '0.7rem', color: '#667178', marginTop: '0.2rem' }}>
              Event occurred in this region of the world.
            </div>
          </div>
        )}

        {entry.inferred && (
          <div style={{ borderTop: '1px solid var(--sim-color-screen-border)', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.85rem' }}>Inferred Explanation</div>
            <div style={{ fontSize: '0.75rem', lineHeight: 1.5, color: '#899ba2', marginBottom: '0.4rem' }}>
              {entry.inferred.explanation}
            </div>
            <div
              style={{
                fontSize: '0.7rem',
                color: '#7f898d',
                padding: '0.35rem 0.4rem',
                background: '#161819',
                borderRadius: 3,
              }}
            >
              Confidence: {Math.round(entry.inferred.confidence * 100)}%
            </div>
            {entry.inferred.reasoning && entry.inferred.reasoning.length > 0 && (
              <div style={{ fontSize: '0.7rem', color: '#667178', marginTop: '0.3rem' }}>
                Reasoning:
                {entry.inferred.reasoning.map((r, i) => (
                  <div key={i} style={{ marginLeft: '0.5rem', marginTop: '0.15rem' }}>
                    • {r}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--sim-color-screen-border)', paddingTop: '0.75rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.85rem' }}>Player Notes</div>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setNotesChanged(true);
            }}
            placeholder="Add your observations or hypotheses..."
            style={{
              width: '100%',
              minHeight: '4rem',
              background: '#161819',
              border: '1px solid var(--sim-color-screen-border)',
              borderRadius: 4,
              padding: '0.5rem',
              color: 'var(--sim-color-screen-ink)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: '0.75rem',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
            {notesChanged && (
              <button
                onClick={handleSaveNotes}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: 4,
                  border: 'none',
                  background: 'var(--sim-color-screen-accent)',
                  color: '#000',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                }}
              >
                Save Notes
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: 4,
                border: '1px solid var(--sim-color-screen-border)',
                background: '#1a2023',
                color: 'var(--sim-color-screen-ink)',
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FieldJournal({ onNavigateToTick }: { onNavigateToTick?: (tick: number) => void } = {}) {
  const fieldJournal = useStore((s) => s.fieldJournal);
  const updateJournalEntryNotes = useStore((s) => s.updateJournalEntryNotes);
  const tick = useStore((s) => s.tick);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEntryType, setSelectedEntryType] = useState<FieldJournalEntryType | null>(null);
  const [selectedLineageFilter, setSelectedLineageFilter] = useState<string | null>(null);
  const [showExtinct, setShowExtinct] = useState(true);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const entryTypes: FieldJournalEntryType[] = [
    'first-sighting',
    'adaptation',
    'speciation',
    'range-change',
    'intervention',
    'extinction',
  ];

  const criteria: JournalSearchCriteria = useMemo(() => {
    const base: JournalSearchCriteria = {
      entryType: selectedEntryType ?? undefined,
      includeExtinct: showExtinct,
    };
    if (selectedLineageFilter) {
      const [speciesId, lineageId] = selectedLineageFilter.split(':');
      base.speciesId = speciesId;
      base.lineageId = lineageId;
    }
    return base;
  }, [selectedEntryType, showExtinct, selectedLineageFilter]);

  const allLineages = useMemo(() => {
    if (!fieldJournal) return [];
    return getAllLineagesInJournal(fieldJournal);
  }, [fieldJournal]);

  const filtered = useMemo(() => {
    if (!fieldJournal) return [];
    let results = searchJournal(fieldJournal, criteria);

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      results = results.filter((e) => {
        const speciesName = speciesDisplayName(e.speciesId).toLowerCase();
        const lineageName = e.lineageId ? lineageDisplayName(e.speciesId, e.lineageId).toLowerCase() : '';
        const desc = e.observed.description.toLowerCase();
        return speciesName.includes(term) || lineageName.includes(term) || desc.includes(term);
      });
    }

    return results.sort((a, b) => b.tick - a.tick);
  }, [fieldJournal, criteria, searchTerm]);

  const selectedEntry = selectedEntryId
    ? fieldJournal?.entryIndex.get(selectedEntryId)
    : null;

  if (!fieldJournal || fieldJournal.entries.length === 0) {
    return (
      <section style={panelStyle}>
        <div style={headerStyle}>Field Journal</div>
        <div style={{ color: 'var(--sim-color-screen-ink-faint)' }}>
          The journal will record significant lineage events: first sightings, adaptations, speciation, extinctions, and interventions.
        </div>
      </section>
    );
  }

  return (
    <>
      <section style={panelStyle} aria-labelledby="journal-title">
        <div id="journal-title" style={headerStyle}>
          Field Journal ({filtered.length} entries)
        </div>

        <div style={searchBoxStyle}>
          <input
            type="text"
            placeholder="Search species, lineages..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              minWidth: '150px',
              padding: '0.35rem 0.5rem',
              borderRadius: 4,
              border: '1px solid var(--sim-color-screen-border)',
              background: '#161819',
              color: 'var(--sim-color-screen-ink)',
              fontSize: '0.75rem',
            }}
          />
        </div>

        <div style={{ ...searchBoxStyle, fontSize: '0.75rem', marginBottom: '0.5rem' }}>
          {entryTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedEntryType(selectedEntryType === type ? null : type)}
              style={filterButtonStyle(selectedEntryType === type)}
            >
              {type.replace('-', ' ')}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowExtinct(!showExtinct)}
            style={filterButtonStyle(!showExtinct)}
          >
            Show Extinct
          </button>
        </div>

        {allLineages.length > 0 && (
          <div style={{ ...searchBoxStyle, marginBottom: '0.5rem', fontSize: '0.7rem' }}>
            {allLineages.map((ref) => (
              <button
                key={`${ref.speciesId}:${ref.lineageId}`}
                type="button"
                onClick={() => {
                  const key = `${ref.speciesId}:${ref.lineageId}`;
                  setSelectedLineageFilter(selectedLineageFilter === key ? null : key);
                }}
                style={{
                  ...filterButtonStyle(selectedLineageFilter === `${ref.speciesId}:${ref.lineageId}`),
                  padding: '0.2rem 0.35rem',
                  fontSize: '0.65rem',
                }}
              >
                {ref.status === 'extinct' ? '†' : '●'} {lineageDisplayName(ref.speciesId, ref.lineageId)}
              </button>
            ))}
          </div>
        )}

        <div style={entriesContainerStyle}>
          {filtered.length === 0 ? (
            <div style={{ color: 'var(--sim-color-screen-ink-faint)', fontSize: '0.75rem' }}>
              No entries match your search.
            </div>
          ) : (
            <div>
              {filtered.map((entry) => (
                <FieldJournalEntryDisplay
                  key={entry.id}
                  entry={entry}
                  isSelected={selectedEntryId === entry.id}
                  onSelect={() => setSelectedEntryId(entry.id)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {selectedEntry && (
        <FieldJournalDetailView
          entry={selectedEntry}
          onClose={() => setSelectedEntryId(null)}
          onUpdateNotes={(notes) => updateJournalEntryNotes(selectedEntry.id, notes)}
          onNavigateToTick={onNavigateToTick}
        />
      )}
    </>
  );
}
