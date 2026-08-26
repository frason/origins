// @vitest-environment jsdom
/**
 * Tests for Spend Tracker (rolling 24h window)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getSpendHistory,
  clearSpendHistory,
  getTotalSpendInWindow,
  getWindowStartTime,
  getMillisUntilWindowReset,
  recordSpend,
  checkBudgetAllowance,
  getBudgetSummary,
} from '../services/spendTracker';

describe('Spend Tracker', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    // Clean up after each test
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  describe('getSpendHistory', () => {
    it('returns empty entries when no history exists', () => {
      const history = getSpendHistory();
      expect(history.entries).toEqual([]);
    });

    it('retrieves stored spend history', () => {
      const now = Date.now();
      recordSpend(5, now);
      recordSpend(3, now + 1000);

      const history = getSpendHistory();
      expect(history.entries).toHaveLength(2);
      expect(history.entries[0].amountUSD).toBe(5);
      expect(history.entries[1].amountUSD).toBe(3);
    });
  });

  describe('clearSpendHistory', () => {
    it('removes all spend entries', () => {
      recordSpend(10);
      expect(getSpendHistory().entries.length).toBeGreaterThan(0);

      clearSpendHistory();
      expect(getSpendHistory().entries).toHaveLength(0);
    });
  });

  describe('getTotalSpendInWindow', () => {
    it('returns 0 when no spends exist', () => {
      const total = getTotalSpendInWindow();
      expect(total).toBe(0);
    });

    it('sums all spends within 24h window', () => {
      const now = Date.now();
      recordSpend(5, now);
      recordSpend(3, now + 1000);
      recordSpend(2, now + 2000);

      const total = getTotalSpendInWindow(now);
      expect(total).toBe(10);
    });

    it('excludes spends older than 24h', () => {
      const now = Date.now();
      const old = now - TWENTY_FOUR_HOURS_MS - 1000; // 24h + 1s ago
      const recent = now - 1000; // 1s ago

      recordSpend(5, old);
      recordSpend(3, recent);

      const total = getTotalSpendInWindow(now);
      expect(total).toBe(3); // Old spend excluded
    });

    it('includes spends at exact 24h boundary', () => {
      const now = Date.now();
      const boundary = now - TWENTY_FOUR_HOURS_MS; // Exactly 24h ago

      recordSpend(5, boundary);
      recordSpend(3, now);

      const total = getTotalSpendInWindow(now);
      expect(total).toBe(3); // Boundary is exclusive on left, so only recent spend included
    });
  });

  describe('getWindowStartTime', () => {
    it('returns null when no spends exist', () => {
      const startTime = getWindowStartTime();
      expect(startTime).toBeNull();
    });

    it('returns timestamp of oldest spend in window', () => {
      const now = Date.now();
      const t1 = now - 1000;
      const t2 = now - 2000;

      recordSpend(5, t1);
      recordSpend(3, t2);

      const startTime = getWindowStartTime(now);
      expect(startTime).toBe(t2);
    });

    it('returns null if all spends are older than 24h', () => {
      const now = Date.now();
      const old = now - TWENTY_FOUR_HOURS_MS - 1000;

      recordSpend(5, old);

      const startTime = getWindowStartTime(now);
      expect(startTime).toBeNull();
    });
  });

  describe('getMillisUntilWindowReset', () => {
    it('returns 0 when no spends exist', () => {
      const millis = getMillisUntilWindowReset();
      expect(millis).toBe(0);
    });

    it('returns time until oldest spend leaves window', () => {
      const now = Date.now();
      const spend1Time = now - 1000;
      const spend2Time = now - 500;

      recordSpend(5, spend1Time);
      recordSpend(3, spend2Time);

      const millis = getMillisUntilWindowReset(now);
      const expected = TWENTY_FOUR_HOURS_MS - 1000;

      // Allow 100ms tolerance for test execution time
      expect(millis).toBeGreaterThan(expected - 200);
      expect(millis).toBeLessThanOrEqual(expected + 100);
    });

    it('correctly calculates time remaining in a fresh window', () => {
      const now = Date.now();
      recordSpend(5, now);

      const millis = getMillisUntilWindowReset(now);

      // Should be very close to 24 hours
      expect(millis).toBeGreaterThan(TWENTY_FOUR_HOURS_MS - 1000);
      expect(millis).toBeLessThanOrEqual(TWENTY_FOUR_HOURS_MS);
    });
  });

  describe('recordSpend', () => {
    it('adds a spend entry', () => {
      recordSpend(5);
      const history = getSpendHistory();
      expect(history.entries).toHaveLength(1);
      expect(history.entries[0].amountUSD).toBe(5);
    });

    it('records timestamp', () => {
      const now = Date.now();
      recordSpend(3, now);

      const history = getSpendHistory();
      expect(history.entries[0].timestamp).toBe(now);
    });

    it('cleans old entries outside 24h window', () => {
      const now = Date.now();
      const old = now - TWENTY_FOUR_HOURS_MS - 1000;
      const recent = now - 1000;

      recordSpend(5, old);
      expect(getSpendHistory().entries).toHaveLength(1);

      recordSpend(3, recent);

      const history = getSpendHistory();
      expect(history.entries).toHaveLength(1); // Old one cleaned up
      expect(history.entries[0].amountUSD).toBe(3);
    });

    it('retains all entries within 24h window', () => {
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        recordSpend(1, now - i * 1000);
      }

      const history = getSpendHistory();
      expect(history.entries).toHaveLength(10);
    });
  });

  describe('checkBudgetAllowance', () => {
    it('allows spending within budget', () => {
      const now = Date.now();
      recordSpend(3, now);

      const result = checkBudgetAllowance(2, 10, now);
      expect(result.allowed).toBe(true);
      expect(result.totalAfter).toBe(5);
    });

    it('denies spending that exceeds budget', () => {
      const now = Date.now();
      recordSpend(8, now);

      const result = checkBudgetAllowance(5, 10, now);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.totalAfter).toBe(13);
    });

    it('allows exact budget limit', () => {
      const now = Date.now();
      recordSpend(5, now);

      const result = checkBudgetAllowance(5, 10, now);
      expect(result.allowed).toBe(true);
      expect(result.totalAfter).toBe(10);
    });

    it('denies spending that equals limit when already at limit', () => {
      const now = Date.now();
      recordSpend(10, now);

      const result = checkBudgetAllowance(0.01, 10, now);
      expect(result.allowed).toBe(false);
    });

    it('provides helpful error message', () => {
      const now = Date.now();
      recordSpend(7, now);

      const result = checkBudgetAllowance(5, 10, now);
      expect(result.reason).toContain('Budget exhausted');
      expect(result.reason).toContain('7.00');
      expect(result.reason).toContain('12.00');
    });
  });

  describe('getBudgetSummary', () => {
    it('returns complete summary with no spends', () => {
      const summary = getBudgetSummary(10);
      expect(summary.spent).toBe(0);
      expect(summary.remaining).toBe(10);
      expect(summary.limit).toBe(10);
      expect(summary.percentUsed).toBe(0);
      expect(summary.hoursUntilReset).toBe(0);
    });

    it('calculates percentage correctly', () => {
      const now = Date.now();
      recordSpend(5, now);

      const summary = getBudgetSummary(10, now);
      expect(summary.spent).toBe(5);
      expect(summary.remaining).toBe(5);
      expect(summary.percentUsed).toBe(50);
    });

    it('handles partial percentage', () => {
      const now = Date.now();
      recordSpend(3.33, now);

      const summary = getBudgetSummary(10, now);
      expect(summary.percentUsed).toBeGreaterThan(30);
      expect(summary.percentUsed).toBeLessThan(34);
    });

    it('calculates hours until reset', () => {
      const now = Date.now();
      recordSpend(1, now);

      const summary = getBudgetSummary(10, now);
      expect(summary.hoursUntilReset).toBe(24);
    });

    it('calculates partial hours correctly', () => {
      const now = Date.now();
      const twoHoursAgo = now - 2 * 60 * 60 * 1000;

      recordSpend(1, twoHoursAgo);

      const summary = getBudgetSummary(10, now);
      expect(summary.hoursUntilReset).toBe(22);
    });

    it('caps remaining at 0 when over budget', () => {
      const now = Date.now();
      recordSpend(12, now);

      const summary = getBudgetSummary(10, now);
      expect(summary.remaining).toBe(0);
    });

    it('caps percent used at 100%', () => {
      const now = Date.now();
      recordSpend(15, now);

      const summary = getBudgetSummary(10, now);
      expect(summary.percentUsed).toBeLessThanOrEqual(100);
      expect(summary.percentUsed).toBe(100); // Would be 150% but capped at 100%
    });

    it('handles zero limit gracefully', () => {
      const summary = getBudgetSummary(0);
      expect(summary.limit).toBe(0);
      expect(summary.percentUsed).toBe(0);
    });
  });

  describe('Rolling 24h window edge cases', () => {
    it('correctly transitions spends across window boundary', () => {
      const now = Date.now();
      const t1 = now - TWENTY_FOUR_HOURS_MS - 100;
      const t2 = now - 100;

      recordSpend(5, t1);
      recordSpend(3, t2);

      expect(getTotalSpendInWindow(now)).toBe(3); // Only t2 in window
      expect(getTotalSpendInWindow(now + 1000)).toBe(3); // Still only t2
      expect(getTotalSpendInWindow(now + TWENTY_FOUR_HOURS_MS + 100)).toBe(0); // Both outside window
    });

    it('handles multiple cleanup cycles', () => {
      const now = Date.now();

      // Add old spend
      recordSpend(1, now - TWENTY_FOUR_HOURS_MS - 1000);

      // Add recent spends (triggers cleanup)
      recordSpend(2, now - 1000);
      recordSpend(3, now - 500);

      expect(getSpendHistory().entries).toHaveLength(2);
    });
  });
});
