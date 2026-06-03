/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FILE: src/lib/conversions.js
 * PURPOSE: Central source of truth for ALL unit-conversion logic.
 *
 * UNIT CONVERSION STRATEGY
 * ─────────────────────────────────────────────────────────────────────────────
 * The database stores every quantity in a single "base unit" per product:
 *   • Weight products  → stored in grams  (g)
 *   • Volume products  → stored in mL
 *   • Count products   → stored in items
 *
 * When a seller orders in a *different* unit (e.g. kg, L), the UI and the
 * backend both call convertQuantity() to translate the ordered amount into the
 * base unit before:
 *   1. Checking against the stored inventory (base-unit comparison)
 *   2. Computing the price  (base_price is always ₹/base-unit)
 *   3. Deducting stock     (inventory is always in base units)
 *
 * CONVERSION TABLE DESIGN
 * ─────────────────────────────────────────────────────────────────────────────
 * Structure: CONVERSIONS[dimension][fromUnit][toUnit] = multiplier
 *
 * Conversion factors used:
 *   g  → kg  : × 0.001   (1 g  = 0.001 kg)
 *   kg → g   : × 1000    (1 kg = 1000  g )
 *   mL → L   : × 0.001   (1 mL = 0.001 L)
 *   L  → mL  : × 1000    (1 L  = 1000  mL)
 *   items → items: × 1   (count; no conversion possible)
 *
 * EDGE CASES CONSIDERED
 * ─────────────────────────────────────────────────────────────────────────────
 * • Very small values (e.g. 0.001 g) – JavaScript floats handle these, but the
 *   DB column is NUMERIC(20,10) which stores up to 10 decimal places precisely.
 * • Very large values (e.g. 99999999 kg) – NUMERIC(20,10) supports up to 20
 *   significant digits, so no overflow occurs.
 * • Cross-dimension conversions (g → mL) are intentionally NOT allowed; the
 *   lookup will throw an error, preventing nonsensical orders.
 *
 * EXTENDING WITH NEW UNITS (e.g. pounds / gallons)
 * ─────────────────────────────────────────────────────────────────────────────
 * Add entries to the relevant dimension block below.  Example for pounds (lb):
 *   weight: {
 *     g:  { g: 1, kg: 0.001, lb: 0.00220462 },
 *     kg: { g: 1000, kg: 1, lb: 2.20462    },
 *     lb: { g: 453.592, kg: 0.453592, lb: 1 }
 *   }
 * No other file needs to change – every caller goes through convertQuantity().
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * CONVERSIONS – nested lookup table.
 *
 * Outer key  : dimension  ('weight' | 'volume' | 'count')
 * Middle key : fromUnit   (the unit the seller typed)
 * Inner key  : toUnit     (always the product's base_unit from the DB)
 * Value      : numeric multiplier  →  result = quantity × multiplier
 */
export const CONVERSIONS = {
  // ── WEIGHT dimension ───────────────────────────────────────────────────────
  // Base unit stored in DB: grams (g)
  weight: {
    g:  { g: 1,       kg: 0.001 },  // 1 g  = 1 g;   1 g  = 0.001 kg
    kg: { g: 1000,    kg: 1     },  // 1 kg = 1000 g; 1 kg = 1 kg
  },

  // ── VOLUME dimension ───────────────────────────────────────────────────────
  // Base unit stored in DB: millilitres (mL)
  volume: {
    mL: { mL: 1,      L: 0.001  },  // 1 mL = 1 mL;  1 mL = 0.001 L
    L:  { mL: 1000,   L: 1      },  // 1 L  = 1000 mL; 1 L = 1 L
  },

  // ── COUNT dimension ────────────────────────────────────────────────────────
  // Base unit stored in DB: items
  // No sub-unit conversion; factor is always 1.
  count: {
    items: { items: 1 },
  },
};

/**
 * convertQuantity
 * ─────────────────────────────────────────────────────────────────────────────
 * Converts `quantity` from `fromUnit` → `toUnit` within the given `dimension`.
 *
 * Called in TWO places:
 *   1. CLIENT  – src/app/seller/page.js → runLiveConversion()
 *      Live preview as the seller types, before any network request.
 *   2. SERVER  – src/services/orderService.js → placeOrder()
 *      Server-side re-validation to guard against tampered requests.
 *
 * @param {number|string} quantity  - The amount entered by the user
 * @param {string}        fromUnit  - Unit the user selected (e.g. 'kg')
 * @param {string}        toUnit    - Product's base_unit from DB (e.g. 'g')
 * @param {string}        dimension - 'weight' | 'volume' | 'count'
 * @returns {number} Converted quantity in toUnit
 * @throws  {Error}  If inputs are invalid or combination is unsupported
 */
export function convertQuantity(quantity, fromUnit, toUnit, dimension) {
  // Parse and validate the numeric input
  const q = parseFloat(quantity);
  if (isNaN(q)) {
    throw new Error('Quantity must be a valid number');
  }

  // Guard: dimension must exist in the CONVERSIONS table
  if (!CONVERSIONS[dimension]) {
    throw new Error(`Invalid dimension: '${dimension}'`);
  }

  const dimensionUnits = CONVERSIONS[dimension];

  // Guard: both fromUnit and toUnit must exist in this dimension
  if (!dimensionUnits[fromUnit] || !dimensionUnits[fromUnit][toUnit]) {
    throw new Error(
      `Cannot convert from unit '${fromUnit}' to '${toUnit}' in dimension '${dimension}'`
    );
  }

  // Look up the multiplier and apply it
  // Example: 2.5 kg → g  =  2.5 × 1000  =  2500 g
  const factor = dimensionUnits[fromUnit][toUnit];
  return q * factor;
}
