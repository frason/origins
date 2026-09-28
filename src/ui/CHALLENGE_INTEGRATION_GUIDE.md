# Challenge System Integration Guide

## Overview

The challenge framework enables players to create, play, and compare deterministic ecosystem simulations without requiring real-time multiplayer or server storage.

## Architecture

### Files Involved

- **`src/simulation/challenges.ts`** — Core challenge types and functions
  - `Challenge`, `ChallengeSummary`, `ChallengeComparison` interfaces
  - `buildChallengeSummary()`, `compareChallengeOutcomes()`, serialization functions
  - Daily seed generation: `generateDailySeed()`, `createDailyChallenge()`

- **`src/ui/useChallenges.ts`** — React hook for challenge state management
  - Manages active challenge, session tracking, export/import
  - Provides `startChallenge()`, `endChallenge()`, `exportOutcome()`, etc.

- **`src/ui/ChallengePanel.tsx`** — React component for challenge UI
  - Browse available challenges
  - Export outcomes as JSON
  - Import friend's outcomes
  - Compare outcomes side-by-side

- **`src/ui/worldRecipe.ts`** — Portable recipe format
  - Versioned world configuration with deterministic seed
  - Actions: introduce species, adjust settings
  - Used by challenges to specify starting conditions

## Integration Steps

### Step 1: Add ChallengePanel to App.tsx

```tsx
import ChallengePanel from './ui/ChallengePanel';

export default function App() {
  // ... existing state and refs ...
  
  const [showChallengePanel, setShowChallengePanel] = useState(false);
  
  // In the JSX, add the panel:
  return (
    <div className="main-layout">
      <ControlPanel
        // ... existing props ...
        onToggleChallenges={() => setShowChallengePanel(!showChallengePanel)}
      />
      
      <ChallengePanel
        isVisible={showChallengePanel}
        sessionSummary={sessionSummary}  // Built from world state
        currentTick={tick}
        onStart={(challenge, recipe) => {
          // Load recipe and start challenge
          startNewWorld(recipe);
        }}
        onExport={(json) => {
          // Offer download or display
          downloadJsonFile(json, `challenge-outcome-${Date.now()}.json`);
        }}
      />
    </div>
  );
}
```

### Step 2: Wire Up Challenge Session Tracking

When a challenge is active, track milestones and evidence:

```tsx
// In your simulation loop or event handler:
if (challenges.activeChallenge && challenges.challengeSession) {
  // Record important moments
  if (/* some significant event */) {
    challenges.challengeSession.milestones.push({
      tick: currentTick,
      description: 'Species population peaked',
    });
  }
  
  if (/* mutation detected */) {
    challenges.challengeSession.evidence.push({
      tick: currentTick,
      type: 'adaptation',
      description: `Species ${speciesId} developed faster movement`,
    });
  }
}
```

### Step 3: Add Challenge Button to UI

In `ControlPanel.tsx` or similar, add a button to toggle the challenge panel:

```tsx
<button onClick={onToggleChallenges} className="challenge-button">
  🎯 Challenges
</button>
```

## Usage Flow

### For Players

1. **Browse Challenges**
   - Open Challenge Panel → "Browse" tab
   - Select a challenge (daily or custom)
   - Click "Play Challenge"

2. **Play & Adapt**
   - Run simulation normally
   - Challenge tracks objectives and milestones automatically
   - Can pause/adjust settings as usual

3. **Export Outcome**
   - When done, go to "Export" tab
   - Click "Export This Run"
   - Copy JSON or download file

4. **Share & Compare**
   - Send JSON file to friend (email, Discord, etc.)
   - Friend imports JSON in their app
   - Comparison shows divergence and strategy differences

## API Reference

### Challenge Interface

```typescript
interface Challenge {
  id: string;
  title: string;
  description: string;
  difficulty: 'tutorial' | 'easy' | 'moderate' | 'hard' | 'expert';
  recipe: WorldRecipe;          // Deterministic starting config
  engineVersion: EngineVersion;  // For compatibility checking
  recipeVersion: number;
  timeLimit?: number;           // Max ticks
  objectives?: ChallengeObjective[];
  author?: string;
  featured?: boolean;           // Highlight this challenge
}
```

### ChallengeSummary Interface

```typescript
interface ChallengeSummary {
  challengeId: string;
  runId: string;  // Unique per run
  finalTick: number;
  completionStatus: 'success' | 'failure' | 'abandoned';
  finalStats: {
    population: number;
    activeSpecies: number;
    totalBirths: number;
    totalExtinctions: number;
    // ... more metrics
  };
  milestones: ChallengeMilestone[];
  evidence: ChallengeEvidence[];
  notes?: string;
  outcomeRecipe?: WorldRecipe;  // For verification
}
```

### Hook Usage

```typescript
const {
  activeChallenge,      // Current Challenge or null
  challengeSession,     // Session metadata and tracking
  exportedOutcome,      // JSON string of last export
  importedSummary,      // Friend's ChallengeSummary
  comparison,           // ChallengeComparison result
  comparisonError,      // Error message if import failed
  
  startChallenge,       // (challenge: Challenge) => void
  endChallenge,         // (summary, tick) => ChallengeSummary | null
  exportOutcome,        // (summary: ChallengeSummary) => string
  importOutcome,        // (jsonText: string) => boolean
  compareOutcomes,      // (s1, s2) => ChallengeComparison
  clearChallenge,       // () => void
} = useChallenges();
```

## Privacy & Sharing

### MVP (Current): Local-First

- ✅ Export outcomes as JSON files
- ✅ No server storage required
- ✅ No authentication needed
- ✅ Share via email, Discord, pastebin, etc.
- ✅ Comparison happens client-side

### V2 (Future): Optional Hosted Leaderboards

- Players can opt-in to publish summaries
- Leaderboards filtered by difficulty/date/author
- Always export-friendly (not locked)
- Privacy controls (anonymous/named)

## Testing

### Determinism Verification

```typescript
import { generateDailySeed } from '../simulation/challenges';

// Same date always produces same seed
const seed1 = generateDailySeed('2025-06-15');
const seed2 = generateDailySeed('2025-06-15');
expect(seed1).toBe(seed2);  // ✅ Pass

// Different dates produce different seeds
const seed3 = generateDailySeed('2025-06-16');
expect(seed1).not.toBe(seed3);  // ✅ Pass
```

### Comparison Testing

```typescript
import { compareChallengeOutcomes } from '../simulation/challenges';

const comparison = compareChallengeOutcomes(myOutcome, friendOutcome);

if (comparison.divergenceType === 'identical') {
  console.log('Fully reproducible!');
} else if (comparison.divergenceType === 'incompatible') {
  console.log(`Incompatible: ${comparison.divergenceReason}`);
} else {
  console.log(`Divergence: ${comparison.summary}`);
}
```

## Future Enhancements

1. **Objective Tracking** — Auto-detect when objectives are met
2. **Leaderboards** — Optional hosted comparison of daily challenges
3. **Replay Verification** — Re-run a friend's outcome to verify determinism
4. **Challenge Library** — Curated challenges from community
5. **Ecosystem Presets** — Themed worlds (island, tundra, coral reef)
6. **Multiplayer Sharing** — See live leaderboards without accounts

## Troubleshooting

### "Incompatible versions"

- Two players must have the same MAJOR engine version to compare
- MINOR or PATCH differences are usually safe but may indicate different features
- Check `engineVersion` in exported JSON

### "Outcomes don't match"

- Ensure same recipe seed
- Verify no interventions differ (check `totalInterventions` in summary)
- Different strategies naturally produce different results

### Export is blank

- Challenge must be active (started via Browse tab)
- Complete at least one tick of simulation
- Click "Export This Run" to generate outcome

## References

- **Challenge types:** `src/simulation/challenges.ts`
- **Hook API:** `src/ui/useChallenges.ts`
- **Component:** `src/ui/ChallengePanel.tsx`
- **Recipe format:** `src/ui/worldRecipe.ts`
