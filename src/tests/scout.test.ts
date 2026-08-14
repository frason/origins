import { describe, it, expect, beforeEach } from 'vitest';
import type { Scout, Discovery } from '../simulation/pivot/scout';
import {
  issueWaypoint,
  tickScoutMovement,
  chebyshevDistance,
  checkAndRecordDiscovery,
  syncDiscoveriesToLog,
  discardOnboardDiscoveries,
} from '../simulation/pivot/scout';

describe('Scout', () => {
  let scout: Scout;

  beforeEach(() => {
    scout = {
      id: 'scout-1',
      x: 50,
      y: 50,
      waypoint: null,
      battery: 100,
      inBubble: true,
      status: 'active',
      onboardDiscoveries: [],
    };
  });

  describe('chebyshevDistance', () => {
    it('returns 0 for identical positions', () => {
      expect(chebyshevDistance(50, 50, 50, 50)).toBe(0);
    });

    it('returns max of absolute differences', () => {
      expect(chebyshevDistance(50, 50, 53, 52)).toBe(3);
      expect(chebyshevDistance(50, 50, 52, 53)).toBe(3);
      expect(chebyshevDistance(50, 50, 55, 50)).toBe(5);
      expect(chebyshevDistance(50, 50, 50, 55)).toBe(5);
    });

    it('handles negative offsets', () => {
      expect(chebyshevDistance(50, 50, 45, 40)).toBe(10);
    });
  });

  describe('issueWaypoint', () => {
    it('sets waypoint on the scout', () => {
      issueWaypoint(scout, 60, 55);
      expect(scout.waypoint).toEqual({ x: 60, y: 55 });
    });

    it('overwrites existing waypoint', () => {
      issueWaypoint(scout, 60, 55);
      issueWaypoint(scout, 40, 45);
      expect(scout.waypoint).toEqual({ x: 40, y: 45 });
    });
  });

  describe('tickScoutMovement', () => {
    const BASE_X = 50;
    const BASE_Y = 50;
    const BUBBLE_RADIUS = 15;

    describe('basic movement', () => {
      it('does nothing if no waypoint is set', () => {
        const oldX = scout.x;
        const oldY = scout.y;
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(oldX);
        expect(scout.y).toBe(oldY);
      });

      it('clears waypoint when scout reaches it', () => {
        scout.x = 59;
        scout.y = 50;
        issueWaypoint(scout, 60, 50);

        // First tick: move to waypoint
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(60);
        expect(scout.y).toBe(50);
        expect(scout.waypoint).toEqual({ x: 60, y: 50 });

        // Second tick: waypoint should be cleared (scout is at waypoint)
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(60);
        expect(scout.y).toBe(50);
        expect(scout.waypoint).toBeNull();
      });

      it('does not overshoot the waypoint', () => {
        scout.x = 50;
        scout.y = 50;
        issueWaypoint(scout, 51, 50);

        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(51);
        expect(scout.y).toBe(50);
        // Not at (52, 50) - no overshoot
      });
    });

    describe('movement direction: deterministic tie-break', () => {
      it('moves one tile per tick toward waypoint', () => {
        scout.x = 50;
        scout.y = 50;
        issueWaypoint(scout, 55, 55);

        // Tick 1: both axes need movement, prefer x-axis (tie-break)
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(51);
        expect(scout.y).toBe(50);

        // Tick 2: both axes still need movement, prefer x-axis again
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(52);
        expect(scout.y).toBe(50);

        // Tick 3: both need movement, prefer x-axis
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(53);
        expect(scout.y).toBe(50);

        // Tick 4: both need movement, prefer x-axis
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(54);
        expect(scout.y).toBe(50);

        // Tick 5: both need movement, prefer x-axis
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(55);
        expect(scout.y).toBe(50);

        // Tick 6: only y needs movement now
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(55);
        expect(scout.y).toBe(51);
      });

      it('applies x-first tie-break when both axes need movement', () => {
        scout.x = 50;
        scout.y = 50;
        issueWaypoint(scout, 52, 52);

        // Tick 1: both dx and dy non-zero, prefer x-axis
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(51);
        expect(scout.y).toBe(50);

        // Tick 2: both axes still need movement, prefer x-axis
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(52);
        expect(scout.y).toBe(50);

        // Tick 3: only y needs movement now
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(52);
        expect(scout.y).toBe(51);

        // Tick 4: only y needs movement
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(52);
        expect(scout.y).toBe(52);

        // Tick 5: arrived at waypoint
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(52);
        expect(scout.y).toBe(52);
        expect(scout.waypoint).toBeNull();
      });

      it('handles negative movement (left/up)', () => {
        scout.x = 55;
        scout.y = 55;
        issueWaypoint(scout, 50, 50);

        // Tick 1: both dx and dy negative, prefer x-axis (tie-break)
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(54);
        expect(scout.y).toBe(55);

        // Tick 2: both axes still need movement, prefer x-axis
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(53);
        expect(scout.y).toBe(55);

        // Tick 3: both axes still need movement, prefer x-axis
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(52);
        expect(scout.y).toBe(55);

        // Tick 4: both axes still need movement, prefer x-axis
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(51);
        expect(scout.y).toBe(55);

        // Tick 5: both axes still need movement, prefer x-axis
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(50);
        expect(scout.y).toBe(55);

        // Tick 6: only y needs movement
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(50);
        expect(scout.y).toBe(54);
      });

      it('handles mixed positive and negative movement', () => {
        scout.x = 55;
        scout.y = 45;
        issueWaypoint(scout, 50, 50);

        // Tick 1: dx negative, dy positive; both non-zero, prefer x-axis
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(54);
        expect(scout.y).toBe(45);

        // Tick 2: both non-zero, prefer x-axis
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(53);
        expect(scout.y).toBe(45);

        // Tick 3: both non-zero, prefer x-axis
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(52);
        expect(scout.y).toBe(45);

        // Tick 4: both non-zero, prefer x-axis
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(51);
        expect(scout.y).toBe(45);

        // Tick 5: both non-zero, prefer x-axis
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(50);
        expect(scout.y).toBe(45);

        // Tick 6: only y needs movement
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.x).toBe(50);
        expect(scout.y).toBe(46);
      });
    });

    describe('inBubble status and boundary', () => {
      it('computes inBubble correctly using Chebyshev distance', () => {
        scout.x = 50;
        scout.y = 50;
        issueWaypoint(scout, 50, 66); // Move straight up

        // At distance 0 (base): inBubble = true
        expect(scout.inBubble).toBe(true);

        // Move to distance 15 (boundary): inBubble = true
        for (let i = 0; i < 15; i++) {
          tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        }
        expect(scout.y).toBe(65);
        expect(chebyshevDistance(scout.x, scout.y, BASE_X, BASE_Y)).toBe(15);
        expect(scout.inBubble).toBe(true);

        // One more step puts it at distance 16: inBubble = false
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.y).toBe(66);
        expect(chebyshevDistance(scout.x, scout.y, BASE_X, BASE_Y)).toBe(16);
        expect(scout.inBubble).toBe(false);
      });

      it('correctly identifies boundary at radius 15', () => {
        // Test all cardinal and diagonal directions. Waypoints are set at distance 20 to ensure
        // we can test the boundary at distance 15 and beyond
        const directions = [
          { name: 'north', dx: 0, dy: 20 },
          { name: 'south', dx: 0, dy: -20 },
          { name: 'east', dx: 20, dy: 0 },
          { name: 'west', dx: -20, dy: 0 },
          { name: 'northeast', dx: 20, dy: 20 },
          { name: 'northwest', dx: -20, dy: 20 },
        ];

        for (const dir of directions) {
          scout.x = BASE_X;
          scout.y = BASE_Y;
          issueWaypoint(scout, BASE_X + dir.dx, BASE_Y + dir.dy);

          // Move to distance 15 (boundary)
          for (let i = 0; i < 15; i++) {
            tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
          }
          expect(scout.inBubble).toBe(true);

          // Move one step beyond distance 15
          tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
          expect(scout.inBubble).toBe(false);
        }
      });
    });

    describe('battery management', () => {
      it('does not drain battery while in bubble', () => {
        scout.x = 50;
        scout.y = 50;
        scout.battery = 100;
        scout.inBubble = true;
        issueWaypoint(scout, 50, 65); // Move within bubble

        for (let i = 0; i < 10; i++) {
          tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
          expect(scout.battery).toBe(100);
        }
      });

      it('drains battery by 1 per tick outside bubble', () => {
        scout.x = 50;
        scout.y = 50;
        scout.battery = 100;
        issueWaypoint(scout, 50, 70); // Move beyond bubble

        // Move to outside bubble
        for (let i = 0; i < 16; i++) {
          tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        }
        expect(scout.inBubble).toBe(false);
        const batteryAfterExit = scout.battery;

        // Tick once outside bubble
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.battery).toBe(batteryAfterExit - 1);
      });

      it('recharges to full when on base tile', () => {
        scout.x = 50;
        scout.y = 50;
        scout.battery = 50;
        scout.inBubble = true;

        // At base: recharge to full
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.battery).toBe(100);
      });

      it('transitions to stranded when battery reaches 0 outside bubble', () => {
        scout.x = 50;
        scout.y = 50;
        scout.battery = 1;
        scout.status = 'active';
        issueWaypoint(scout, 50, 70);

        // Move to outside bubble
        for (let i = 0; i < 16; i++) {
          tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        }
        expect(scout.inBubble).toBe(false);

        // One more tick should drain battery to 0 and set status to stranded
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.battery).toBe(0);
        expect(scout.status).toBe('stranded');
      });

      it('clamps battery at 0, does not go negative', () => {
        scout.x = 50;
        scout.y = 70; // Move off base tile so not recharging
        scout.battery = 0;
        scout.status = 'stranded';
        scout.inBubble = false;
        issueWaypoint(scout, 50, 70);

        // Try to move while stranded; battery stays at 0 (clamped)
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.battery).toBe(0); // battery does not go negative
      });
    });

    describe('determinism', () => {
      it('produces identical results across identical runs', () => {
        // Run 1
        const scout1: Scout = {
          id: 'test',
          x: 45,
          y: 45,
          waypoint: null,
          battery: 80,
          inBubble: true,
          status: 'active',
          onboardDiscoveries: [],
        };
        issueWaypoint(scout1, 65, 70);
        for (let i = 0; i < 25; i++) {
          tickScoutMovement(scout1, BASE_X, BASE_Y, BUBBLE_RADIUS);
        }

        // Run 2: identical initial state and same operations
        const scout2: Scout = {
          id: 'test',
          x: 45,
          y: 45,
          waypoint: null,
          battery: 80,
          inBubble: true,
          status: 'active',
          onboardDiscoveries: [],
        };
        issueWaypoint(scout2, 65, 70);
        for (let i = 0; i < 25; i++) {
          tickScoutMovement(scout2, BASE_X, BASE_Y, BUBBLE_RADIUS);
        }

        // Both scouts should have identical state
        expect(scout1.x).toBe(scout2.x);
        expect(scout1.y).toBe(scout2.y);
        expect(scout1.battery).toBe(scout2.battery);
        expect(scout1.inBubble).toBe(scout2.inBubble);
        expect(scout1.status).toBe(scout2.status);
        expect(scout1.waypoint).toEqual(scout2.waypoint);
      });

      it('produces consistent results regardless of run order', () => {
        // Create two scouts with same initial state
        const scouts = [
          {
            id: 'scout-a',
            x: 50,
            y: 50,
            waypoint: null,
            battery: 100,
            inBubble: true,
            status: 'active' as const,
            onboardDiscoveries: [] as Discovery[],
          },
          {
            id: 'scout-b',
            x: 50,
            y: 50,
            waypoint: null,
            battery: 100,
            inBubble: true,
            status: 'active' as const,
            onboardDiscoveries: [] as Discovery[],
          },
        ];

        // Issue same waypoint and advance both
        issueWaypoint(scouts[0], 60, 60);
        issueWaypoint(scouts[1], 60, 60);

        for (let tick = 0; tick < 10; tick++) {
          tickScoutMovement(scouts[0], BASE_X, BASE_Y, BUBBLE_RADIUS);
          tickScoutMovement(scouts[1], BASE_X, BASE_Y, BUBBLE_RADIUS);
          expect(scouts[0].x).toBe(scouts[1].x);
          expect(scouts[0].y).toBe(scouts[1].y);
          expect(scouts[0].battery).toBe(scouts[1].battery);
        }
      });
    });

    describe('edge cases', () => {
      it('handles waypoint at scout location (no-op movement)', () => {
        scout.x = 50;
        scout.y = 50;
        issueWaypoint(scout, 50, 50);

        const oldBattery = scout.battery;
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);

        expect(scout.x).toBe(50);
        expect(scout.y).toBe(50);
        expect(scout.waypoint).toBeNull();
        expect(scout.battery).toBe(oldBattery); // No drain on base
      });

      it('handles x-first tie-break movement correctly', () => {
        scout.x = 50;
        scout.y = 50;
        issueWaypoint(scout, 60, 60);

        // With x-first tie-break: 10 ticks to move x from 50→60, then 10 more for y
        // After 10 ticks: x reaches 60, y still at 50
        for (let i = 0; i < 10; i++) {
          tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        }
        expect(scout.x).toBe(60);
        expect(scout.y).toBe(50);

        // After 10 more ticks: y reaches 60
        for (let i = 0; i < 10; i++) {
          tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        }
        expect(scout.x).toBe(60);
        expect(scout.y).toBe(60);
      });

      it('handles large bubble radius', () => {
        scout.x = 50;
        scout.y = 50;
        issueWaypoint(scout, 99, 99);

        // Move far, should still be in bubble for a while
        for (let i = 0; i < 30; i++) {
          tickScoutMovement(scout, BASE_X, BASE_Y, 50); // Large bubble
          expect(scout.inBubble).toBe(true);
        }
      });

      it('preserves scout id and other immutable fields', () => {
        const originalId = scout.id;
        issueWaypoint(scout, 60, 60);

        for (let i = 0; i < 5; i++) {
          tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        }

        expect(scout.id).toBe(originalId);
      });
    });

    describe('discovery recording and syncing', () => {
      it('records discovery when outside bubble and predicate matches', () => {
        const mockWorld = { test: true };
        const isDiscoveryTile = (world: unknown, x: number, y: number) => {
          return x === 70 && y === 50;
        };

        // Start outside bubble
        scout.x = 70;
        scout.y = 50;
        scout.inBubble = false;

        const recorded = checkAndRecordDiscovery(
          scout,
          42,
          isDiscoveryTile,
          mockWorld,
          'toxicity_spike',
          { severity: 'high' }
        );

        expect(recorded).toBe(true);
        expect(scout.onboardDiscoveries).toHaveLength(1);
        expect(scout.onboardDiscoveries[0]).toEqual({
          tick: 42,
          x: 70,
          y: 50,
          type: 'toxicity_spike',
          payload: { severity: 'high' },
        });
      });

      it('does not record discovery while inside bubble', () => {
        const mockWorld = { test: true };
        const isDiscoveryTile = (world: unknown, x: number, y: number) => true;

        scout.x = 50;
        scout.y = 50;
        scout.inBubble = true;

        const recorded = checkAndRecordDiscovery(
          scout,
          42,
          isDiscoveryTile,
          mockWorld,
          'toxicity_spike'
        );

        expect(recorded).toBe(false);
        expect(scout.onboardDiscoveries).toHaveLength(0);
      });

      it('does not record discovery when predicate returns false', () => {
        const mockWorld = { test: true };
        const isDiscoveryTile = (world: unknown, x: number, y: number) => false;

        scout.x = 70;
        scout.y = 50;
        scout.inBubble = false;

        const recorded = checkAndRecordDiscovery(
          scout,
          42,
          isDiscoveryTile,
          mockWorld,
          'toxicity_spike'
        );

        expect(recorded).toBe(false);
        expect(scout.onboardDiscoveries).toHaveLength(0);
      });

      it('accumulates multiple discoveries', () => {
        const mockWorld = { test: true };
        let discoveryCount = 0;
        const isDiscoveryTile = (world: unknown, x: number, y: number) => {
          discoveryCount++;
          return true;
        };

        scout.x = 70;
        scout.y = 50;
        scout.inBubble = false;

        // Record 3 discoveries
        for (let i = 0; i < 3; i++) {
          checkAndRecordDiscovery(
            scout,
            i + 10,
            isDiscoveryTile,
            mockWorld,
            'toxicity_spike',
            { tick: i + 10 }
          );
        }

        expect(scout.onboardDiscoveries).toHaveLength(3);
        expect(scout.onboardDiscoveries[0].tick).toBe(10);
        expect(scout.onboardDiscoveries[1].tick).toBe(11);
        expect(scout.onboardDiscoveries[2].tick).toBe(12);
      });

      it('syncs discoveries to persistent log and clears onboard', () => {
        const syncedDiscoveries: Discovery[] = [];

        scout.onboardDiscoveries = [
          { tick: 10, x: 70, y: 50, type: 'toxicity_spike', payload: { severity: 'high' } },
          { tick: 11, x: 71, y: 51, type: 'toxicity_spike', payload: { severity: 'critical' } },
        ];

        const synced = syncDiscoveriesToLog(scout, syncedDiscoveries);

        expect(synced).toBe(2);
        expect(scout.onboardDiscoveries).toHaveLength(0);
        expect(syncedDiscoveries).toHaveLength(2);
        expect(syncedDiscoveries[0].tick).toBe(10);
        expect(syncedDiscoveries[1].tick).toBe(11);
      });

      it('does not double-count discoveries after sync', () => {
        const syncedDiscoveries: Discovery[] = [];

        // First discovery batch
        scout.onboardDiscoveries = [
          { tick: 10, x: 70, y: 50, type: 'toxicity_spike', payload: {} },
        ];
        syncDiscoveriesToLog(scout, syncedDiscoveries);

        // Record new discovery (must be outside bubble to record)
        scout.inBubble = false;
        checkAndRecordDiscovery(
          scout,
          11,
          () => true,
          {},
          'toxicity_spike'
        );

        // Sync again
        syncDiscoveriesToLog(scout, syncedDiscoveries);

        expect(syncedDiscoveries).toHaveLength(2);
        expect(syncedDiscoveries[0].tick).toBe(10);
        expect(syncedDiscoveries[1].tick).toBe(11);
      });

      it('discards onboard discoveries on stranding', () => {
        scout.onboardDiscoveries = [
          { tick: 10, x: 70, y: 50, type: 'toxicity_spike', payload: {} },
          { tick: 11, x: 71, y: 51, type: 'toxicity_spike', payload: {} },
        ];

        const discarded = discardOnboardDiscoveries(scout);

        expect(discarded).toBe(2);
        expect(scout.onboardDiscoveries).toHaveLength(0);
      });

      it('syncs discoveries automatically when scout re-enters bubble', () => {
        const syncedDiscoveries: Discovery[] = [];

        // Start inside bubble
        scout.x = 50;
        scout.y = 50;
        scout.inBubble = true;
        scout.battery = 100;

        // Move outside bubble
        issueWaypoint(scout, 50, 70);
        for (let i = 0; i < 16; i++) {
          tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS, syncedDiscoveries);
        }
        expect(scout.inBubble).toBe(false);

        // Record discoveries while outside
        const isDiscoveryTile = (world: unknown, x: number, y: number) => x === scout.x && y === scout.y;
        checkAndRecordDiscovery(scout, 20, isDiscoveryTile, {}, 'toxicity_spike', { severity: 'high' });
        checkAndRecordDiscovery(scout, 21, isDiscoveryTile, {}, 'toxicity_spike', { severity: 'critical' });

        expect(scout.onboardDiscoveries).toHaveLength(2);
        expect(syncedDiscoveries).toHaveLength(0);

        // Move back toward base (inside bubble)
        issueWaypoint(scout, BASE_X, BASE_Y);
        let reentered = false;
        for (let i = 0; i < 20; i++) {
          const result = tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS, syncedDiscoveries);
          if (result) {
            reentered = true;
            break;
          }
        }

        // Should have synced upon re-entry
        expect(reentered).toBe(true);
        expect(syncedDiscoveries).toHaveLength(2);
        expect(scout.onboardDiscoveries).toHaveLength(0);
        expect(syncedDiscoveries[0].tick).toBe(20);
        expect(syncedDiscoveries[1].tick).toBe(21);
      });

      it('discards onboard discoveries when battery reaches 0', () => {
        scout.x = 50;
        scout.y = 50;
        scout.battery = 1;
        scout.status = 'active';
        scout.inBubble = true;

        // Record discoveries
        checkAndRecordDiscovery(scout, 10, () => true, {}, 'toxicity_spike');
        checkAndRecordDiscovery(scout, 11, () => true, {}, 'toxicity_spike');

        // Make scout outside bubble with no battery
        issueWaypoint(scout, 50, 70);

        // Move to outside bubble
        for (let i = 0; i < 16; i++) {
          tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        }
        expect(scout.inBubble).toBe(false);

        // One more tick should strand the scout and discard discoveries
        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(scout.battery).toBe(0);
        expect(scout.status).toBe('stranded');
        expect(scout.onboardDiscoveries).toHaveLength(0);
      });

      it('prevents movement when stranded', () => {
        scout.x = 50;
        scout.y = 50;
        scout.status = 'stranded';
        scout.waypoint = { x: 60, y: 60 };

        const oldX = scout.x;
        const oldY = scout.y;

        tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);

        expect(scout.x).toBe(oldX);
        expect(scout.y).toBe(oldY);
        expect(scout.waypoint).toEqual({ x: 60, y: 60 }); // Waypoint remains set
      });

      it('returns false from tickScoutMovement when no re-entry', () => {
        scout.x = 50;
        scout.y = 50;
        scout.inBubble = true;
        scout.battery = 100;

        const result = tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
        expect(result).toBe(false);
      });

      it('returns true from tickScoutMovement only on re-entry', () => {
        scout.x = 50;
        scout.y = 50;
        scout.inBubble = true;
        scout.battery = 100;

        // Move outside
        issueWaypoint(scout, 50, 70);
        for (let i = 0; i < 16; i++) {
          const result = tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
          expect(result).toBe(false); // Still in bubble or just left
        }
        expect(scout.inBubble).toBe(false);

        // Move back toward base
        issueWaypoint(scout, BASE_X, BASE_Y);
        let foundReentry = false;
        for (let i = 0; i < 50; i++) {
          const result = tickScoutMovement(scout, BASE_X, BASE_Y, BUBBLE_RADIUS);
          if (result) {
            foundReentry = true;
            break;
          }
        }
        expect(foundReentry).toBe(true);
      });

      it('handles empty payload with default', () => {
        const mockWorld = {};
        scout.x = 70;
        scout.y = 50;
        scout.inBubble = false;

        checkAndRecordDiscovery(scout, 42, () => true, mockWorld, 'event');

        expect(scout.onboardDiscoveries[0].payload).toEqual({});
      });

      it('preserves discovery order across sync', () => {
        const syncedDiscoveries: Discovery[] = [];

        scout.onboardDiscoveries = [
          { tick: 100, x: 1, y: 1, type: 'type_a', payload: { order: 1 } },
          { tick: 101, x: 2, y: 2, type: 'type_b', payload: { order: 2 } },
          { tick: 102, x: 3, y: 3, type: 'type_c', payload: { order: 3 } },
        ];

        syncDiscoveriesToLog(scout, syncedDiscoveries);

        expect(syncedDiscoveries.map(d => d.payload.order)).toEqual([1, 2, 3]);
      });
    });
  });
});
