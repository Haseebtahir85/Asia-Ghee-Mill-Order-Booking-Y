// Destination: app/api/secondary-report/compare/route.ts
import { NextRequest, NextResponse } from "next/server";
import { loadSecondaryReportSettings } from "@/lib/secondaryReportServer";
import { buildStockCheck, StockLine } from "@/lib/stockCheckServer";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanLines(raw: unknown): StockLine[] {
  if (!Array.isArray(raw)) return [];
  const merged = new Map<string, number>();
  for (const l of raw as any[]) {
    const id = String(l?.item_id ?? "");
    const qty = Number(l?.qty);
    if (!UUID.test(id) || !Number.isFinite(qty) || qty <= 0) continue;
    merged.set(id, (merged.get(id) ?? 0) + qty);
  }
  return Array.from(merged, ([item_id, qty]) => ({ item_id, qty }));
}

// POST /api/secondary-report/compare — public. Used by the booking page's last
// confirmation screen: totals of Ghee / Oil / RSO for the three pages and, when
// the admin has uploaded the month's stock sheet, the comparison with it.
// Nothing is saved here. `result` is null when there is nothing to show; the
// page then simply shows no stock check (it never blocks the report).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const townId = String(body.town_id ?? "");
    if (!UUID.test(townId)) return NextResponse.json({ result: null }, { headers: NO_STORE });

    const settings = await loadSecondaryReportSettings();
    const result = await buildStockCheck({
      townId,
      month: settings.month,
      year: settings.year,
      closing_opening: cleanLines(body.closing_opening),
      secondary_sale: cleanLines(body.secondary_sale),
      closing_stock: cleanLines(body.closing_stock),
    });
    return NextResponse.json({ result }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ result: null }, { headers: NO_STORE });
  }
}
