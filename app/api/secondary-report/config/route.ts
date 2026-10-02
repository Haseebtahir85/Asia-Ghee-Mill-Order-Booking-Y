// Destination: app/api/secondary-report/config/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { loadSecondaryReportSettings } from "@/lib/secondaryReportServer";

export const dynamic = "force-dynamic"; // always the live ON/OFF + month

// GET /api/secondary-report/config — public, read-only. Tells the /book page
// whether the report is ON, which months its pages cover, and which towns
// have an (active) TO — so it can fill in the TO's Name automatically.
export async function GET() {
  const settings = await loadSecondaryReportSettings();

  const { data, error } = await supabaseServer
    .from("tos")
    .select("id, name, town_id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    enabled: settings.enabled,
    selected_month: settings.selected_month,
    month: settings.month,
    year: settings.year,
    prev_month: settings.prev_month,
    prev_year: settings.prev_year,
    tos: data ?? [],
  });
}
