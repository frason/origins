export interface ElevationAppearance {
  tone: 'light' | 'shadow';
  opacity: number;
  contourTop: boolean;
  contourLeft: boolean;
}

const clamp01 = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};
const contourBand = (value: number) => Math.floor(clamp01(value) * 10);

/**
 * Deterministic north-west hillshade and 0.1 elevation contours.
 * This is a visual interpretation only; it never changes world state.
 */
export function elevationAppearance(
  elevation: number,
  northElevation: number,
  westElevation: number,
): ElevationAppearance {
  const height = clamp01(elevation);
  const north = clamp01(northElevation);
  const west = clamp01(westElevation);
  const shade = Math.max(
    -0.22,
    Math.min(0.22, (height - 0.5) * 0.2 + (height - north) * 0.35 + (height - west) * 0.35),
  );
  return {
    tone: shade >= 0 ? 'light' : 'shadow',
    opacity: Math.abs(shade),
    contourTop: contourBand(height) !== contourBand(north),
    contourLeft: contourBand(height) !== contourBand(west),
  };
}
