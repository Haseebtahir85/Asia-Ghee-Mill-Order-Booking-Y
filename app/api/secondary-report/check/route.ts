// Destination: app/api/secondary-report/check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { loadSecondaryReportSettings } from "@/lib/secondaryReportServer";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

// GET /api/secondary-report/check?town_id=... — public. Has this town
// already filed the report for the period the admin currently has open?
export async function GET(req: NextRequest) {
  const townId = req.nextUrl.searchParams.get("town_id");
  if (!townId) {
    return NextResponse.json({ error: "town_id is required" }, { status: 400 });
  }

  const settings = await loadSecondaryReportSettings();

  const { data, error } = await supabaseServer
    .from("secondary_reports")
    .select("id")
    .eq("town_id", townId)
    .eq("report_month", settings.month)
    .eq("report_year", settings.year)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ filed: !!data, enabled: settings.enabled });
}
