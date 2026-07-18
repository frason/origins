import { lineageDisplayName } from '../simulation/speciesNames';
import type { CellSnapshot, CreatureSnapshot } from '../state/store';
import type { EnergyStrategy } from '../utils/traits';
import { describeHabitatSuitability, type HabitatSuitability } from './habitatSuitability';

export interface TileLineageSummary {
  speciesId: string;
  lineageId: string;
  name: string;
  strategy: EnergyStrategy;
  population: number;
  averageEnergy: number;
  averageAge: number;
  metabolicLoad: number;
  localContext: string;
  habitat?: HabitatSuitability;
}

function contextFor(
  strategy: EnergyStrategy,
  metabolicLoad: number,
  livingCount: number,
  corpseCount: number,
  producerBiomass: number
): string {
  const observations: string[] = [];
  if ((strategy === 'herbivore' || strategy === 'omnivore') && producerBiomass > 0) {
    observations.push('producer biomass offers food');
  }
  if ((strategy === 'carnivore' || strategy === 'omnivore') && livingCount > 1) {
    observations.push('other living creatures offer prey');
  }
  if ((strategy === 'scavenger' || strategy === 'omnivore') && corpseCount > 0) {
    observations.push('corpses offer scavenging');
  }
  observations.push(
    metabolicLoad < 1
      ? 'traits imply below-baseline energy use'
      : metabolicLoad > 1.5
        ? 'traits imply high energy demand'
        : 'traits imply moderate energy use'
  );
  return `Observed locally: ${observations.join('; ')}.`;
}

/** Group living tile occupants into deterministic, display-ready lineage observations. */
export function buildTileLineageSummaries(
  creatures: CreatureSnapshot[],
  corpseCount: number,
  producerBiomass: number,
  habitat?: { cell: CellSnapshot; waterRelief: boolean }
): TileLineageSummary[] {
  const groups = new Map<string, CreatureSnapshot[]>();
  for (const creature of creatures) {
    if (creature.lifecycleState !== 'alive') continue;
    const key = `${creature.speciesId}:${creature.lineageId}`;
    const group = groups.get(key) ?? [];
    group.push(creature);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => {
      const representative = group[0];
      const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
      const metabolicLoad = average(group.map((creature) => creature.traits.size * creature.traits.metabolism));
      return {
        speciesId: representative.speciesId,
        lineageId: representative.lineageId,
        name: lineageDisplayName(representative.speciesId, representative.lineageId),
        strategy: representative.traits.energyStrategy,
        population: group.length,
        averageEnergy: average(group.map((creature) => creature.energy)),
        averageAge: average(group.map((creature) => creature.age)),
        metabolicLoad,
        localContext: contextFor(
          representative.traits.energyStrategy,
          metabolicLoad,
          creatures.length,
          corpseCount,
          producerBiomass
        ),
        habitat: habitat
          ? describeHabitatSuitability(habitat.cell, representative.traits, habitat.waterRelief)
          : undefined,
      };
    })
    .sort((a, b) => b.population - a.population || a.name.localeCompare(b.name));
}
