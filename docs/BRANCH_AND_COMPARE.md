# Branch-and-Compare: Counterfactual World Runs

## Overview

The branch-and-compare feature enables players to rewind to a checkpoint, change one intervention, and compare how the ecosystem diverges. This allows deep exploration of causality and ecosystem sensitivity to specific interventions.

## Core Concepts

### World Branch
A `WorldBranch` represents a divergent simulation timeline created from a checkpoint. Each branch tracks:
- **Fork Point**: The tick where the branch diverged from its parent
- **Changed Intervention**: What was different (settings change or species introduction)
- **Common History**: All events and state up to the fork point (shared with parent)
- **Divergent History**: Events after the fork point (unique to this branch)
- **Checkpoints**: Snapshot tiers at fixed intervals for replay support

### Branch Collection
A `BranchCollection` manages multiple branches:
- **Main Branch**: The original timeline (always preserved)
- **Alternatives**: Up to N counterfactual scenarios (oldest removed when storage full)

## User Workflow

### 1. Create a Branch from Checkpoint

```typescript
import { createBranch } from '../simulation/worldBranch';

const intervention: ChangedIntervention = {
  tick: 50,
  kind: 'settings-change',
  label: 'baseMetabolism: 2.0 → 1.0'
};

const branch = createBranch(
  currentWorldState,
  50, // fork tick
  intervention,
  'Low Metabolism Scenario'
);
```

### 2. Simulate Branch Forward

After creating a branch, the player can:
- Replay the alternative intervention at the fork tick
- Fast-forward using the world recipe (preserves determinism)
- Record checkpoints at regular intervals
- Observe how the ecosystem diverges

### 3. Compare Branches

```typescript
import { compareBranches, findCommonHistoryTick } from '../simulation/worldBranch';

const commonTick = findCommonHistoryTick(branchA, branchB);
const divergence = compareBranches(branchA, branchB, commonTick);

// Analyze:
// - divergence.divergenceTick: First major event difference
// - divergence.extinctionDifferences: Species extinctions that differ
// - divergence.metricsSamples: Population/biomass timelines
```

### 4. Visualize Comparison

The `BranchComparisonView` component displays:
- **Metrics Cards**: Population, species count, living energy, biomass
- **Divergence Analysis**: Major events, extinctions, timeline
- **Branch Metadata**: Changed intervention, fork tick
- **Responsive Design**: Works on desktop and mobile

## Technical Implementation

### File Structure

```
src/
├── simulation/
│   ├── worldBranch.ts              # Core branching logic
│   └── (tests/worldBranch.test.ts) # 27 tests
├── state/
│   ├── store.ts                    # Branch state management
│   └── branchPersistence.ts        # Save/load/export
│       (tests/branchPersistence.test.ts) # 17 tests
└── ui/
    └── BranchComparison.tsx        # React UI component
```

### Key Data Structures

#### WorldBranch
```typescript
interface WorldBranch {
  id: string;                           // Unique identifier
  name: string;                         // Display name
  branchFromTick: number;              // Fork point
  changedIntervention: ChangedIntervention; // What changed
  tick: number;                         // Current tick on branch
  worldState: WorldSnapshot | null;    // Latest state
  checkpoints: Array<{tick, creatureIdCounter?}>; // Saved tiers
  seed: number;                         // Parent seed (deterministic)
  createdAt: number;                    // Timestamp
  active: boolean;                      // Currently viewing?
}
```

#### BranchDivergence
```typescript
interface BranchDivergence {
  divergenceTick?: number;             // First major difference
  differedMajorEvents: Array<...>;     // Speciation, extinction, etc.
  extinctionDifferences: Array<...>;   // Species extinctions that differ
  metricsSamples: Array<...>;          // Ecosystem metrics at checkpoints
}
```

### State Management (Zustand)

The store exposes:
```typescript
// Branch management
branchCollection: BranchCollection | null;
activeBranchId: string | null;  // null = main branch
showBranchComparison: boolean;

// Actions
setBranchCollection(collection)
createBranch(branch)
activateBranch(branchId)
removeBranch(branchId)
updateBranch(branchId, updates)
setShowBranchComparison(show)
```

### Persistence

#### Save Branches
```typescript
import { saveBranches, loadBranches } from '../state/branchPersistence';

saveBranches(window.localStorage, branchCollection, 10 * 1024 * 1024);
```

- Automatically bounds storage to 10 MB (configurable)
- Removes oldest alternative branches when exceeding limit
- Version-compatible (format version 1)
- Validates all branches on load

#### Export/Import
```typescript
const json = exportBranch(branch);     // Portable JSON string
const branch = importBranch(json);     // Import from string
```

## API Reference

### Core Functions

#### `createBranch(parentWorld, branchFromTick, changedIntervention, name)`
Creates a new branch from a checkpoint with the given intervention change.

#### `captureCheckpointOnBranch(branch, worldState, interval, limit)`
Records a checkpoint on the branch at the specified tick interval.

#### `sampleMetrics(world)`
Extracts ecosystem metrics (population, species, energy, biomass, extinctions).

#### `compareBranches(branchA, branchB, commonTick)`
Analyzes divergence between two branches after their common history.

#### `findCommonHistoryTick(branchA, branchB)`
Returns the earlier fork point (both branches shared history up to this tick).

#### `estimateBranchSize(branch)`
Estimates storage size in bytes.

#### `boundBranchStorage(collection, maxBytes)`
Removes oldest alternative branches if exceeding storage limit.

#### `validateBranchCompatibility(branch)`
Checks if branch has all required fields (used on load).

## Features & Constraints

### ✅ Supported
- **Multiple branches** from one checkpoint
- **Deterministic replay** (same seed = same results)
- **Asynchronous divergence** (ecosystem changes over time, not instantly)
- **Synchronized timeline** (compare metrics at matching ticks)
- **Storage bounds** (automatic pruning of oldest branches)
- **Version compatibility** (detect and reject incompatible branch formats)
- **Mobile-responsive** UI (grid layout adapts)

### ⚠️ Known Limitations
- **Version transitions unsupported**: If branch format version changes, old branches must be discarded
- **No merging**: Branches cannot be recombined (one-way divergence)
- **Storage per-device**: Branches stored in localStorage (not cloud-synced)
- **Checkpoint overhead**: Keeping many branches consumes storage (bounded at 10 MB)

## Testing

### Unit Tests
**worldBranch.test.ts** (27 tests)
- Branch creation and metadata preservation
- Checkpoint capture and interval enforcement
- Metrics sampling (population, energy, biomass)
- Divergence analysis (extinctions, major events)
- Storage estimation and bounding
- Branch validation

**branchPersistence.test.ts** (17 tests)
- Save/load round-trip
- Storage validation and compatibility
- Import/export functionality
- Storage statistics
- Size constraints

### Integration Testing
To test end-to-end:

1. Create a world and simulate to tick 50
2. Create checkpoint at tick 50
3. Create two branches with different interventions
4. Simulate each branch forward independently
5. Compare branches and verify divergence metrics

```typescript
// Example integration test
const world = createTestWorld(100, 50);
const branch1 = createBranch(world, 50, {
  tick: 50,
  kind: 'settings-change',
  label: 'High metabolism'
}, 'Scenario A');

const branch2 = createBranch(world, 50, {
  tick: 50,
  kind: 'species-introduction',
  label: 'With predator'
}, 'Scenario B');

// Simulate forward...
// Compare...
const divergence = compareBranches(branch1, branch2, 50);
expect(divergence.divergenceTick).toBeDefined();
```

## UI Integration

### React Component: BranchComparisonView

```typescript
<BranchComparisonView
  branchA={branch1}
  branchB={branch2}
  onSelectBranch={(id) => store.activateBranch(id)}
/>
```

**Features:**
- Branch selector dropdowns
- Side-by-side metrics comparison
- Divergence timeline
- Extinction tracking
- Responsive grid layout
- Styled with CSS-in-JS

**Mobile Optimization:**
- Metrics stack vertically on small screens
- Timeline scrolls horizontally with touch support
- Branch selectors full-width on mobile
- Touch-friendly tap targets (min 44px)

## Future Enhancements

1. **Merging**: Support creating hybrid branches by selecting traits from each parent
2. **Cloud Sync**: Sync branches to user account (V2)
3. **Sharing**: Export branch collections to share counterfactual scenarios
4. **Analytics**: Advanced divergence metrics (mutation rate changes, trait evolution)
5. **Predictions**: Use branch history to predict future outcomes
6. **Undo/Redo**: Rewind within a branch (currently copy entire state)

## Related Issues

- **#156**: Parent issue (replay & timeline support)
- **#247**: Phase A epic (now closed)
- **#179**: This feature

## References

- [Project Vision](./genesis_vision.docx)
- [MVP Technical Spec](./genesis_mvp_technical.docx)
- [Design Architecture Review](./ORIGINS_DESIGN_ARCHITECTURE_REVIEW.md)
