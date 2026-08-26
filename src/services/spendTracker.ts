/**
 * Spend Tracker for BYOK LLM Budget
 *
 * Enforces a rolling 24-hour window hard-block once the player's
 * daily $ limit is reached.
 *
 * - Reset window: rolling 24 hours from first use, not calendar-day
 * - Hard-blocked once limit is reached (no further LLM calls)
 * - Player can manually raise their limit at any time
 */

export interface SpendEntry {
  timestamp: number; // Unix timestamp (milliseconds)
  amountUSD: number;
}

export interface SpendHistory {
  entries: SpendEntry[];
}

const SPEND_HISTORY_KEY = 'origins_llm_spend_history';
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Retrieve the spend history from localStorage.
 */
export function getSpendHistory(): SpendHistory {
  if (typeof window === 'undefined') {
    return { entries: [] };
  }

  const stored = window.localStorage.getItem(SPEND_HISTORY_KEY);
  if (!stored) {
    return { entries: [] };
  }

  try {
    return JSON.parse(stored) as SpendHistory;
  } catch {
    console.warn('[Spend Tracker] Failed to parse spend history, starting fresh');
    return { entries: [] };
  }
}

/**
 * Save the spend history to localStorage.
 */
function setSpendHistory(history: SpendHistory): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(SPEND_HISTORY_KEY, JSON.stringify(history));
  } catch (err) {
    console.error('[Spend Tracker] Failed to save spend history', err);
  }
}

/**
 * Clear the spend history.
 */
export function clearSpendHistory(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SPEND_HISTORY_KEY);
}

/**
 * Get the total amount spent in the rolling 24-hour window.
 * Returns the sum of all spend entries within the last 24 hours.
 * Window boundary is exclusive on the left: (now - 24h, now]
 */
export function getTotalSpendInWindow(now: number = Date.now()): number {
  const history = getSpendHistory();
  const windowStart = now - TWENTY_FOUR_HOURS_MS;

  return history.entries
    .filter((entry) => entry.timestamp > windowStart)
    .reduce((sum, entry) => sum + entry.amountUSD, 0);
}

/**
 * Get the timestamp of the first spend in the current rolling window.
 * Returns null if no spends exist yet or all are outside the window.
 * Window boundary is exclusive on the left: (now - 24h, now]
 */
export function getWindowStartTime(now: number = Date.now()): number | null {
  const history = getSpendHistory();
  const windowStart = now - TWENTY_FOUR_HOURS_MS;

  const inWindow = history.entries.filter((entry) => entry.timestamp > windowStart);
  if (inWindow.length === 0) return null;

  // Find the oldest (minimum timestamp) entry in the window
  return Math.min(...inWindow.map((e) => e.timestamp));
}

/**
 * Get milliseconds remaining until the rolling window resets
 * (i.e., time until the oldest spend entry leaves the 24h window).
 * Returns 0 if no entries exist or all are outside the window.
 */
export function getMillisUntilWindowReset(now: number = Date.now()): number {
  const windowStartTime = getWindowStartTime(now);
  if (!windowStartTime) return 0;

  const resetTime = windowStartTime + TWENTY_FOUR_HOURS_MS;
  const remaining = Math.max(0, resetTime - now);
  return remaining;
}

/**
 * Record a spend and clean old entries outside the 24h window.
 */
export function recordSpend(amountUSD: number, now: number = Date.now()): void {
  const history = getSpendHistory();
  const windowStart = now - TWENTY_FOUR_HOURS_MS;

  // Add new entry
  history.entries.push({ timestamp: now, amountUSD });

  // Clean entries older than 24 hours (exclusive boundary: > not >=)
  history.entries = history.entries.filter((entry) => entry.timestamp > windowStart);

  setSpendHistory(history);
}

/**
 * Check if an LLM call would exceed the limit.
 * Returns { allowed: boolean, reason?: string, totalAfter?: number }
 */
export function checkBudgetAllowance(
  costUSD: number,
  limit: number,
  now: number = Date.now()
): { allowed: boolean; reason?: string; totalAfter?: number } {
  const currentTotal = getTotalSpendInWindow(now);
  const totalAfter = currentTotal + costUSD;

  if (totalAfter > limit) {
    const remaining = Math.max(0, limit - currentTotal);
    return {
      allowed: false,
      reason: `Budget exhausted. Current: $${currentTotal.toFixed(2)}, would be $${totalAfter.toFixed(
        2
      )}, limit is $${limit.toFixed(2)}. Remaining: $${remaining.toFixed(2)}.`,
      totalAfter,
    };
  }

  return { allowed: true, totalAfter };
}

/**
 * Get formatted budget summary for UI display.
 */
export function getBudgetSummary(
  limit: number,
  now: number = Date.now()
): {
  spent: number;
  remaining: number;
  limit: number;
  percentUsed: number;
  hoursUntilReset: number;
} {
  const spent = getTotalSpendInWindow(now);
  const remaining = Math.max(0, limit - spent);
  const percentUsed = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
  const millisUntilReset = getMillisUntilWindowReset(now);
  const hoursUntilReset = Math.ceil(millisUntilReset / (60 * 60 * 1000));

  return {
    spent,
    remaining,
    limit,
    percentUsed,
    hoursUntilReset,
  };
}
