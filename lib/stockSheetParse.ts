// Destination: lib/stockSheetParse.ts
// Reads the monthly "Town wise Closing Stock Report" Excel sheet (already turned
// into rows of cells by the xlsx library). Pure logic — no network, no React.
//
// Layout it understands (found by reading the headers, not by fixed cell
// addresses, so extra rows/columns don't break it):
//
//   [group label]   Closing Stock (Tons) | Primary Achvmnt (Tons) | Secondary Achvmnt (Tons) | Closing Stock (Tons)
//   [date row]      01-Aug-26            | 01-Sep-26              | ...
//   [sub headers]   TO Names | Towns | Ghee Oil RSO Total  x 4 blocks | Remarks
//   [one row per TO]   ...  Closing = Opening + Primary - Secondary   (per Ghee / Oil / RSO)

export interface SheetBlock {
  ghee: number | null;
  oil: number | null;
  rso: number | null;
}

export interface ParsedSheetRow {
  row_no: number; // row number in the Excel file (1-based)
  to_name: string;
  towns: string;
  opening: SheetBlock;
  primary: SheetBlock;
  secondary: SheetBlock;
  closing: SheetBlock;
  remarks: string;
}

export interface ParsedSheet {
  rows: ParsedSheetRow[];
  period: { month: number; year: number } | null; // month the sheet covers (from its date headers)
  warnings: string[];
  formulaChecked: boolean; // we could read the closing formula
  formulaOk: boolean; // ...and it is Opening + Primary - Secondary
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const low = (v: unknown) => text(v).toLowerCase();

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/,/g, "").trim();
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// A date cell (Date object or Excel serial number) -> month/year. Adds 12 hours
// first so a timezone shift of the Date can never move it into the wrong month.
function monthYear(v: unknown): { month: number; year: number } | null {
  let ms: number | null = null;
  if (v instanceof Date && !isNaN(v.getTime())) ms = v.getTime();
  else if (typeof v === "number" && v > 30000 && v < 80000) ms = Math.round((v - 25569) * 86400000);
  if (ms === null) return null;
  const d = new Date(ms + 12 * 3600 * 1000);
  return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}

type BlockKey = "opening" | "primary" | "secondary" | "closing";

export function parseStockSheet(
  aoa: any[][],
  opts: { hiddenCols?: Set<number>; formulaAt?: (row: number, col: number) => string | undefined } = {}
): ParsedSheet {
  const warnings: string[] = [];
  const hidden = opts.hiddenCols ?? new Set<number>();

  // ---- the sub-header row: the first one with several "Ghee" cells ----
  let subRow = -1;
  for (let r = 0; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    if (row.filter((c) => low(c) === "ghee").length >= 3) {
      subRow = r;
      break;
    }
  }
  if (subRow < 0) {
    throw new Error('Could not find the Ghee / Oil / RSO columns. Is this the "Town wise Closing Stock Report" sheet?');
  }
  const sub = aoa[subRow] ?? [];

  // ---- blocks: each "Ghee" cell starts one block (Ghee, Oil, RSO, Total) ----
  const gheeCols: number[] = [];
  sub.forEach((c, i) => {
    if (low(c) === "ghee") gheeCols.push(i);
  });

  const findIn = (start: number, name: string): number | null => {
    for (let c = start; c < start + 4; c++) if (low(sub[c]) === name) return c;
    return null;
  };

  const labelAbove = (col: number): string => {
    for (let r = subRow - 1; r >= 0; r--) {
      for (let c = col; c < col + 4; c++) {
        const v = (aoa[r] ?? [])[c];
        if (typeof v === "string" && v.trim()) return v.trim().toLowerCase();
      }
    }
    return "";
  };
  const dateAbove = (col: number): { month: number; year: number } | null => {
    for (let r = subRow - 1; r >= 0; r--) {
      for (let c = col; c < col + 4; c++) {
        const d = monthYear((aoa[r] ?? [])[c]);
        if (d) return d;
      }
    }
    return null;
  };

  const blockCols: Partial<Record<BlockKey, { ghee: number; oil: number; rso: number }>> = {};
  const blockDates: Partial<Record<BlockKey, { month: number; year: number } | null>> = {};
  let closingSeen = 0;
  const order: BlockKey[] = ["opening", "primary", "secondary", "closing"];

  gheeCols.forEach((g, idx) => {
    const oil = findIn(g, "oil");
    const rso = findIn(g, "rso");
    if (oil === null || rso === null) return;
    const label = labelAbove(g);
    let key: BlockKey | null = null;
    if (label.includes("primary")) key = "primary";
    else if (label.includes("secondary")) key = "secondary";
    else if (label.includes("opening")) key = "opening";
    else if (label.includes("closing")) key = closingSeen++ === 0 ? "opening" : "closing";
    else key = order[idx] ?? null; // no readable label: by position
    if (key && !blockCols[key]) {
      blockCols[key] = { ghee: g, oil, rso };
      blockDates[key] = dateAbove(g);
    }
  });

  if (!blockCols.primary) throw new Error('The "Primary Achvmnt" columns were not found in this sheet.');
  if (!blockCols.opening) warnings.push("The opening Closing Stock columns were not found.");
  if (!blockCols.secondary) warnings.push("The Secondary Achvmnt columns were not found.");
  if (!blockCols.closing) warnings.push("The final Closing Stock columns were not found.");

  // ---- TO name / Towns / Remarks columns (a hidden duplicate column is ignored) ----
  const colsWhere = (re: RegExp) => {
    const out: number[] = [];
    sub.forEach((c, i) => {
      if (re.test(text(c).toLowerCase())) out.push(i);
    });
    return out;
  };
  const toCands = colsWhere(/^to\s*names?$/);
  const toCol = toCands.find((c) => !hidden.has(c)) ?? toCands[0];
  if (toCol === undefined) throw new Error('The "TO Names" column was not found in this sheet.');
  const townsCol = colsWhere(/^towns?$/).find((c) => !hidden.has(c));
  const remarksCol = colsWhere(/^remarks?$/)[0];

  // ---- period the sheet covers: the opening date is the 1st of that month ----
  let period: { month: number; year: number } | null = blockDates.opening ?? null;
  if (!period && blockDates.primary) {
    const p = blockDates.primary; // dated the 1st of the NEXT month
    period = p.month === 1 ? { month: 12, year: p.year - 1 } : { month: p.month - 1, year: p.year };
  }
  if (!period) warnings.push("Could not read the month from the sheet's date headers.");

  const block = (row: any[], key: BlockKey): SheetBlock => {
    const cols = blockCols[key];
    if (!cols) return { ghee: null, oil: null, rso: null };
    return { ghee: num(row[cols.ghee]), oil: num(row[cols.oil]), rso: num(row[cols.rso]) };
  };

  // ---- one row per TO ----
  const rows: ParsedSheetRow[] = [];
  for (let r = subRow + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const name = text(row[toCol]);
    if (!name) continue;
    if (/^(grand\s*)?total/i.test(name)) continue;
    rows.push({
      row_no: r + 1,
      to_name: name,
      towns: townsCol === undefined ? "" : text(row[townsCol]),
      opening: block(row, "opening"),
      primary: block(row, "primary"),
      secondary: block(row, "secondary"),
      closing: block(row, "closing"),
      remarks: remarksCol === undefined ? "" : text(row[remarksCol]),
    });
  }
  if (rows.length === 0) throw new Error("No TO rows were found under the headers.");

  // ---- read the sheet's own closing formula (first data row) ----
  let formulaChecked = false;
  let formulaOk = false;
  const oc = blockCols.opening;
  const pc = blockCols.primary;
  const sc = blockCols.secondary;
  const cc = blockCols.closing;
  if (opts.formulaAt && oc && pc && sc && cc) {
    const first = rows[0].row_no; // 1-based
    const f = opts.formulaAt(first - 1, cc.ghee);
    if (f) {
      formulaChecked = true;
      const norm = f.replace(/[\s$=]/g, "").toUpperCase();
      const want = `${colLetter(oc.ghee)}${first}+${colLetter(pc.ghee)}${first}-${colLetter(sc.ghee)}${first}`;
      formulaOk = norm === want;
      if (!formulaOk) {
        warnings.push(
          `The closing formula in this file is "${f}", not Opening + Primary − Secondary. The app uses Opening + Primary − Secondary.`
        );
      }
    }
  }

  return { rows, period, warnings, formulaChecked, formulaOk };
}
