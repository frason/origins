import type { CreatureSnapshot } from '../state/store';
import type { EnergyStrategy, Traits } from '../utils/traits';
import type { SpeciesProfile } from '../simulation/speciation';
import { traitDivergence } from '../simulation/speciation';

export interface LineageSummary {
  lineageId: string;
  population: number;
  representativeTraits: Traits;
  divergence: number;
}

export interface SpeciesDisplaySummary {
  speciesId: string;
  population: number;
  strategy: EnergyStrategy;
  lineages: LineageSummary[];
}

/** Build stable, display-ready species and lineage counts from a world snapshot. */
export function summarizeSpecies(
  creatures: CreatureSnapshot[],
  profiles: SpeciesProfile[] = []
): SpeciesDisplaySummary[] {
  const species = new Map<string, Map<string, LineageSummary>>();

  for (const creature of creatures) {
    if (creature.lifecycleState !== 'alive') continue;

    let lineages = species.get(creature.speciesId);
    if (!lineages) {
      lineages = new Map();
      species.set(creature.speciesId, lineages);
    }

    const lineage = lineages.get(creature.lineageId);
    if (lineage) {
      lineage.population++;
    } else {
      lineages.set(creature.lineageId, {
        lineageId: creature.lineageId,
        population: 1,
        representativeTraits: { ...creature.traits },
        divergence: traitDivergence(
          creature.traits,
          profiles.find((profile) => profile.id === creature.speciesId)?.founderTraits
            ?? creature.traits
        ),
      });
    }
  }

  return Array.from(species.entries())
    .map(([speciesId, lineageMap]) => {
      const lineages = Array.from(lineageMap.values()).sort(
        (a, b) => b.population - a.population || a.lineageId.localeCompare(b.lineageId)
      );
      return {
        speciesId,
        population: lineages.reduce((total, lineage) => total + lineage.population, 0),
        strategy: lineages[0].representativeTraits.energyStrategy,
        lineages,
      };
    })
    .sort((a, b) => b.population - a.population || a.speciesId.localeCompare(b.speciesId));
}

export function shortLineageId(lineageId: string): string {
  return lineageId.startsWith('lineage_') ? lineageId.slice(8, 16) : lineageId;
}
