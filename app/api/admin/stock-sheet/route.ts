// Destination: app/api/admin/stock-sheet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// never read the (large) file copy when listing — only whether one exists (file_mime)
const SHEET_COLS = "id, report_month, report_year, file_name, uploaded_at, file_mime";
const SHEET_COLS_OLD = "id, report_month, report_year, file_name, uploaded_at"; // before migration_v11
const MAX_FILE_BASE64 = 6_000_000; // ~4.5 MB of Excel

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

function mimeOf(fileName: string): string {
  return /\.xls$/i.test(fileName)
    ? "application/vnd.ms-excel"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

// select sheets (without the file copy); works before and after migration_v11
async function selectSheets(apply: (q: any) => any) {
  let r = await apply(supabaseServer.from("stock_sheets").select(SHEET_COLS));
  if (r.error) r = await apply(supabaseServer.from("stock_sheets").select(SHEET_COLS_OLD));
  return r;
}

const withFlag = (s: any) => {
  const { file_mime, ...rest } = s;
  return { ...rest, has_file: !!file_mime };
};

// GET /api/admin/stock-sheet
//   (no params)          -> { sheets: [...] }  every uploaded file, newest month first
//   ?id=<uuid>           -> { sheet, rows }     one file with its rows
//   ?month=8&year=2026   -> { sheet, rows }     the file for a month (or sheet: null)
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const m = parseInt(req.nextUrl.searchParams.get("month") ?? "", 10);
  const y = parseInt(req.nextUrl.searchParams.get("year") ?? "", 10);

  // ---- one file ----
  if (id || (m >= 1 && m <= 12 && y >= 2000)) {
    if (id && !UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const { data: sheet, error } = await selectSheets((q) =>
      (id ? q.eq("id", id) : q.eq("report_month", m).eq("report_year", y)).maybeSingle()
    );
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
    return NextResponse.json({ sheet: withFlag(sheet), rows: rows ?? [] });
  }

  // ---- the list of all uploaded files ----
  const { data: sheets, error } = await selectSheets((q) =>
    q.order("report_year", { ascending: false }).order("report_month", { ascending: false })
  );
  if (error) {
    return NextResponse.json(
      { error: `${error.message} — did you run migration_v10_stock_check.sql in Supabase?` },
      { status: 500 }
    );
  }
  const { data: rowRefs } = await supabaseServer.from("stock_sheet_rows").select("sheet_id, to_id");
  const counts = new Map<string, { rows: number; matched: number }>();
  for (const r of rowRefs ?? []) {
    const c = counts.get(r.sheet_id) ?? { rows: 0, matched: 0 };
    c.rows++;
    if (r.to_id) c.matched++;
    counts.set(r.sheet_id, c);
  }
  return NextResponse.json({
    sheets: (sheets ?? []).map((s: any) => ({ ...withFlag(s), ...(counts.get(s.id) ?? { rows: 0, matched: 0 }) })),
  });
}

// POST /api/admin/stock-sheet — save (replace) the file for a month.
// Body: { report_month, report_year, file_name, file_data?: base64 of the Excel file,
//         rows: [{ row_no, to_name, towns, to_id, opening|primary|secondary|closing: {ghee,oil,rso}, remarks }] }
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
  const fileName = String(body.file_name ?? "").slice(0, 200) || null;

  // optional copy of the uploaded file, so it can be downloaded again exactly as uploaded
  let fileData: string | null = null;
  if (typeof body.file_data === "string" && body.file_data) {
    const b64 = body.file_data.replace(/^data:[^;]*;base64,/, "").replace(/\s/g, "");
    if (b64.length > 0 && b64.length <= MAX_FILE_BASE64 && /^[A-Za-z0-9+/]+={0,2}$/.test(b64)) fileData = b64;
  }

  // only keep TO links that really exist
  const wantedToIds = Array.from(new Set(rowsIn.map((r) => String(r.to_id ?? "")).filter((id) => UUID.test(id))));
  const validToIds = new Set<string>();
  if (wantedToIds.length > 0) {
    const { data: tos } = await supabaseServer.from("tos").select("id").in("id", wantedToIds);
    for (const t of tos ?? []) validToIds.add(t.id);
  }

  // replace any file already saved for this month
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

  const base = { report_month: month, report_year: year, file_name: fileName };
  let fileStored = false;
  let sheet: any = null;
  let sheetErr: any = null;
  if (fileData) {
    const r = await supabaseServer
      .from("stock_sheets")
      .insert({ ...base, file_data: fileData, file_mime: mimeOf(fileName ?? "") })
      .select(SHEET_COLS_OLD)
      .single();
    sheet = r.data;
    sheetErr = r.error;
    fileStored = !!sheet;
  }
  if (!sheet) {
    // no copy kept (none sent, too large, or migration_v11 not run yet) — the data is still saved
    const r = await supabaseServer.from("stock_sheets").insert(base).select(SHEET_COLS_OLD).single();
    sheet = r.data;
    sheetErr = r.error;
  }
  if (sheetErr || !sheet) {
    return NextResponse.json({ error: sheetErr?.message ?? "Failed to save the stock sheet" }, { status: 500 });
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

  return NextResponse.json(
    { sheet, saved: rows.length, matched: rows.filter((r) => r.to_id).length, file_stored: fileStored },
    { status: 201 }
  );
}

// DELETE /api/admin/stock-sheet?id=<uuid>  (or ?month=8&year=2026) — remove one uploaded file
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const m = parseInt(req.nextUrl.searchParams.get("month") ?? "", 10);
  const y = parseInt(req.nextUrl.searchParams.get("year") ?? "", 10);

  let q = supabaseServer.from("stock_sheets").delete();
  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    q = q.eq("id", id);
  } else if (m >= 1 && m <= 12 && y >= 2000) {
    q = q.eq("report_month", m).eq("report_year", y);
  } else {
    return NextResponse.json({ error: "id (or month and year) is required" }, { status: 400 });
  }
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PATCH /api/admin/stock-sheet?id=<uuid> — change which TO each row is matched to.
// Body: { links: [{ id: <row id>, to_id: <TO id or null> }] }
// Only the matching changes: the saved file copy and all numbers stay exactly as uploaded.
export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const links: { id: string; to_id: string | null }[] = (Array.isArray(body.links) ? body.links : [])
    .map((l: any) => ({ id: String(l?.id ?? ""), to_id: UUID.test(String(l?.to_id ?? "")) ? String(l.to_id) : null }))
    .filter((l: { id: string }) => UUID.test(l.id));
  if (links.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const wanted = Array.from(new Set(links.map((l) => l.to_id).filter(Boolean))) as string[];
  const valid = new Set<string>();
  if (wanted.length > 0) {
    const { data: tos } = await supabaseServer.from("tos").select("id").in("id", wanted);
    for (const t of tos ?? []) valid.add(t.id);
  }

  const results = await Promise.all(
    links.map((l) =>
      supabaseServer
        .from("stock_sheet_rows")
        .update({ to_id: l.to_id && valid.has(l.to_id) ? l.to_id : null })
        .eq("id", l.id)
        .eq("sheet_id", id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  const { data: rows } = await supabaseServer.from("stock_sheet_rows").select("to_id").eq("sheet_id", id);
  return NextResponse.json({ ok: true, rows: (rows ?? []).length, matched: (rows ?? []).filter((r: any) => r.to_id).length });
}
