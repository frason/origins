# Event Compaction and Bounded Persistence

**Issue:** #176  
**Status:** Implemented  
**Addresses:** Unbounded event growth during long simulation runs  

## Problem Statement

The simulation engine accumulates all events (births, deaths, mutations, extinctions, etc.) in an unbounded array. Over long runs (100K+ ticks), this causes:

- **Memory bloat:** Event array grows linearly with ticks (potentially 100K+ events)
- **Serialization overhead:** JSON persistence becomes slow and exceeds storage limits
- **Replay complexity:** Carrying full event history makes checkpoint restoration expensive
- **Observability burden:** UI must filter through massive event logs for meaningful patterns

## Solution: Bounded Event Compaction

The system separates events into **tiers** based on importance and age:

1. **Milestone Events** (preserved indefinitely)
   - Extinctions, speciation, major interventions, environmental shocks
   - Never discarded; essential for replay and causal understanding
   - Comprise ~200-2000 events over typical runs

2. **Recent Detail Events** (preserved for a time window)
   - Individual births, deaths, mutations
   - Retained for recent DETAILED_RETENTION_TICKS (2000 by default)
   - Enables fine-grained UI timeline and metric calculation
   - Grows at tick rate but bounded by window

3. **Aggregated Events** (summary of old detail)
   - Groups of old births/deaths into 50-tick buckets
   - Capture population dynamics without individual records
   - Drastically reduce old event volume
   - Support long-term trend analysis

## Strategy

### Retention Policy

```
Current tick T:
├─ Milestones (all ages)   → keep all
├─ Recent detail           → keep if tick > T - 2000
└─ Old detail              → aggregate into 50-tick summaries
```

### Event Classification

```typescript
type EventTier = 'milestone' | 'detail' | 'compactable';

milestone: 'extinction' | 'speciation' | 'intervention' | 'environmental-shock'
detail:    (any non-compactable, usually rare)
compactable: 'birth' | 'death' | 'mutation'
```

### Compaction Algorithm

Called at **checkpoint boundaries** (every 10 ticks) to maintain determinism:

1. Partition events into milestone/detail/compactable
2. Apply retention window cutoff (DETAILED_RETENTION_TICKS)
3. Aggregate old compactables into 50-tick time buckets
4. Merge and sort result
5. Truncate if exceeding MAX_EVENTS_BEFORE_COMPACT (10,000 events)
   - Preserve all milestones + recent detail first
   - Discard oldest aggregates if necessary

### Aggregate Event Structure

```typescript
interface AggregateEvent extends SimEvent {
  type: 'birth' | 'death' | 'mutation';
  aggregatedCount?: number;      // e.g., 150 births in bucket
  aggregatedFrom?: number;       // earliest tick in bucket
  aggregatedTo?: number;         // latest tick in bucket
  detail: string;                // "150 births (ticks 100–149)"
}
```

## Memory and Serialization Budgets

### Scenario 1: Short Run (10,000 ticks)
- Speciation events: ~150
- Extinction events: ~200
- Intervention events: ~50
- Recent detail (last 2000 ticks): ~2000 events
- Aggregated old: ~1000 events (50-tick buckets)
- **Total: ~3400 events, ~800 KB serialized**

### Scenario 2: Medium Run (100,000 ticks)
- Milestone events: ~2000
- Recent detail: ~2000 events
- Aggregated old: ~1800 events (1000 ticks × 20 events per bucket)
- **Total: ~5800 events, ~1.5 MB serialized**

### Scenario 3: Long Run (1,000,000 ticks)
- Milestone events: ~8000
- Recent detail: ~2000 events
- Aggregated old: capped at MAX_EVENTS (10,000 total)
- **Total: ~10,000 events (hard cap), ~2.5 MB serialized**

### Storage Comparison

| Scenario | Without Compaction | With Compaction | Reduction |
|----------|-------------------|-----------------|-----------|
| 10K ticks | 3.5 MB | 0.8 MB | 77% |
| 100K ticks | 35 MB | 1.5 MB | 96% |
| 1M ticks | 350 MB | 2.5 MB (capped) | 99% |

## Determinism and Replay

### Guaranteed Properties

1. **Same input seed → same compaction result**
   - Compaction algorithm is pure (no randomness)
   - Deterministic event ordering preserved
   - Aggregate buckets compute consistently

2. **Replay from checkpoint is unaffected**
   - Compaction only affects serialized output
   - Live EngineState retains full events during simulation
   - Checkpoint restoration loads compacted events but continues correctly

3. **Version tracking for forward compatibility**
   - EVENT_COMPACTION_VERSION tracks strategy changes
   - PersistedEngineState includes compactionVersion field
   - Future migrations can detect old compaction formats

### Replay Guarantees

Events necessary for **causal understanding** are always preserved:

- **Lineage tracking:** Speciation/extinction/births linked by lineageId
- **Intervention evidence:** All god-mode changes recorded as milestones
- **Ecosystem shifts:** Major environmental shocks never discarded
- **Recent history:** Full detail for observing current state evolution

Old births/deaths can be aggregated because:
- They don't affect future tick outcomes (already processed)
- Ecosystem history sampling captures population trends
- Lineage trees are reconstructed from remaining milestones + journal entries

## Implementation

### Core Modules

- **eventCompaction.ts:** Compaction logic, classification, aggregation
- **enginePersistence.ts:** Integration with save/load, metadata tracking
- **checkpointTimeline.ts:** Checkpoint creation at appropriate intervals

### Configuration Constants

```typescript
// Keep detailed records for recent ticks
DETAILED_RETENTION_TICKS = 2000

// Aggregate old events into time buckets
BUCKET_SIZE = 50

// Maximum events before hard cap triggered
MAX_EVENTS_BEFORE_COMPACT = 10000

// Current compaction format version
EVENT_COMPACTION_VERSION = 1
```

### Persistence Integration

When saving world state:

```typescript
const persisted = createPersistedEngineState(state);
// Returns: {
//   ...baseState,
//   compactionVersion: 1,
//   eventCompactionMetadata: {
//     originalEventCount: 15000,
//     compactedEventCount: 8500,
//     estimatedSerializedBytes: 1800000,
//     compactionAppliedAtTick: 50000,
//   }
// }
```

## Testing Strategy

### Unit Tests (eventCompaction.test.ts)

- Event classification (milestone vs. detail vs. compactable)
- Retention window application
- Aggregation correctness (count, tick ranges)
- Bounded size enforcement
- Determinism (same input → same output)
- Size estimation accuracy
- Real-world scenario simulation (10K, 100K, 1M tick runs)
- Replay requirements preservation

### Integration Tests (enginePersistence.test.ts)

- Compaction applied during persistence
- Metadata tracked accurately
- Milestone events retained through round-trip save/load
- No corruption on high-event-count worlds
- Event count reduction verified

### Performance Tests

- Compaction cost per checkpoint: < 5ms
- No observable frame-rate impact during simulation
- Serialization overhead for 10K events: < 100ms

## Future Enhancements

### Phase 2: Adaptive Thresholds

- Adjust DETAILED_RETENTION_TICKS based on available memory
- Dynamic bucket sizing for aggregates
- Feedback loop: if serialized size > budget, increase aggregation

### Phase 3: Event Archiving

- Option to export compacted old events to disk/archive
- Separate "cold" event store (rarely accessed)
- Reconstruct full history if needed for analysis

### Phase 4: Event Streaming

- Stream recent events to server (for multiplayer)
- Server applies its own compaction strategy
- Only transmit milestones + aggregates for bandwidth efficiency

## FAQ

**Q: Will I lose replay capability?**  
A: No. Milestones are never discarded, and recent events are preserved. Compaction only summarizes very old births/deaths that don't affect future simulation.

**Q: How do I see the full history of my world?**  
A: Use the Field Journal (lineage history) which indexes by species/lineage, not by raw events. The journal has its own retention strategy focused on biological significance.

**Q: What if I hit the hard cap (10K events)?**  
A: This is rare (only at 1M+ ticks with intensive interventions). The oldest aggregates are discarded first, preserving all milestones and recent events.

**Q: Can I disable compaction?**  
A: Currently no. For MVP, compaction is always active to ensure long runs don't crash. A future flag could disable it for debugging, but this isn't recommended for production.

**Q: Will different RNG streams affect compaction?**  
A: No. Compaction is deterministic based only on event types, ages, and tick numbers. RNG seeds don't influence compaction decisions.

## References

- Issue #176: Engine scale: bound detailed events and compact checkpoint persistence
- checkpointTimeline.ts: Related checkpoint management
- fieldJournal.ts: Separate system for lineage preservation
- enginePersistence.ts: Save/load integration
