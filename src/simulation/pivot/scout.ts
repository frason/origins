/**
 * Scout entity for Phase 0 of the Pivot system.
 * Handles grid-based movement, waypoint targeting, comms-bubble detection,
 * and battery management.
 */

export interface Scout {
  id: string;
  x: number;
  y: number;
  waypoint: { x: number; y: number } | null;
  battery: number;
  inBubble: boolean;
  status: 'active' | 'stranded';
}

/**
 * Compute Chebyshev distance (max of absolute differences).
 * This is 8-directional, square-shaped distance metric.
 */
export function chebyshevDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

/**
 * Issue a waypoint command to the scout.
 * Sets the target destination for autonomous movement.
 *
 * @param scout - the Scout entity
 * @param x - target x coordinate
 * @param y - target y coordinate
 */
export function issueWaypoint(scout: Scout, x: number, y: number): void {
  scout.waypoint = { x, y };
}

/**
 * Advance scout movement by one tick.
 *
 * Movement logic:
 * 1. If no waypoint is set, do nothing
 * 2. If already at waypoint, clear it and do nothing (no overshoot)
 * 3. Otherwise, move one tile toward waypoint:
 *    - Calculate distance in each axis (dx, dy)
 *    - Move both axes simultaneously when both need movement (diagonal move = 1 Chebyshev-tile)
 *    - If only one axis needs movement, move that axis
 *    - Each axis moves at most ±1 per tick toward waypoint
 * 4. Update inBubble status via Chebyshev distance from base
 * 5. Handle battery:
 *    - If inBubble: recharge to full if on base, otherwise no drain
 *    - If outside bubble: drain -1/tick
 *    - If battery reaches 0 while outside: status = 'stranded'
 *
 * @param scout - the Scout entity to move
 * @param baseX - x coordinate of Landing Base (center of comms bubble)
 * @param baseY - y coordinate of Landing Base (center of comms bubble)
 * @param bubbleRadius - radius of comms bubble in tiles (Chebyshev distance)
 */
export function tickScoutMovement(
  scout: Scout,
  baseX: number,
  baseY: number,
  bubbleRadius: number
): void {
  // Handle movement only if waypoint is set
  if (scout.waypoint) {
    // If already at waypoint, clear it and stop
    if (scout.x === scout.waypoint.x && scout.y === scout.waypoint.y) {
      scout.waypoint = null;
    } else {
      // Calculate delta toward waypoint
      const dx = scout.waypoint.x - scout.x;
      const dy = scout.waypoint.y - scout.y;

      // Determine movement: at most one step per axis
      const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
      const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;

      // Move at most one axis per tick toward waypoint.
      // Deterministic tie-break: when both axes need movement, prefer x-axis first.
      if (stepX !== 0 && stepY !== 0) {
        // Both axes need movement - move x-axis only (tie-break priority)
        scout.x += stepX;
      } else if (stepX !== 0) {
        // Only x needs movement
        scout.x += stepX;
      } else if (stepY !== 0) {
        // Only y needs movement
        scout.y += stepY;
      }
    }
  }

  // Update inBubble status based on Chebyshev distance from base
  // (Execute every tick, not just during movement)
  const distance = chebyshevDistance(scout.x, scout.y, baseX, baseY);
  scout.inBubble = distance <= bubbleRadius;

  // Handle battery and status (execute every tick)
  if (scout.inBubble) {
    // Recharge to full if exactly on base tile
    if (scout.x === baseX && scout.y === baseY) {
      scout.battery = 100;
    }
    // No drain while in bubble (and not on base, which is handled by recharge)
  } else {
    // Outside bubble: drain -1/tick
    scout.battery -= 1;

    // Check for stranded condition
    if (scout.battery <= 0) {
      scout.battery = 0;
      scout.status = 'stranded';
    }
  }
}
