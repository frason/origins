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

export const MAX_SPECIES_NAME_LENGTH = 40;
const CUSTOM_NAME_SEPARATOR = '~';
const EVOLVED_PREFIX = 'evolved:';

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

export function ancestralSpeciesId(speciesId: string): string | null {
  if (!speciesId.startsWith(EVOLVED_PREFIX)) return null;
  const separator = speciesId.indexOf(':', EVOLVED_PREFIX.length);
  if (separator < 0) return null;
  try {
    return decodeURIComponent(speciesId.slice(EVOLVED_PREFIX.length, separator));
  } catch {
    return null;
  }
}

function rootSpeciesId(speciesId: string): string {
  let current = speciesId;
  const visited = new Set<string>();
  while (!visited.has(current)) {
    visited.add(current);
    const ancestor = ancestralSpeciesId(current);
    if (!ancestor) break;
    current = ancestor;
  }
  return current;
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

/** Make player-entered names safe and consistent without changing their wording. */
export function normalizeSpeciesName(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SPECIES_NAME_LENGTH)
    .trim();
}

export function customSpeciesName(speciesId: string): string | null {
  const separator = speciesId.indexOf(CUSTOM_NAME_SEPARATOR);
  if (separator < 0) return null;
  try {
    const name = normalizeSpeciesName(decodeURIComponent(speciesId.slice(separator + 1)));
    return name || null;
  } catch {
    return null;
  }
}

export function suggestedIntroducedSpeciesName(
  strategy: string,
  introductionNumber: number
): string {
  return speciesDisplayName(`introduced_${strategy}_${introductionNumber}`);
}

export function introducedSpeciesId(
  strategy: string,
  introductionNumber: number,
  requestedName: string
): string {
  const baseId = `introduced_${strategy}_${introductionNumber}`;
  const name = normalizeSpeciesName(requestedName) || speciesDisplayName(baseId);
  return `${baseId}${CUSTOM_NAME_SEPARATOR}${encodeURIComponent(name)}`;
}

/** Return a stable pseudo-Latin binomial for a founding species. */
export function speciesDisplayName(speciesId: string): string {
  const customName = customSpeciesName(speciesId);
  if (customName) return customName;
  const rootId = rootSpeciesId(speciesId);
  const rootCustomName = customSpeciesName(rootId);
  const epithet = founderEpithetFor(speciesId);
  return rootCustomName
    ? `${rootCustomName} — ${epithet}`
    : `${genusFor(rootId)} ${epithet}`;
}

/** Mutated lineages keep their founder's genus but receive a distinct epithet. */
export function lineageDisplayName(speciesId: string, lineageId: string): string {
  if (isFounderLineage(speciesId, lineageId)) return speciesDisplayName(speciesId);

  const founderEpithet = founderEpithetFor(speciesId);
  let index = hash(`lineage:${lineageId}`) % EPITHETS.length;
  if (EPITHETS[index] === founderEpithet) index = (index + 1) % EPITHETS.length;
  const customName = customSpeciesName(speciesId);
  return customName
    ? `${customName} — ${EPITHETS[index]}`
    : `${genusFor(rootSpeciesId(speciesId))} ${EPITHETS[index]}`;
}
