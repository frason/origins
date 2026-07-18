import { describe, expect, it } from 'vitest';
import { worldNameFromSeed } from '../ui/worldName';

describe('deterministic world names', () => {
  it('returns the same readable name for the same seed', () => {
    const first = worldNameFromSeed(42);
    expect(worldNameFromSeed(42)).toBe(first);
    expect(first).toMatch(/^[A-Z][a-z]+$/);
  });

  it('gives varied seeds varied names', () => {
    const names = new Set(Array.from({ length: 20 }, (_, seed) => worldNameFromSeed(seed)));
    expect(names.size).toBeGreaterThanOrEqual(18);
  });

  it('handles the full supported signed seed range', () => {
    expect(worldNameFromSeed(0)).toMatch(/^[A-Z][a-z]+$/);
    expect(worldNameFromSeed(2147483647)).toMatch(/^[A-Z][a-z]+$/);
  });
});
