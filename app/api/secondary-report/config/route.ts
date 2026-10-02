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

  // one entry per (active TO, town) — a town has at most one TO
  const { data, error } = await supabaseServer
    .from("to_towns")
    .select("to_id, town_id, tos!inner(name, is_active, sort_order)")
    .eq("tos.is_active", true);

  if (error) {
    return NextResponse.json(
      { error: `${error.message} — did you run migration_v9_to_towns.sql in Supabase?` },
      { status: 500, headers: NO_STORE }
    );
  }

  const tos = (data ?? [])
    .map((r: any) => ({ id: r.to_id, name: r.tos?.name ?? "", town_id: r.town_id, sort: r.tos?.sort_order ?? 0 }))
    .sort((a: any, b: any) => a.sort - b.sort)
    .map(({ id, name, town_id }: any) => ({ id, name, town_id }));

  return NextResponse.json({ ...settings, tos }, { headers: NO_STORE });
}