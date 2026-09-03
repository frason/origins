import { getLocalMiasmaMutationPressure, getToxicityHazard } from './src/simulation/toxicity.ts';
console.log('toxicity=0 pressure', getLocalMiasmaMutationPressure(5,5,[],3,30,0));
console.log('toxicity=1 pressure', getLocalMiasmaMutationPressure(5,5,[],3,30,1));
console.log('toxicity=6 pressure (should cap 0.3)', getLocalMiasmaMutationPressure(5,5,[],3,30,6));
console.log('toxicity=100 pressure (should cap 0.3)', getLocalMiasmaMutationPressure(5,5,[],3,30,100));
console.log('hazard at toxicity=6', getToxicityHazard(6));
