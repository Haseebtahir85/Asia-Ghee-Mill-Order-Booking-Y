/**
 * Parses the weight (in kg) of a single sold unit directly from an
 * item's display name, e.g.:
 *   "16 Kg tin"        -> 16
 *   "1/2 Kg 24 Pack"   -> 12   (0.5kg x 24)
 *   "2.5 Kg Bucket"    -> 2.5
 *   "1 Ltr. 12 Pack"   -> 12 liters -> converted to kg via density
 *   "1 Ltr.6 Pack B"   -> 6 liters -> converted to kg via density
 *   "RSO 250 ml"       -> 0.25 liters -> converted to kg via density
 *   "Soap Carton"      -> 0 (no weight contribution)
 *
 * This keeps the item's weight in sync with its name automatically —
 * rename "1 Kg 12 Pack" to "1 Kg 24 Pack" in the admin and every
 * order/report picks up the new weight with no separate field to edit.
 *
 * If you ever add an item whose name doesn't fit these patterns,
 * this returns 0 for it (no weight counted) rather than guessing.
 */

const FRACTION_RE = /^(\d+)\/(\d+)$/;

function parseNumberOrFraction(raw: string): number {
  const trimmed = raw.trim();
  const fractionMatch = trimmed.match(FRACTION_RE);
  if (fractionMatch) {
    return parseInt(fractionMatch[1], 10) / parseInt(fractionMatch[2], 10);
  }
  return parseFloat(trimmed);
}

// e.g. "16 Kg tin", "16 Kg tin (B)", "5 Kg tin", "16 Kg Bucket", "2.5 Kg Bucket"
const KG_UNIT_RE = /^(\d+(?:\.\d+)?|\d+\/\d+)\s*Kg\.?\s+(?:tin|Tin|Bucket)/i;

// e.g. "1 Kg 12 Pack", "1/2 Kg 24 Pack", "1/4 Kg 48 Pack"
const KG_PACK_RE = /^(\d+(?:\.\d+)?|\d+\/\d+)\s*Kg\s+(\d+)\s*Pack/i;

// e.g. "16 Ltr.s. tin", "10 Ltr.s. tin", "5 Ltr.s. Tin"
const LTR_UNIT_RE = /^(\d+(?:\.\d+)?)\s*Ltr\.?s?\.?\s+(?:tin|Tin)/i;

// e.g. "1 Ltr. 12 Pack", "1 Ltr.6 Pack B", "3 Ltr.4 Pack C"
const LTR_PACK_RE = /^(\d+(?:\.\d+)?)\s*Ltr\.?\s*(\d+)\s*Pack/i;

// e.g. "RSO 250 ml", "RSO 500 ml", "RSO 1000 ml"
const ML_RE = /^RSO\s+(\d+)\s*ml/i;

export const DEFAULT_OIL_DENSITY_KG_PER_LITER = 0.91;

export function parseUnitWeightKg(
  name: string,
  oilDensityKgPerLiter: number = DEFAULT_OIL_DENSITY_KG_PER_LITER
): number {
  const n = name.trim();

  let m = n.match(KG_UNIT_RE);
  if (m) return round(parseNumberOrFraction(m[1]));

  m = n.match(KG_PACK_RE);
  if (m) return round(parseNumberOrFraction(m[1]) * parseInt(m[2], 10));

  m = n.match(LTR_UNIT_RE);
  if (m) return round(parseFloat(m[1]) * oilDensityKgPerLiter);

  m = n.match(LTR_PACK_RE);
  if (m) return round(parseFloat(m[1]) * parseInt(m[2], 10) * oilDensityKgPerLiter);

  m = n.match(ML_RE);
  if (m) return round((parseInt(m[1], 10) / 1000) * oilDensityKgPerLiter);

  return 0;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
