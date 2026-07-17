export const MAX_UI_FRAMES_PER_SECOND = 10;

/** Keep requested tick pacing while avoiding more than ten full UI snapshots per second. */
export function getUiFrameInterval(speed: number): number {
  const safeSpeed = Math.max(0.1, speed);
  return Math.max(1000 / MAX_UI_FRAMES_PER_SECOND, 1000 / safeSpeed);
}
