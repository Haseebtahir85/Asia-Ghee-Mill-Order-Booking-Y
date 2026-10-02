// Destination: lib/stockCheckServer.ts
// Server-only. Compares a TO's report with the monthly stock sheet the admin
// uploaded, using the sheet's own formula:
//
//     Closing (expected) = Opening + Primary - Secondary        (tons, per Ghee / Oil / RSO)
//
//   Opening   = the TO's page 1 (closing/opening report of the previous month)
//   Primary   = from the uploaded sheet (one row per TO)
//   Secondary = the TO's page 2
//   Closing   = the TO's page 3, compared with the expected closing
//
// The sheet has one row per TO (all of the TO's towns together) while reports
// are filed one town at a time, so the comparison is made on the TO's totals
// once the last of its towns is filed ("complete").
import { supabaseServer } from "@/lib/supabase";
import {
  StockCheckResult,
  Tons,
  addKg,
  addTons,
  categorizeItem,
  emptyTons,
  nameKey,
  roundTons,
} from "@/lib/stockCheck";

// The allowed difference between the reported and the expected closing stock.
// It is applied here, on the server, and is never shown to the TO's.
const STOCK_TOLERANCE_TON = 0.03;
const EPS = 1e-9;

export interface StockLine {
  item_id: string;
  qty: number;
}

export interface StockCheckInput {
  townId: string;
  month: number; // the report month (pages 2 + 3)
  year: number;
  closing_opening: StockLine[]; // page 1
  secondary_sale: StockLine[]; // page 2
  closing_stock: StockLine[]; // page 3
}

type ItemInfo = { id: string; name: string; type: string; icon: string | null; weight_kg: number };

async function loadItems(ids: string[]): Promise<Map<string, ItemInfo>> {
  const map = new Map<string, ItemInfo>();
  if (ids.length === 0) return map;
  const { data } = await supabaseServer.from("items").select("id, name, type, icon, weight_kg").in("id", ids);
  for (const i of data ?? []) map.set(i.id, i as ItemInfo);
  return map;
}

function tonsOf(lines: StockLine[], items: Map<string, ItemInfo>): Tons {
  const t = emptyTons();
  for (const l of lines) {
    const item = items.get(l.item_id);
    if (!item) continue;
    const cat = categorizeItem(item);
    if (cat) addKg(t, cat, Number(l.qty) * Number(item.weight_kg));
  }
  return t;
}

export function findSheetRow<R extends { to_id: string | null; sheet_to_name: string }>(
  rows: R[],
  toId: string,
  toName: string
): R | undefined {
  const byId = rows.find((r) => r.to_id === toId);
  if (byId) return byId;
  // rows the admin did not link by hand: exact name first, then ignoring dots / case / word order
  const exact = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
  const same = rows.find((r) => !r.to_id && exact(r.sheet_to_name) === exact(toName));
  if (same) return same;
  const key = nameKey(toName);
  return rows.find((r) => !r.to_id && nameKey(r.sheet_to_name) === key);
}

// Pure comparison (also used by tests).
export function compareStock(opening: Tons, primary: Tons, secondary: Tons, closing: Tons) {
  const expected: Tons = {
    ghee: opening.ghee + primary.ghee - secondary.ghee,
    oil: opening.oil + primary.oil - secondary.oil,
    rso: opening.rso + primary.rso - secondary.rso,
    total: 0,
  };
  expected.total = expected.ghee + expected.oil + expected.rso;
  const diff: Tons = {
    ghee: closing.ghee - expected.ghee,
    oil: closing.oil - expected.oil,
    rso: closing.rso - expected.rso,
    total: closing.total - expected.total,
  };
  const within = (d: number) => Math.abs(d) <= STOCK_TOLERANCE_TON + EPS;
  const ok = { ghee: within(diff.ghee), oil: within(diff.oil), rso: within(diff.rso), total: within(diff.total) };
  const status: "match" | "mismatch" = ok.ghee && ok.oil && ok.rso && ok.total ? "match" : "mismatch";
  return { expected, diff, ok, status };
}

// Returns null when the town has no (active) TO.
export async function buildStockCheck(input: StockCheckInput): Promise<StockCheckResult | null> {
  // ---- the town's TO ----
  const { data: link } = await supabaseServer.from("to_towns").select("to_id").eq("town_id", input.townId).maybeSingle();
  if (!link) return null;
  const { data: to } = await supabaseServer.from("tos").select("id, name, is_active").eq("id", link.to_id).maybeSingle();
  if (!to || !to.is_active) return null;

  // ---- this town's three pages, in tons ----
  const currentIds = Array.from(
    new Set([...input.closing_opening, ...input.secondary_sale, ...input.closing_stock].map((l) => l.item_id))
  );

  // ---- the TO's other towns that already filed this month ----
  const { data: towns } = await supabaseServer.from("to_towns").select("town_id").eq("to_id", to.id);
  const toTownIds = (towns ?? []).map((t: any) => t.town_id as string);

  const { data: filed } = await supabaseServer
    .from("secondary_reports")
    .select("id, town_id")
    .eq("to_id", to.id)
    .eq("report_month", input.month)
    .eq("report_year", input.year);
  const others = (filed ?? []).filter((r: any) => r.town_id !== input.townId);

  let otherLines: any[] = [];
  if (others.length > 0) {
    const { data } = await supabaseServer
      .from("secondary_report_lines")
      .select("report_id, stage, item_id, item_name, item_type, weight_kg, qty")
      .in(
        "report_id",
        others.map((r: any) => r.id)
      );
    otherLines = data ?? [];
  }

  const items = await loadItems(
    Array.from(new Set([...currentIds, ...otherLines.map((l: any) => l.item_id).filter(Boolean)]))
  );

  const town = {
    opening: tonsOf(input.closing_opening, items),
    secondary: tonsOf(input.secondary_sale, items),
    closing: tonsOf(input.closing_stock, items),
  };

  // the other towns' totals use the weight saved with each line
  const sumStage = (stage: string): Tons => {
    const t = emptyTons();
    for (const l of otherLines) {
      if (l.stage !== stage) continue;
      const live = l.item_id ? items.get(l.item_id) : undefined;
      const cat = categorizeItem({ name: live?.name ?? l.item_name, type: live?.type ?? l.item_type, icon: live?.icon ?? null });
      if (cat) addKg(t, cat, Number(l.qty) * Number(l.weight_kg));
    }
    return t;
  };
  const toOpening = addTons(town.opening, sumStage("closing_opening"));
  const toSecondary = addTons(town.secondary, sumStage("secondary_sale"));
  const toClosing = addTons(town.closing, sumStage("closing_stock"));

  const filedTownIds = new Set<string>([input.townId, ...others.map((r: any) => r.town_id as string)]);
  const remaining = toTownIds.filter((id) => !filedTownIds.has(id)).length;
  const complete = remaining === 0;

  const base: StockCheckResult = {
    available: false,
    to_name: to.name,
    complete,
    remaining,
    town: { opening: roundTons(town.opening), secondary: roundTons(town.secondary), closing: roundTons(town.closing) },
  };

  // ---- the uploaded sheet for this month ----
  const { data: sheet, error: sheetErr } = await supabaseServer
    .from("stock_sheets")
    .select("id")
    .eq("report_month", input.month)
    .eq("report_year", input.year)
    .maybeSingle();
  if (sheetErr || !sheet) return { ...base, reason: "no_sheet" };

  const { data: rows } = await supabaseServer
    .from("stock_sheet_rows")
    .select("to_id, sheet_to_name, primary_ghee, primary_oil, primary_rso")
    .eq("sheet_id", sheet.id);
  const row = findSheetRow(rows ?? [], to.id, to.name);
  if (!row) return { ...base, reason: "no_row" };

  const primary: Tons = {
    ghee: Number(row.primary_ghee) || 0,
    oil: Number(row.primary_oil) || 0,
    rso: Number(row.primary_rso) || 0,
    total: 0,
  };
  primary.total = primary.ghee + primary.oil + primary.rso;

  const result: StockCheckResult = {
    ...base,
    available: true,
    to_total: {
      opening: roundTons(toOpening),
      primary: roundTons(primary),
      secondary: roundTons(toSecondary),
      closing: roundTons(toClosing),
    },
  };

  // Only compare once every town of the TO is in (the sheet row is the whole TO).
  if (complete) {
    const c = compareStock(toOpening, primary, toSecondary, toClosing);
    result.expected = roundTons(c.expected);
    result.diff = roundTons(c.diff);
    result.ok = c.ok;
    result.status = c.status;
  }
  return result;
}

// What gets saved on the filed report.
export function checkStatusOf(r: StockCheckResult | null): string | null {
  if (!r) return null;
  if (!r.available) return r.reason ?? "no_sheet";
  if (!r.complete) return "partial";
  return r.status ?? null;
}
