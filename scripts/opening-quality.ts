import { measureDefaultOpeningQuality } from '../src/simulation/defaultOpeningQuality';
import { SIMULATION_CONSTANTS } from '../src/utils/constants';

const seeds = [12345, 42, 54321, 99999];
const thresholdsArgument = process.argv.find((argument) => argument.startsWith('--thresholds='));
const thresholds = thresholdsArgument
  ? thresholdsArgument
      .slice('--thresholds='.length)
      .split(',')
      .map(Number)
      .filter(Number.isFinite)
  : [SIMULATION_CONSTANTS.predationHungerThresholdShare];
const report = thresholds.flatMap((predationHungerThresholdShare) =>
  seeds.map((seed) => {
    const { populations: _populations, ...summary } = measureDefaultOpeningQuality(
      seed,
      100,
      10,
      { ...SIMULATION_CONSTANTS, predationHungerThresholdShare }
    );
    return { predationHungerThresholdShare, ...summary };
  })
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
