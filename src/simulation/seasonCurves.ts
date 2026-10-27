/**
 * Fixed-point seasonal curves (docs/design-seasons.md, child issue #352).
 *
 * Every function here is pure integer / fixed-point arithmetic over a frozen sine table, so the
 * results are bit-identical across JavaScript engines. `Math.sin` is never called in this file.
 *
 * Conventions:
 * - Output signals are integer basis points (BP): 0 = 0.0, 10000 = 1.0.
 * - Angles are integer phases over one full turn, 16 fractional bits (65536 = 2π).
 * - The only floating-point steps are the entry conversions from degrees / year fraction to an
 *   integer phase (a single multiply plus floor). After that, all math is integer.
 * - Season names are never inputs. Curves read the continuous year fraction and latitude.
 *
 * Model (design "Seasonal curves"), with s = sin(2π·yearFraction), φ = latitude:
 *   tilt         = axialTiltDeg / 23.5
 *   insolation   = clamp01(0.5 + 0.5 · tilt · sin φ · s)
 *   daylight     = clamp01(0.5 + 0.5 · tilt · sin φ · s)
 *   seasonalTemp = clamp01(baseTemp + tempAmplitude · tilt · sin φ · s)
 *   snowCover    = clamp01((freezeThreshold - seasonalTemp) / freezeBand)
 */

import { MAX_AXIAL_TILT_DEG, MIN_AXIAL_TILT_DEG } from './seasons';

/** Basis points representing 1.0. */
export const BP_ONE = 10000;

/** Reference tilt (Earth-like) that maps to a tilt factor of exactly 1.0. */
export const REFERENCE_TILT_DEG = 23.5;

/** Phase resolution: one full turn is 2^16 units. */
export const PHASE_ONE = 65536;

/**
 * Quarter-wave sine table: round(10000 · sin(2π·j/1024)) for j = 0..256 (0..90°).
 * Generated once with Math.sin at authoring time and frozen here as literals. Runtime code only
 * indexes and combines these integers. Full-period values come from symmetry in sineBP().
 */
export const SINE_QUARTER_TABLE: readonly number[] = Object.freeze([
  0, 61, 123, 184, 245, 307, 368, 429, 491, 552, 613, 674, 736, 797, 858, 919,
  980, 1041, 1102, 1163, 1224, 1285, 1346, 1407, 1467, 1528, 1589, 1649, 1710, 1770, 1830, 1891,
  1951, 2011, 2071, 2131, 2191, 2251, 2311, 2370, 2430, 2489, 2549, 2608, 2667, 2726, 2785, 2844,
  2903, 2962, 3020, 3078, 3137, 3195, 3253, 3311, 3369, 3427, 3484, 3542, 3599, 3656, 3713, 3770,
  3827, 3883, 3940, 3996, 4052, 4108, 4164, 4220, 4276, 4331, 4386, 4441, 4496, 4551, 4605, 4660,
  4714, 4768, 4822, 4876, 4929, 4982, 5035, 5088, 5141, 5194, 5246, 5298, 5350, 5402, 5453, 5505,
  5556, 5607, 5657, 5708, 5758, 5808, 5858, 5908, 5957, 6006, 6055, 6104, 6152, 6201, 6249, 6296,
  6344, 6391, 6438, 6485, 6532, 6578, 6624, 6670, 6716, 6761, 6806, 6851, 6895, 6940, 6984, 7028,
  7071, 7114, 7157, 7200, 7242, 7285, 7327, 7368, 7410, 7451, 7491, 7532, 7572, 7612, 7652, 7691,
  7730, 7769, 7807, 7846, 7883, 7921, 7958, 7995, 8032, 8068, 8105, 8140, 8176, 8211, 8246, 8280,
  8315, 8349, 8382, 8416, 8449, 8481, 8514, 8546, 8577, 8609, 8640, 8670, 8701, 8731, 8761, 8790,
  8819, 8848, 8876, 8904, 8932, 8960, 8987, 9013, 9040, 9066, 9092, 9117, 9142, 9167, 9191, 9215,
  9239, 9262, 9285, 9308, 9330, 9352, 9373, 9395, 9415, 9436, 9456, 9476, 9495, 9514, 9533, 9551,
  9569, 9587, 9604, 9621, 9638, 9654, 9670, 9685, 9700, 9715, 9729, 9743, 9757, 9770, 9783, 9796,
  9808, 9820, 9831, 9842, 9853, 9863, 9873, 9883, 9892, 9901, 9909, 9917, 9925, 9932, 9939, 9946,
  9952, 9958, 9963, 9968, 9973, 9977, 9981, 9985, 9988, 9991, 9993, 9995, 9997, 9998, 9999, 10000,
  10000,
]);

/**
 * Curve constants (proposed defaults; not specified in the design table).
 * - tempAmplitudeBP: peak seasonal temperature swing at tilt 1.0, in BP (0.25).
 * - freezeThresholdBP: seasonal temperature at which snow begins to accumulate (0.20).
 * - freezeBandBP: temperature span over which snow ramps from 0 to full cover (0.10).
 */
export const SEASON_CURVE_CONSTANTS = Object.freeze({
  tempAmplitudeBP: 2500,
  freezeThresholdBP: 2000,
  freezeBandBP: 1000,
});

/** Full-period sine value at table index k in [0, 1024). */
function sampleSine(k: number): number {
  const quadrant = k >> 8;
  const r = k & 255;
  switch (quadrant) {
    case 0:
      return SINE_QUARTER_TABLE[r];
    case 1:
      return SINE_QUARTER_TABLE[256 - r];
    case 2:
      return -SINE_QUARTER_TABLE[r];
    default:
      return -SINE_QUARTER_TABLE[256 - r];
  }
}

/**
 * Sine in basis points for an angle of 2π · phase / 65536. Linear interpolation between
 * 1024-step table samples, in integer arithmetic. Result is in [-10000, 10000]; phase 0 gives 0.
 */
export function sineBP(phase: number): number {
  if (!Number.isInteger(phase) || phase < 0 || phase >= PHASE_ONE) {
    throw new RangeError(`phase must be an integer in [0, ${PHASE_ONE}), got ${phase}`);
  }
  // Fold the second half-turn onto the first by odd symmetry, so sin(-x) = -sin(x) is exact.
  if (phase > PHASE_ONE / 2) return -interpolatedSineBP(PHASE_ONE - phase);
  return interpolatedSineBP(phase);
}

/** Interpolated sine for phase in [0, 32768]. */
function interpolatedSineBP(phase: number): number {
  const idx = phase >> 6; // 0..512
  const frac = phase & 63; // 0..63
  const a = sampleSine(idx);
  const b = sampleSine((idx + 1) & 1023);
  // Integer round-half-up of a + (b - a) * frac / 64.
  return a + Math.floor(((b - a) * frac + 32) / 64);
}

/** Integer division rounding half away from zero; exact for the magnitudes used here. */
function signedRoundDiv(numer: number, denom: number): number {
  const sign = numer < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(numer) + denom / 2) / denom);
}

function clampBP(value: number): number {
  if (value < 0) return 0;
  if (value > BP_ONE) return BP_ONE;
  return value;
}

function assertFiniteInRange(name: string, value: number, min: number, max: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be a finite number in [${min}, ${max}], got ${value}`);
  }
}

/** Year fraction in [0, 1) to a 16-bit phase. The single float step is an exact power-of-two scale. */
export function yearFractionToPhase(yearFraction: number): number {
  assertFiniteInRange('yearFraction', yearFraction, 0, 1);
  if (yearFraction >= 1) throw new RangeError(`yearFraction must be < 1, got ${yearFraction}`);
  return Math.floor(yearFraction * PHASE_ONE);
}

/** Signed latitude in degrees (-90..90) to a 16-bit phase of its magnitude. */
export function latitudeToPhase(latDeg: number): number {
  assertFiniteInRange('latDeg', latDeg, -90, 90);
  return Math.floor((Math.abs(latDeg) / 360) * PHASE_ONE);
}

/** sin(φ) in basis points. Odd in φ by construction, so north and south are exact opposites. */
export function sinLatitudeBP(latDeg: number): number {
  const magnitude = sineBP(latitudeToPhase(latDeg));
  return latDeg < 0 ? -magnitude : magnitude;
}

/** Tilt factor in basis points: axialTiltDeg / 23.5 · 10000. */
export function tiltFactorBP(axialTiltDeg: number): number {
  assertFiniteInRange('axialTiltDeg', axialTiltDeg, MIN_AXIAL_TILT_DEG, MAX_AXIAL_TILT_DEG);
  return Math.round((axialTiltDeg * BP_ONE) / REFERENCE_TILT_DEG);
}

/**
 * Core signal tilt · sin φ · s in basis points (signed, unclamped).
 * Raw product of three BP values is up to ~1.3e12, well inside the safe integer range.
 */
function seasonalSignalBP(latDeg: number, yearFraction: number, axialTiltDeg: number): number {
  const tilt = tiltFactorBP(axialTiltDeg);
  const sinPhi = sinLatitudeBP(latDeg);
  const s = sineBP(yearFractionToPhase(yearFraction));
  // tilt·sinφ·s has three BP factors, so divide by BP_ONE twice to return to BP.
  return signedRoundDiv(tilt * sinPhi * s, BP_ONE * BP_ONE);
}

function assertBaseTempBP(baseTempBP: number): void {
  if (!Number.isInteger(baseTempBP) || baseTempBP < 0 || baseTempBP > BP_ONE) {
    throw new RangeError(`baseTempBP must be an integer in [0, ${BP_ONE}], got ${baseTempBP}`);
  }
}

/**
 * Insolation in BP: clamp01(0.5 + 0.5 · tilt · sin φ · s). Exactly 5000 at the equator and for
 * zero tilt, at every time.
 */
export function insolationBP(latDeg: number, yearFraction: number, axialTiltDeg: number): number {
  const signal = seasonalSignalBP(latDeg, yearFraction, axialTiltDeg);
  return clampBP(BP_ONE / 2 + signedRoundDiv(signal, 2));
}

/**
 * Daylight fraction in BP. Same shape as insolation in v1 (design: kept separate so a later phase
 * can make it nonlinear near the poles). Saturates at 0 or 10000 near the poles.
 */
export function daylightBP(latDeg: number, yearFraction: number, axialTiltDeg: number): number {
  const signal = seasonalSignalBP(latDeg, yearFraction, axialTiltDeg);
  return clampBP(BP_ONE / 2 + signedRoundDiv(signal, 2));
}

/**
 * Seasonal temperature in BP: clamp01(baseTemp + tempAmplitude · tilt · sin φ · s).
 * The static baseline is never overwritten; this is a derived read.
 */
export function seasonalTempBP(
  baseTempBP: number,
  latDeg: number,
  yearFraction: number,
  axialTiltDeg: number,
): number {
  assertBaseTempBP(baseTempBP);
  const signal = seasonalSignalBP(latDeg, yearFraction, axialTiltDeg);
  const delta = signedRoundDiv(signal * SEASON_CURVE_CONSTANTS.tempAmplitudeBP, BP_ONE);
  return clampBP(baseTempBP + delta);
}

/**
 * Snow cover in BP: clamp01((freezeThreshold - seasonalTemp) / freezeBand).
 * A dormancy input, not a separate resource.
 */
export function snowCoverBP(
  baseTempBP: number,
  latDeg: number,
  yearFraction: number,
  axialTiltDeg: number,
): number {
  const temp = seasonalTempBP(baseTempBP, latDeg, yearFraction, axialTiltDeg);
  const { freezeThresholdBP, freezeBandBP } = SEASON_CURVE_CONSTANTS;
  return clampBP(signedRoundDiv((freezeThresholdBP - temp) * BP_ONE, freezeBandBP));
}
