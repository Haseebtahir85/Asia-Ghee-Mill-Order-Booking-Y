// Destination: app/api/admin/stock-sheet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function period(req: NextRequest) {
  const m = parseInt(req.nextUrl.searchParams.get("month") ?? "", 10);
  const y = parseInt(req.nextUrl.searchParams.get("year") ?? "", 10);
  return { month: m, year: y, ok: m >= 1 && m <= 12 && y >= 2000 && y <= 2100 };
}

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

// GET /api/admin/stock-sheet?month=8&year=2026 — the uploaded sheet for a month (or null)
export async function GET(req: NextRequest) {
  const p = period(req);
  if (!p.ok) return NextResponse.json({ error: "month and year are required" }, { status: 400 });

  const { data: sheet, error } = await supabaseServer
    .from("stock_sheets")
    .select("*")
    .eq("report_month", p.month)
    .eq("report_year", p.year)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: `${error.message} — did you run migration_v10_stock_check.sql in Supabase?` },
      { status: 500 }
    );
  }
  if (!sheet) return NextResponse.json({ sheet: null, rows: [] });

  const { data: rows, error: rowsErr } = await supabaseServer
    .from("stock_sheet_rows")
    .select("*")
    .eq("sheet_id", sheet.id)
    .order("row_no", { ascending: true });
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  return NextResponse.json({ sheet, rows: rows ?? [] });
}

// POST /api/admin/stock-sheet — save (replace) the sheet for a month.
// Body: { report_month, report_year, file_name, rows: [{ row_no, to_name, towns, to_id,
//         opening|primary|secondary|closing: {ghee,oil,rso}, remarks }] }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const month = parseInt(String(body.report_month ?? ""), 10);
  const year = parseInt(String(body.report_year ?? ""), 10);
  if (!(month >= 1 && month <= 12) || !(year >= 2000 && year <= 2100)) {
    return NextResponse.json({ error: "A valid month and year are required" }, { status: 400 });
  }
  const rowsIn: any[] = Array.isArray(body.rows) ? body.rows : [];
  if (rowsIn.length === 0) {
    return NextResponse.json({ error: "The sheet has no rows" }, { status: 400 });
  }

  // only keep TO links that really exist
  const wantedToIds = Array.from(new Set(rowsIn.map((r) => String(r.to_id ?? "")).filter((id) => UUID.test(id))));
  const validToIds = new Set<string>();
  if (wantedToIds.length > 0) {
    const { data: tos } = await supabaseServer.from("tos").select("id").in("id", wantedToIds);
    for (const t of tos ?? []) validToIds.add(t.id);
  }

  // replace any sheet already saved for this month
  const { error: delErr } = await supabaseServer
    .from("stock_sheets")
    .delete()
    .eq("report_month", month)
    .eq("report_year", year);
  if (delErr) {
    return NextResponse.json(
      { error: `${delErr.message} — did you run migration_v10_stock_check.sql in Supabase?` },
      { status: 500 }
    );
  }

  const { data: sheet, error: sheetErr } = await supabaseServer
    .from("stock_sheets")
    .insert({ report_month: month, report_year: year, file_name: String(body.file_name ?? "").slice(0, 200) || null })
    .select()
    .single();
  if (sheetErr || !sheet) {
    return NextResponse.json({ error: sheetErr?.message ?? "Failed to save the sheet" }, { status: 500 });
  }

  const rows = rowsIn
    .filter((r) => String(r.to_name ?? "").trim())
    .map((r) => ({
      sheet_id: sheet.id,
      row_no: parseInt(String(r.row_no ?? 0), 10) || 0,
      sheet_to_name: String(r.to_name).trim().slice(0, 200),
      sheet_towns: String(r.towns ?? "").slice(0, 400) || null,
      to_id: validToIds.has(String(r.to_id ?? "")) ? String(r.to_id) : null,
      opening_ghee: n(r.opening?.ghee),
      opening_oil: n(r.opening?.oil),
      opening_rso: n(r.opening?.rso),
      primary_ghee: n(r.primary?.ghee) ?? 0,
      primary_oil: n(r.primary?.oil) ?? 0,
      primary_rso: n(r.primary?.rso) ?? 0,
      secondary_ghee: n(r.secondary?.ghee),
      secondary_oil: n(r.secondary?.oil),
      secondary_rso: n(r.secondary?.rso),
      closing_ghee: n(r.closing?.ghee),
      closing_oil: n(r.closing?.oil),
      closing_rso: n(r.closing?.rso),
      remarks: String(r.remarks ?? "").slice(0, 400) || null,
    }));

  const { error: rowsErr } = await supabaseServer.from("stock_sheet_rows").insert(rows);
  if (rowsErr) {
    await supabaseServer.from("stock_sheets").delete().eq("id", sheet.id); // don't leave a half-saved sheet
    return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  }

  return NextResponse.json({ sheet, saved: rows.length, matched: rows.filter((r) => r.to_id).length }, { status: 201 });
}

// DELETE /api/admin/stock-sheet?month=8&year=2026 — remove the sheet for a month
export async function DELETE(req: NextRequest) {
  const p = period(req);
  if (!p.ok) return NextResponse.json({ error: "month and year are required" }, { status: 400 });
  const { error } = await supabaseServer.from("stock_sheets").delete().eq("report_month", p.month).eq("report_year", p.year);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
