// Destination: app/api/secondary-report/config/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { loadSecondaryReportSettings } from "@/lib/secondaryReportServer";

// Never cache — the booking page must always see the live ON/OFF + month.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// GET /api/secondary-report/config — public, read-only. Tells the /book page
// whether the report is ON, which months its pages cover, and the active
// TO's (town_id = null means that TO works for every town).
export async function GET() {
  const settings = await loadSecondaryReportSettings();

  const { data, error } = await supabaseServer
    .from("tos")
    .select("id, name, town_id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json({ ...settings, tos: data ?? [] }, { headers: NO_STORE });
}
