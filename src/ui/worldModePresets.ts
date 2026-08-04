import { BALANCED_LONGEVITY_PRESET, type SimulationConstants } from '../utils/constants';

export type WorldMode = 'standard' | 'longevity' | 'custom';

export interface WorldModeOption {
  id: WorldMode;
  label: string;
  description: string;
}

export const WORLD_MODE_OPTIONS: WorldModeOption[] = [
  { id: 'standard', label: 'Standard', description: 'Default simulation constants.' },
  {
    id: 'longevity',
    label: 'Longevity',
    description: 'Gentler energy needs and longer lifespans, for sustained ecosystems.',
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Keep your current Advanced settings unchanged.',
  },
];

/**
 * Apply a named world-mode preset before creating a world. Standard and
 * Longevity are always deterministic (reset to defaults first, then layer
 * Longevity's overrides), so the result never depends on prior fiddling.
 * Custom deliberately leaves whatever constants are already set, since
 * that's where hand-tuned Advanced settings live.
 */
export function applyWorldModePreset(
  mode: WorldMode,
  resetConstants: () => void,
  updateConstants: (patch: Partial<SimulationConstants>) => void
): void {
  if (mode === 'custom') return;
  resetConstants();
  if (mode === 'longevity') updateConstants(BALANCED_LONGEVITY_PRESET);
}
