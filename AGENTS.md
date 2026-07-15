# Project Origins — Persistent Ecosystem Simulation

**Status:** MVP Development  
**Owner:** @frason  
**Last Updated:** 2026-06-23

## Vision

Project Origins is a persistent ecosystem simulation where players act as an ancient alien civilization guiding life across evolving worlds. Rather than directly controlling creatures, players influence evolution through species creation, mutation breeding, and environmental stewardship. The core focus is building resilient ecosystems with high biodiversity and long-term survival.

### Core Principles

- **Ecosystems over species** — Success measured by ecosystem health, not individual creature power
- **Influence over control** — Empower emergent behavior rather than scripting outcomes
- **Emergence over scripting** — Systems-based evolution with real mutation and adaptation
- **Stewardship over domination** — Players are gardeners, not gods

## MVP Scope: Local Evolution Sandbox

The MVP (V1) is a **deterministic, local-first evolution sandbox** that validates:
- Players form emotional attachment to species and lineages
- The simulation engine produces interesting, observable adaptations
- Environmental pressures drive speciation and extinction

### Core Simulation Rules

**Never assume plants.** The simulation models:
1. **Energy Source** → Solar, Geothermal, Chemical, Radioactive, or Mixed
2. **Producers** → Convert energy to biomass (e.g., plants, algae, chemosynthesizers)
3. **Consumers** → Herbivores, carnivores, omnivores eating other organisms
4. **Decomposers** → Break down corpses into nutrients
5. **Nutrient Recycling** → Nutrients feed producers, closing the loop

### World Model

- **Grid:** 100×100 cells (future expansion to larger)
- **Cell State:** Available Energy, Nutrients, Producer Biomass, Toxicity
- **Time Step:** Discrete simulation loop
- **Determinism:** Same seed → identical results (supports replay/debugging)

### Simulation Flow per Tick

1. Energy Generation
2. Producer Growth (photosynthesis, chemosynthesis)
3. Creature Decisions (move, eat, interact)
4. Movement
5. Feeding (energy transfer)
6. Energy Updates
7. Reproduction (if energy sufficient)
8. Death (if starved/old)
9. Decomposition (convert corpse → nutrients)
10. Nutrient Recycling
11. Event Generation (log mutations, extinctions, births)

### Species Traits (MVP)

**Physical Traits:**
- Size (impacts energy needs, speed, vision range, reproduction cost)
- Speed (movement per tick, hunting/fleeing effectiveness)
- Vision Range (search radius for food)
- Hearing Range (detect nearby threats/food)
- Camouflage (avoid predator detection)
- Armor (reduce damage from predators)
- Bone Density (affects size-to-strength ratio)
- Metabolism (base energy consumption)
- Reproduction Rate (offspring per breeding event)

**Cognitive Traits:**
- Brain Size (affects decision complexity, energy cost)
- Consciousness Level (enables learning/memory in future versions)

**Social Traits:**
- Communication (coordinate with same species)
- Collective Connection (herd behavior, symbiosis)

**Ecological Traits:**
- Energy Acquisition Strategy (herbivore, carnivore, omnivore, scavenger)

### Creature Lifecycle

```
Birth (placed with initial energy)
  ↓
Growth (accumulate energy, grow size)
  ↓
Reproduction (consume energy to create offspring)
  ↓
Death (starvation, predation, age)
  ↓
Corpse (decaying, consuming nutrients)
  ↓
Decomposition (nutrients released)
  ↓
[Nutrients feed Producers]
```

### Player Success Criteria

Players voluntarily return to:
- Check how their species adapted
- Witness extinction and speciation
- Trace lineage history
- Observe ecosystem stability/collapse
- Celebrate emergent behaviors

## Architecture Overview

### Tech Stack

- **Frontend:** React + TypeScript (UI for world visualization, controls)
- **Simulation Engine:** TypeScript (deterministic, portable)
- **State Management:** TBD (Redux, Zustand, or event sourcing)
- **Storage:** TBD (LocalStorage for MVP, DB for multiplayer in V2)
- **Visualization:** Canvas/WebGL for 2D grid, creature rendering

### Module Structure (Proposed)

```
src/
├── simulation/          # Core evolution engine
│   ├── world.ts        # World grid, energy, nutrients
│   ├── producer.ts     # Plant/algae biomass logic
│   ├── creature.ts     # Individual creature state, traits
│   ├── species.ts      # Species definition, mutations, breeding
│   ├── energy.ts       # Energy flow, feeding, metabolism
│   ├── engine.ts       # Main simulation loop
│   └── rng.ts          # Deterministic RNG (seeded)
├── ui/                  # React components
│   ├── WorldView.tsx   # Canvas/grid renderer
│   ├── SpeciesPanel.tsx # Species list, lineage tree
│   ├── ControlPanel.tsx # Play/pause, speed, gene editing
│   └── StatsPanel.tsx  # Biodiversity, ecosystem metrics
├── state/               # State management
│   ├── store.ts        # Global app state
│   └── slices/         # Redux slices or Zustand stores
├── utils/
│   ├── traits.ts       # Trait definitions, mutation rates
│   └── constants.ts    # World size, energy rates, timeouts
└── tests/
```

## Development Roadmap

### V1: Local Sandbox (MVP — current)
- Deterministic evolution engine
- 100×100 world with energy, producers, consumers, decomposers
- Manual species creation UI (set traits)
- Real-time simulation visualization
- Lineage history tracking
- Save/load simulation state

### V2: Shared Worlds
- Multiplayer server (WebSocket)
- Multiple players influence same world
- Ecosystem collaboration/competition
- Persistent world storage (PostgreSQL)
- Player reputation/stewardship metrics

### V3: Planetary Ecosystems
- Biome simulation (tundra, desert, rainforest, ocean)
- Water cycles, climate simulation
- Larger worlds (1000×1000+)
- Plate tectonics, disaster events
- Symbiosis and parasitism

### V4: Galactic Simulation
- Manage multiple planets
- Terraform tools
- Long-term (1M+ tick) simulation
- AI advisor/consequence visualization
- Emergent storylines from ecosystem states

## Key Metrics & Success

### Emotional Investment
- Lineage tree depth (players follow family lines)
- Named species (user-assigned names persist)
- Extinction reactions (when a species dies out)

### Ecosystem Health
- Biodiversity (species count, genetic diversity)
- Stability (absence of total collapse)
- Trophic structure (balanced food chains)

### Engagement
- Session length (time until return)
- Frequency (replay value)
- Experiments (different world configs tried)

## Design Principles

1. **Determinism First** — All randomness seeded; replay any world identically
2. **Emergence Over Rules** — Avoid hard-coded behaviors; let traits interact
3. **Transparent Metrics** — Show energy, biomass, mutation rates, etc.
4. **Playfulness** — Small creatures are charming; reward discovery
5. **Accessibility** — No biology PhD required; tooltips and guides included

## Implementation Notes

### For Lead Agent / Implementation Team

**Phase 1 Priorities:**
1. **Simulation Engine** — deterministic loop, energy flow, reproduction logic
2. **UI Foundation** — World grid visualization, basic controls, stats display
3. **Species Editor** — Create/mutate species before simulation starts
4. **Save/Load** — Persist world state to localStorage

**Testing Strategy:**
- Unit tests on energy/reproduction logic (most failure-prone)
- Integration tests on full simulation loop
- Snapshot tests on determinism (same seed = same results)
- Manual testing on emergent behaviors

**Performance Targets:**
- Simulate 1000+ creatures @ 60 FPS
- World updates in <16ms per frame
- No pauses during rendering

**Documentation Needed:**
- Trait system design (mutation rates, inheritance)
- Energy budget calculations (food → growth → reproduction)
- World config format (seed, energy type, initial species, etc.)

## References

- **Master Design Reference:** `/docs/Project_Genesis_Master_Design_Reference_v1_1.docx`
- **MVP Technical Spec:** `/docs/Project_Genesis_MVP_Technical.docx`
- **Product Vision:** `/docs/Project_Genesis_Vision.docx`

---

**Questions?** Reach out to @frason or check `/docs` for detailed specs.
