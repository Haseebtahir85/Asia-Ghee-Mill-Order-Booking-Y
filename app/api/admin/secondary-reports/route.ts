// Destination: app/api/admin/secondary-reports/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/admin/secondary-reports?month=9&year=2026 — every filed report
// (newest first) with its lines. month/year are optional filters.
export async function GET(req: NextRequest) {
  const month = parseInt(req.nextUrl.searchParams.get("month") ?? "", 10);
  const year = parseInt(req.nextUrl.searchParams.get("year") ?? "", 10);

  let query = supabaseServer
    .from("secondary_reports")
    .select("*, secondary_report_lines(*)")
    .order("created_at", { ascending: false });

  if (Number.isFinite(month)) query = query.eq("report_month", month);
  if (Number.isFinite(year)) query = query.eq("report_year", year);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reports: data ?? [] });
}
