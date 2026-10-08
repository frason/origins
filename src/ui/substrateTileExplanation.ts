/**
 * Plain-language explanations of substrate and water conditions for tile detail UI.
 * Helps players understand how water depth, substrate type, and related factors
 * affect producer growth and creature survival.
 */

import type { CellSnapshot } from '../state/store';
import type { SubstrateType } from '../simulation/world';

export interface SubstrateTileExplanation {
  substrateLabel: string;
  waterExplanation: string;
  producerSuitability: string;
}

/**
 * Describe substrate characteristics and how they affect producers.
 */
function describeSubstrate(substrate: SubstrateType): string {
  switch (substrate) {
    case 'sand':
      return 'sandy soil—drains quickly, low nutrient retention, preferred by drought-adapted producers';
    case 'loam':
      return 'loamy soil—balanced nutrients and drainage, supports diverse producers well';
    case 'clay':
      return 'clay soil—retains nutrients and water well, good for chemical and water-dependent producers';
    case 'peat':
      return 'peat soil—very high nutrient retention, supports wet-loving producers and chemosynthesizers';
    case 'rock':
      return 'exposed rock—minimal nutrients, but ideal for geothermal and radioactive producers';
    case 'sediment':
      return 'sediment—water-deposited, rich in dissolved nutrients, supports aquatic and saline producers';
    default:
      return substrate;
  }
}

/**
 * Explain water conditions and their effect on movement and producer growth.
 */
function describeWater(cell: CellSnapshot): string {
  if (cell.waterDepth > 0.5) {
    return `deep water (depth ${cell.waterDepth.toFixed(2)})—terrestrial creatures move slowly here, aquatic species thrive${cell.salinity > 0.5 ? ', saline' : ''}`;
  }
  if (cell.waterDepth > 0.15) {
    return `shallow water (depth ${cell.waterDepth.toFixed(2)})—amphibious creatures can navigate, algae and aquatic plants flourish${cell.salinity > 0.3 ? ', brackish' : ''}`;
  }
  if (cell.waterDepth > 0.01) {
    return `surface water (depth ${cell.waterDepth.toFixed(2)})—damp ground suitable for wetland species`;
  }
  if (cell.waterTable > 0.5) {
    return `high water table (${cell.waterTable.toFixed(2)})—groundwater close to surface, supports root-based and shallow-dwelling producers`;
  }
  if (cell.waterTable > 0.25) {
    return `moderate water table (${cell.waterTable.toFixed(2)})—accessible groundwater, reasonable for most producers`;
  }
  return `low water table (${cell.waterTable.toFixed(2)})—dry conditions, only drought-adapted producers thrive`;
}

/**
 * Assess how well producers grow given substrate and water conditions.
 */
function assessProducerSuitability(cell: CellSnapshot): string {
  const waterStress = cell.waterDepth > 0.5 || cell.waterTable < 0.2;
  const salinityStress = cell.salinity > 0.6 && cell.waterDepth > 0.1;
  const moistureOK = cell.waterTable > 0.3 || cell.waterDepth > 0.05;

  if (salinityStress) {
    return 'harsh for most producers due to salinity—only salt-tolerant species survive';
  }
  if (!moistureOK && cell.substrate === 'sand') {
    return 'challenging—sandy soil drains fast and moisture is low, only xerophytes adapt';
  }
  if (!moistureOK && (cell.substrate === 'rock' || cell.substrate === 'peat')) {
    return 'specialized producers only—rock needs geothermal/radioactive energy, peat needs moisture';
  }
  if (moistureOK && cell.waterDepth > 0.1) {
    return 'good for water-loving and aquatic producers; terrestrial species need aquatic adaptation';
  }
  if (moistureOK && (cell.substrate === 'loam' || cell.substrate === 'clay')) {
    return 'favorable—substrate and water combine for robust producer growth';
  }
  return 'moderate—producers grow steadily with no major stress';
}

/**
 * Generate a plain-language tile explanation for substrate and water.
 */
export function buildSubstrateTileExplanation(cell: CellSnapshot): SubstrateTileExplanation {
  return {
    substrateLabel: describeSubstrate(cell.substrate),
    waterExplanation: describeWater(cell),
    producerSuitability: assessProducerSuitability(cell),
  };
}
