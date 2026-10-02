// Destination: app/api/admin/stock-sheet/download/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { buildStockSheetBuffer } from "@/lib/stockSheetBuild";
import { MONTH_NAMES } from "@/lib/secondaryReport";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// GET /api/admin/stock-sheet/download?id=<uuid>
//   - the file exactly as it was uploaded, when a copy was kept;
//   - otherwise the same layout rebuilt from the saved rows (Closing = Opening + Primary - Secondary).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { data: sheet, error } = await supabaseServer.from("stock_sheets").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!sheet) return NextResponse.json({ error: "File not found" }, { status: 404 });

  let body: Buffer;
  let name: string;
  let mime: string;
  let source: "original" | "rebuilt";

  if (sheet.file_data) {
    body = Buffer.from(String(sheet.file_data), "base64");
    name = sheet.file_name || `Stock-Sheet-${MONTH_NAMES[sheet.report_month - 1]}-${sheet.report_year}.xlsx`;
    mime = sheet.file_mime || XLSX_MIME;
    source = "original";
  } else {
    const { data: rows, error: rowsErr } = await supabaseServer
      .from("stock_sheet_rows")
      .select("*")
      .eq("sheet_id", sheet.id)
      .order("row_no", { ascending: true });
    if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });
    body = buildStockSheetBuffer(rows ?? [], sheet.report_month, sheet.report_year);
    const base = (sheet.file_name || `Stock-Sheet-${MONTH_NAMES[sheet.report_month - 1]}-${sheet.report_year}`).replace(/\.xlsx?$/i, "");
    name = `${base}.xlsx`;
    mime = XLSX_MIME;
    source = "rebuilt";
  }

  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Content-Length": String(body.length),
      "Cache-Control": "no-store",
      "X-Stock-Sheet-Source": source,
    },
  });
}
