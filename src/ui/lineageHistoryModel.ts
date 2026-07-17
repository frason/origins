import type { CreatureSnapshot, EventSnapshot } from '../state/store';
import type { TraitChange } from '../simulation/events';
import { lineageDisplayName, speciesDisplayName } from '../simulation/speciesNames';

export interface LineageHistoryNode {
  lineageId: string;
  parentLineageId: string | null;
  name: string;
  depth: number;
  firstSeenTick: number;
  population: number;
  status: 'living' | 'extinct';
  traitChanges: TraitChange[];
}

export interface SpeciesLineageHistory {
  speciesId: string;
  name: string;
  population: number;
  lineages: LineageHistoryNode[];
}

interface MutableNode extends Omit<LineageHistoryNode, 'depth' | 'status'> {}

function nodeDepth(node: MutableNode, nodes: Map<string, MutableNode>): number {
  let depth = 0;
  let parentId = node.parentLineageId;
  const visited = new Set<string>([node.lineageId]);
  while (parentId && !visited.has(parentId) && depth < 32) {
    visited.add(parentId);
    depth++;
    parentId = nodes.get(parentId)?.parentLineageId ?? null;
  }
  return depth;
}

/** Reconstruct lineage ancestry from structured mutation events plus current populations. */
export function buildLineageHistories(
  creatures: CreatureSnapshot[],
  events: EventSnapshot[]
): SpeciesLineageHistory[] {
  const bySpecies = new Map<string, Map<string, MutableNode>>();
  const nodesFor = (speciesId: string) => {
    let nodes = bySpecies.get(speciesId);
    if (!nodes) {
      nodes = new Map();
      bySpecies.set(speciesId, nodes);
    }
    return nodes;
  };

  for (const event of events) {
    if (
      event.type !== 'mutation' ||
      !event.speciesId ||
      !event.lineageId ||
      !event.parentLineageId
    ) continue;
    const nodes = nodesFor(event.speciesId);
    if (!nodes.has(event.parentLineageId)) {
      nodes.set(event.parentLineageId, {
        lineageId: event.parentLineageId,
        parentLineageId: null,
        name: lineageDisplayName(event.speciesId, event.parentLineageId),
        firstSeenTick: 0,
        population: 0,
        traitChanges: [],
      });
    }
    if (!nodes.has(event.lineageId)) {
      nodes.set(event.lineageId, {
        lineageId: event.lineageId,
        parentLineageId: event.parentLineageId,
        name: lineageDisplayName(event.speciesId, event.lineageId),
        firstSeenTick: event.tick,
        population: 0,
        traitChanges: event.traitChanges ?? [],
      });
    }
  }

  for (const creature of creatures) {
    if (creature.lifecycleState !== 'alive') continue;
    const nodes = nodesFor(creature.speciesId);
    let node = nodes.get(creature.lineageId);
    if (!node) {
      node = {
        lineageId: creature.lineageId,
        parentLineageId: null,
        name: lineageDisplayName(creature.speciesId, creature.lineageId),
        firstSeenTick: 0,
        population: 0,
        traitChanges: [],
      };
      nodes.set(creature.lineageId, node);
    }
    node.population++;
  }

  return [...bySpecies.entries()]
    .map(([speciesId, nodes]) => {
      const lineages = [...nodes.values()]
        .map((node): LineageHistoryNode => ({
          ...node,
          depth: nodeDepth(node, nodes),
          status: node.population > 0 ? 'living' : 'extinct',
        }))
        .sort(
          (a, b) =>
            a.firstSeenTick - b.firstSeenTick ||
            a.depth - b.depth ||
            a.lineageId.localeCompare(b.lineageId)
        );
      return {
        speciesId,
        name: speciesDisplayName(speciesId),
        population: lineages.reduce((total, node) => total + node.population, 0),
        lineages,
      };
    })
    .sort((a, b) => b.population - a.population || a.name.localeCompare(b.name));
}

export function formatTraitChange(change: TraitChange): string {
  const label = change.trait.replace(/([A-Z])/g, ' $1').toLowerCase();
  const value = (item: number | string) =>
    typeof item === 'number' ? (Math.round(item * 100) / 100).toString() : item;
  return `${label}: ${value(change.before)} → ${value(change.after)}`;
}
