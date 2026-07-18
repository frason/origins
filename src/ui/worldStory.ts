import { speciesDisplayName } from '../simulation/speciesNames';
import type { WorldSnapshot } from '../state/store';
import { worldNameFromSeed } from './worldName';

export interface WorldStory {
  heading: string;
  paragraphs: string[];
}

/** Build a concise narrative using only recorded state and events. */
export function buildWorldStory(world: WorldSnapshot, tick: number): WorldStory {
  const worldName = typeof world.seed === 'number' ? worldNameFromSeed(world.seed) : 'This world';
  const living = world.creatures.filter((creature) => creature.lifecycleState === 'alive');
  const activeSpecies = new Set(living.map((creature) => creature.speciesId));
  const history = [...(world.history ?? [])].sort((a, b) => a.tick - b.tick);
  const populations = history.map((sample) => sample.population);
  if (history[history.length - 1]?.tick !== tick) populations.push(living.length);
  const peak = Math.max(living.length, 0, ...populations);
  const mutationCount = world.events.filter((event) => event.type === 'mutation').length;
  const interventionCount = world.events.filter((event) => event.type === 'intervention').length;
  const extinctSpecies = [...new Set(
    world.events.filter((event) => event.type === 'extinction' && event.speciesId)
      .map((event) => event.speciesId!)
  )];

  if (peak === 0 && world.events.length === 0) {
    return {
      heading: `${worldName} remained quiet`,
      paragraphs: ['No animal population or major ecological event was recorded in this session.'],
    };
  }

  const ended = living.length === 0;
  const paragraphs = [ended
    ? `Across ${tick.toLocaleString()} ticks, animal life reached a recorded peak of ${peak.toLocaleString()} before ending.`
    : `At tick ${tick.toLocaleString()}, ${living.length.toLocaleString()} creatures across ${activeSpecies.size.toLocaleString()} living species remain; the recorded peak was ${peak.toLocaleString()}.`];

  if (populations.length >= 3) {
    const peakIndex = populations.indexOf(peak);
    const afterPeak = populations.slice(peakIndex + 1);
    const trough = afterPeak.length > 0 ? Math.min(...afterPeak) : peak;
    if (!ended && trough < peak * 0.7 && living.length >= trough + Math.max(3, Math.ceil(trough * 0.25))) {
      paragraphs.push(`The population fell from its peak to ${trough.toLocaleString()}, then recovered to ${living.length.toLocaleString()}.`);
    } else if (ended && peak > 0) {
      paragraphs.push('The recorded population ultimately declined from that peak to zero.');
    } else if (living.length >= peak * 0.8) {
      paragraphs.push('The living population remains close to its recorded high.');
    } else {
      paragraphs.push(`The current population stands below its recorded high at ${living.length.toLocaleString()}.`);
    }
  }

  const evidence: string[] = [];
  if (mutationCount > 0) evidence.push(`${mutationCount.toLocaleString()} lineage ${mutationCount === 1 ? 'branch was' : 'branches were'} recorded`);
  if (extinctSpecies.length > 0) {
    const visible = extinctSpecies.slice(0, 2).map(speciesDisplayName);
    const remainder = extinctSpecies.length - visible.length;
    evidence.push(`${visible.join(' and ')} disappeared${remainder > 0 ? `, along with ${remainder} more ${remainder === 1 ? 'species' : 'species'}` : ''}`);
  }
  if (interventionCount > 0) evidence.push(`${interventionCount.toLocaleString()} God Mode ${interventionCount === 1 ? 'intervention is' : 'interventions are'} part of the record`);
  if (evidence.length > 0) paragraphs.push(`${evidence.join('; ')}.`);

  return {
    heading: ended ? `The rise and fall of ${worldName}` : `${worldName} is still evolving`,
    paragraphs: paragraphs.slice(0, 3),
  };
}
