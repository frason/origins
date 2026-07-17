const GENERA = [
  'Aurelia', 'Caelora', 'Demeris', 'Eluvia', 'Feronia', 'Ilyria',
  'Lunaris', 'Nemoris', 'Orthea', 'Pelagia', 'Quintara', 'Sylvara',
  'Terravia', 'Umbralis', 'Valeria', 'Zephyria',
] as const;

const EPITHETS = [
  'agilis', 'altus', 'aquatica', 'armata', 'celer', 'communis',
  'fortis', 'gracilis', 'lucida', 'minor', 'nocturna', 'robusta',
  'solaris', 'tenuis', 'viridis', 'vorax',
] as const;

/** Stable FNV-1a hash. Naming never consumes the simulation's seeded RNG stream. */
function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

function genusFor(speciesId: string): string {
  return GENERA[hash(`genus:${speciesId}`) % GENERA.length];
}

function founderEpithetFor(speciesId: string): string {
  return EPITHETS[hash(`founder:${speciesId}`) % EPITHETS.length];
}

function isFounderLineage(speciesId: string, lineageId: string): boolean {
  return (
    lineageId === speciesId ||
    /(?:^|[_-])root(?:$|[_-])/.test(lineageId)
  );
}

/** Return a stable pseudo-Latin binomial for a founding species. */
export function speciesDisplayName(speciesId: string): string {
  return `${genusFor(speciesId)} ${founderEpithetFor(speciesId)}`;
}

/** Mutated lineages keep their founder's genus but receive a distinct epithet. */
export function lineageDisplayName(speciesId: string, lineageId: string): string {
  if (isFounderLineage(speciesId, lineageId)) return speciesDisplayName(speciesId);

  const founderEpithet = founderEpithetFor(speciesId);
  let index = hash(`lineage:${lineageId}`) % EPITHETS.length;
  if (EPITHETS[index] === founderEpithet) index = (index + 1) % EPITHETS.length;
  return `${genusFor(speciesId)} ${EPITHETS[index]}`;
}
