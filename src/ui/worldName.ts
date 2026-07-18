const beginnings = [
  'Alder', 'Amber', 'Ash', 'Briar', 'Bright', 'Cedar', 'Cloud', 'Dawn',
  'Elder', 'Fern', 'Fox', 'Glen', 'Hazel', 'Heather', 'Iron', 'Juniper',
  'Lark', 'Moss', 'North', 'Oak', 'Rain', 'River', 'Silver', 'Stone',
  'Thorn', 'Willow', 'Wind', 'Winter',
] as const;

const endings = [
  'barrow', 'brook', 'combe', 'dale', 'fen', 'field', 'ford', 'grove',
  'haven', 'heath', 'holt', 'marsh', 'mere', 'moor', 'reach', 'ridge',
  'stead', 'vale', 'water', 'wick', 'wood', 'worth',
] as const;

/** Mix a seed without consuming the simulation RNG stream. */
function mixSeed(seed: number): number {
  let value = seed >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Return a readable, curated world name that is stable for a given seed. */
export function worldNameFromSeed(seed: number): string {
  const mixed = mixSeed(seed);
  const beginning = beginnings[mixed % beginnings.length];
  const ending = endings[Math.floor(mixed / beginnings.length) % endings.length];
  return `${beginning}${ending}`;
}
