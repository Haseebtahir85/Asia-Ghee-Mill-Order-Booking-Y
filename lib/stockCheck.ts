// Destination: lib/stockCheck.ts
// Pure helpers (no server imports) shared by the admin pages and the API routes
// for the TO's stock check.
//
// The stock sheet's formula is:   Closing = Opening + Primary - Secondary
// separately for Ghee, Oil and RSO, all in TONS.

export type StockCategory = "ghee" | "oil" | "rso";
export const STOCK_CATEGORIES: StockCategory[] = ["ghee", "oil", "rso"];

export interface Tons {
  ghee: number;
  oil: number;
  rso: number;
  total: number;
}

export const emptyTons = (): Tons => ({ ghee: 0, oil: 0, rso: 0, total: 0 });

export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export function roundTons(t: Tons): Tons {
  return { ghee: round4(t.ghee), oil: round4(t.oil), rso: round4(t.rso), total: round4(t.total) };
}

export function addTons(a: Tons, b: Tons): Tons {
  return { ghee: a.ghee + b.ghee, oil: a.oil + b.oil, rso: a.rso + b.rso, total: a.total + b.total };
}

// Add `kg` kilograms of `category` to a Tons accumulator.
export function addKg(t: Tons, category: StockCategory, kg: number): void {
  const tons = kg / 1000;
  t[category] += tons;
  t.total += tons;
}

// Which sheet column an item belongs to. Same rules the booking page uses for
// its icons: an explicit icon wins, otherwise the name decides ("RSO" -> RSO,
// "soap" -> soap). RSO is counted on its own (never also as Oil); soap and
// "other" items are not part of the sheet.
export function categorizeItem(item: {
  name?: string | null;
  type?: string | null;
  icon?: string | null;
}): StockCategory | null {
  const name = String(item.name ?? "").toLowerCase();
  const icon = item.icon ?? null;
  const isRso = icon ? icon === "bottle" : name.includes("rso");
  const isSoap = icon ? icon === "soap" : name.includes("soap");
  if (isSoap) return null;
  if (isRso) return "rso";
  if (item.type === "ghee") return "ghee";
  if (item.type === "oil") return "oil";
  return null;
}

// Name used to match a sheet row to a TO: case, dots, commas and extra spaces
// don't matter ("M. Riaz Amin" == "m riaz  amin"), nor does word order.
export function nameKey(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[.,'’`"()\-_/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

// ----- the comparison result (what the API returns / what gets stored) -----

export interface StockCheckResult {
  available: boolean; // an uploaded sheet with a row for this TO exists
  reason?: "no_sheet" | "no_row";
  to_name: string;
  complete: boolean; // every town of the TO is included (this one is its last)
  remaining: number; // towns of this TO still to file after this one
  town: { opening: Tons; secondary: Tons; closing: Tons }; // this town only
  to_total?: { opening: Tons; primary: Tons; secondary: Tons; closing: Tons }; // all towns so far
  expected?: Tons; // Opening + Primary - Secondary  (the sheet's formula)
  diff?: Tons; // reported closing - expected
  ok?: { ghee: boolean; oil: boolean; rso: boolean; total: boolean };
  status?: "match" | "mismatch";
}
