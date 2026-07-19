import { beforeEach, describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { speciesDisplayName } from '../simulation/speciesNames';
import { createEngine, tickEngine } from '../simulation/engine';
import { mutateTraits, reproduceCreature } from '../simulation/species';
import {
  createIncipientSpecies,
  establishableCandidates,
  incipientSpeciesId,
  traitDivergence,
} from '../simulation/speciation';
import { DEFAULT_TRAITS } from '../utils/traits';

function creature(generation: number, candidateId: string | null) {
  return new Creature({
    speciesId: 'grazer', lineageId: 'branch', parentId: null,
    traits: { ...DEFAULT_TRAITS, energyStrategy: 'scavenger' },
    x: 0, y: 0, energy: 100, generation, incipientSpeciesId: candidateId,
  });
}

describe('cumulative divergence speciation', () => {
  beforeEach(() => Creature.resetIdCounter());

  it('does not treat one small numeric mutation as a species', () => {
    const changed = { ...DEFAULT_TRAITS, speed: 1.1 };
    expect(traitDivergence(changed, DEFAULT_TRAITS)).toBeGreaterThan(0);
    expect(createIncipientSpecies('grazer', 'small-drift', changed, DEFAULT_TRAITS, 1, 10))
      .toBeNull();
  });

  it('recognizes ecologically meaningful cumulative divergence', () => {
    const changed = {
      ...DEFAULT_TRAITS,
      energyStrategy: 'scavenger' as const,
      size: 0.7,
      metabolism: 0.7,
    };
    const candidate = createIncipientSpecies('grazer', 'branch', changed, DEFAULT_TRAITS, 4, 20);
    expect(candidate).toMatchObject({
      ancestorSpeciesId: 'grazer', founderLineageId: 'branch', founderGeneration: 4,
    });
    expect(candidate?.divergence).toBeGreaterThanOrEqual(0.3);
  });

  it('requires a viable population spanning two descendant generations', () => {
    const id = incipientSpeciesId('grazer', 'branch');
    const candidate = createIncipientSpecies(
      'grazer', 'branch',
      { ...DEFAULT_TRAITS, energyStrategy: 'scavenger' },
      DEFAULT_TRAITS, 1, 5
    );
    expect(candidate).not.toBeNull();
    expect(establishableCandidates(
      [creature(1, id), creature(2, id), creature(2, id)],
      [candidate!]
    )).toHaveLength(0);
    expect(establishableCandidates(
      [creature(1, id), creature(2, id), creature(3, id)],
      [candidate!]
    )).toEqual([candidate]);
  });

  it('passes incipient identity to descendants', () => {
    const parent = creature(2, incipientSpeciesId('grazer', 'branch'));
    const child = reproduceCreature(parent, () => 0.99, 0.1, 0, 50);
    expect(child.incipientSpeciesId).toBe(parent.incipientSpeciesId);
    expect(child.generation).toBe(3);
  });

  it('passes an established evolved species identity to later descendants', () => {
    const evolvedSpecies = incipientSpeciesId('grazer', 'branch');
    const parent = creature(3, null);
    parent.speciesId = evolvedSpecies;
    const child = reproduceCreature(parent, () => 0.99, 0.1, 0, 50);
    expect(child.speciesId).toBe(evolvedSpecies);
    expect(child.incipientSpeciesId).toBeNull();
  });

  it('establishes persistent candidates in engine state and emits a speciation event', () => {
    const id = incipientSpeciesId('grazer', 'branch');
    const candidate = createIncipientSpecies(
      'grazer', 'branch',
      { ...DEFAULT_TRAITS, energyStrategy: 'scavenger' },
      DEFAULT_TRAITS, 1, 0
    )!;
    const state = createEngine(
      7,
      [creature(1, id), creature(2, id), creature(3, id)],
      5,
      5,
      {
        baseMetabolism: 0,
        reproductionEnergyThreshold: 10_000,
        monocultureMortalityPenalty: 0,
        overcrowdingMortalityRate: 0,
      }
    );
    state.incipientSpecies = [candidate];
    const next = tickEngine(state);

    expect(next.incipientSpecies).toHaveLength(0);
    expect(next.speciesProfiles).toContainEqual(expect.objectContaining({
      id, ancestorSpeciesId: 'grazer',
    }));
    expect(next.creatures.every((member) => member.speciesId === id)).toBe(true);
    expect(next.events).toContainEqual(expect.objectContaining({
      type: 'speciation', speciesId: id, ancestralSpeciesId: 'grazer',
    }));
  });

  it('removes a failed candidate without registering a species', () => {
    const id = incipientSpeciesId('grazer', 'branch');
    const candidate = createIncipientSpecies(
      'grazer', 'branch',
      { ...DEFAULT_TRAITS, energyStrategy: 'scavenger' },
      DEFAULT_TRAITS, 1, 0
    )!;
    const founder = creature(1, id);
    founder.lifecycleState = 'dead';
    const state = createEngine(7, [founder], 5, 5, {
      baseMetabolism: 0,
      reproductionEnergyThreshold: 10_000,
    });
    state.incipientSpecies = [candidate];

    const next = tickEngine(state);
    expect(next.incipientSpecies).toHaveLength(0);
    expect(next.speciesProfiles.some((profile) => profile.id === id)).toBe(false);
    expect(next.events.some((event) => event.type === 'speciation')).toBe(false);
  });

  it('preserves the ancestral genus in deterministic evolved names', () => {
    const evolved = incipientSpeciesId('grazer', 'lineage_abc');
    expect(speciesDisplayName(evolved).split(' ')[0])
      .toBe(speciesDisplayName('grazer').split(' ')[0]);
    expect(speciesDisplayName(evolved)).toBe(speciesDisplayName(evolved));
  });

  it('can independently mutate into a missing strategy without niche-aware bias', () => {
    // mutation check, target selection, then strategy selection: scavenger is
    // selected solely from deterministic draws, with no ecosystem input.
    const draws = [0, 0.99, 0.99];
    let index = 0;
    const result = mutateTraits(
      { ...DEFAULT_TRAITS, energyStrategy: 'omnivore' },
      () => draws[index++] ?? 0.99,
      0.1,
      1
    );
    expect(result.energyStrategy).toBe('scavenger');
  });
});
