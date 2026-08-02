import { metabolicPerformanceMultiplier } from '../utils/traits';

export interface MetabolismTradeoff {
  label: 'Efficient' | 'Balanced' | 'Active';
  summary: string;
}

/** Explain the inherited metabolism trait as a visible cost/benefit tradeoff. */
export function describeMetabolismTradeoff(metabolism: number): MetabolismTradeoff {
  const bounded = Math.max(0, metabolism);
  const performance = metabolicPerformanceMultiplier(bounded);
  const energyDifference = Math.round(Math.abs(bounded - 1) * 100);
  const performanceDifference = Math.round(Math.abs(performance - 1) * 100);

  if (bounded < 0.98) {
    return {
      label: 'Efficient',
      summary: `${energyDifference}% lower baseline energy burn with ${performanceDifference}% less travel and feeding throughput.`,
    };
  }
  if (bounded > 1.02) {
    return {
      label: 'Active',
      summary: `${performanceDifference}% more travel and feeding throughput for ${energyDifference}% higher baseline energy burn.`,
    };
  }
  return {
    label: 'Balanced',
    summary: 'Baseline travel, feeding throughput, and energy burn.',
  };
}
