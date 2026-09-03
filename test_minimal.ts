import { validateInterventionCommand, type InterventionCommand, type ParameterBounds } from './src/simulation/pivot/interventionCommand';

const testConfig: Record<string, ParameterBounds> = {
  toxicity_reduction: {
    min: 0,
    max: 50,
    maxDeltaPerCommand: 15,
  },
  nutrient_boost: {
    min: 0,
    max: 100,
    maxDeltaPerCommand: 30,
  },
};

const cmd: InterventionCommand = {
  id: 'test-cmd',
  tick: 100,
  tier: 2,
  sourceScoutId: 'scout-001',
  targetX: 50,
  targetY: 50,
  parameter: 'nutrient_boost',
  value: 25,
};

console.log('testConfig keys:', Object.keys(testConfig));
console.log('Calling validateInterventionCommand with testConfig...');
const result = validateInterventionCommand(cmd, 100, 100, testConfig);
console.log('Result:', result);
console.log('Valid:', result.valid);
console.log('Reason:', result.reason);
