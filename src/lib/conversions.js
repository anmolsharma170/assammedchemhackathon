export const CONVERSIONS = {
  weight: {
    g: { g: 1, kg: 0.001 },
    kg: { g: 1000, kg: 1 }
  },
  volume: {
    mL: { mL: 1, L: 0.001 },
    L: { mL: 1000, L: 1 }
  },
  count: {
    items: { items: 1 }
  }
};

/**
 * Converts a quantity from one unit to another within the same dimension.
 */
export function convertQuantity(quantity, fromUnit, toUnit, dimension) {
  const q = parseFloat(quantity);
  if (isNaN(q)) {
    throw new Error("Quantity must be a valid number");
  }

  if (!CONVERSIONS[dimension]) {
    throw new Error(`Invalid dimension: '${dimension}'`);
  }

  const dimensionUnits = CONVERSIONS[dimension];
  if (!dimensionUnits[fromUnit] || !dimensionUnits[fromUnit][toUnit]) {
    throw new Error(`Cannot convert from unit '${fromUnit}' to '${toUnit}' in dimension '${dimension}'`);
  }

  const factor = dimensionUnits[fromUnit][toUnit];
  return q * factor;
}
