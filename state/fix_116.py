import subprocess

REPO = "frason/origins"

body = """### Priority

Normal

### Timing

After cumulative-divergence speciation (#115), meaningful reproduction-rate mechanics, and physical predation traits such as armor, bone density, and prey-size limits. Before social communication and learning systems.

### Goal

Make hearing an ecological sense by adding bounded sound creation and propagation, while allowing predators to stalk quietly and prey to react to audible danger. Sound must affect simulation behavior without requiring continuous wave simulation or favoring predetermined outcomes.

### Sound creation

Create short-lived deterministic sound events from meaningful actions:

- normal and fast movement;
- feeding and scavenging;
- attacks, struggles, and distress;
- reproduction or mating calls;
- deliberate social calls in a later-compatible form.

Signal intensity should derive from action, body size, speed, terrain, and a heritable auditory-stealth or quiet-movement trait.

### Predator stealth

- Predators may choose a stalking movement mode near potential prey.
- Stalking reduces movement noise but also reduces speed and/or increases energy cost.
- Auditory stealth is the sound equivalent of camouflage; visual camouflage and quiet movement remain separate characteristics.
- Prey that hears a predator may flee or increase vigilance before visual detection.
- Failed stealth, attacks, and struggles should produce louder signals that can attract competitors or scavengers.

### Propagation and hearing

- Represent sound as bounded events: source position, signal type, intensity, tick, and deterministic falloff.
- Forest, mountain, open land, wetland, and water may modify range or attenuation through data-driven biome rules.
- Hearing range and sensitivity determine whether a creature detects a signal.
- Detection should communicate approximate direction/threat or opportunity, not perfect source knowledge.
- Predators may investigate prey sounds; prey may flee threat sounds; scavengers may investigate feeding, struggle, or distress sounds.
- Sound events expire quickly and remain bounded for large populations.

### Evolution and tradeoffs

- Hearing sensitivity and auditory stealth must be heritable and mutable.
- Better hearing carries a sensory/brain energy cost.
- Quiet movement trades speed, energy, or attack opportunity for reduced detection.
- Loud calls can help mating or coordination later but also expose the caller.
- Selection determines whether these traits persist; the engine must not deliberately evolve a desired response.

### UX and observability

- Creature and lineage inspection explains hearing ability, noise production, and quiet-movement adaptation.
- Important reactions may appear as concise events without flooding the timeline.
- Optional world visualization may briefly indicate detected sound radius/direction, but actual audio playback is out of scope.

### Determinism, performance, and tests

- Same seed and state produce identical sound events and reactions.
- Tests cover intensity/falloff, biome attenuation, expiration, hearing thresholds, stalking tradeoffs, prey flight, predator investigation, and scavenger attraction.
- Visual camouflage does not silently substitute for auditory stealth.
- Sound processing is spatially bounded and avoids all-creatures-by-all-sounds scans at large populations.
- Long-run sustainability, replay snapshots, full tests, and production build pass.

### Dependencies

Conceptually follows #115 and the planned physical predation-trait work. It should reuse deterministic spatial indexing from #101 and remain compatible with future social communication.

---
**Priority note (2026-08-11):** the client-approved Crisis-Response pivot (see SPEC.md "Pivot: Crisis-Response Reframe") is now the active build target. This was previously an ungated backlog item; adding an explicit gate so it doesn't compete with Phase 0/A worker time. Re-evaluated once Phase 0 is verified.

<!-- agent-planned -->

---
**Re-gated (pass #58):** karen gave #116 a fresh FAILED verdict this pass (worker produced a disconnected, uncommitted, untested `soundEcology.ts` utility with no engine integration, no UI, no tests -- see issue comments for the full gap list). Root-caused *why* a worker picked up this legacy issue at all while Phase A (#248/#249/#252) is the client-approved active priority: dispatcher worker-selection is oldest-issue-number-first (scripts/dispatcher.sh), so any lower-numbered legacy `agent-todo` issue like this one wins every worker pass ahead of the higher-numbered Phase A issues, every single cycle since Phase A opened (pass #55). Re-gating behind #247 (Phase A epic), same treatment as the 6 epics re-gated pass #56, so Phase A actually gets worked next instead of burning cycles on paused legacy scope. Re-evaluate (and pick up the "Gaps to close" list from karen's verdict comment) once #247 closes.

depends_on: #247
"""

r = subprocess.run(
    ["gh", "issue", "edit", "116", "--repo", REPO, "--body", body],
    capture_output=True, text=True
)
print(r.returncode, r.stdout, r.stderr)
