// Destination: app/api/secondary-report/config/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { loadSecondaryReportSettings } from "@/lib/secondaryReportServer";

// Never cache — the booking page must always see the live ON/OFF + month.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// GET /api/secondary-report/config — public, read-only. Tells the /book page:
//   - whether the report is ON and which months its pages cover
//   - every ACTIVE TO (even one with no towns yet) with the ids of its towns,
//     so a saved TO name always shows up when it is searched
//   - which towns have already filed for the open month (one report per town)
// Plain queries joined here (no embedded relationships), so this works even
// before Supabase has refreshed its schema cache.
export async function GET() {
  const settings = await loadSecondaryReportSettings();

  const [tosRes, linksRes, filedRes] = await Promise.all([
    supabaseServer.from("tos").select("id, name, sort_order").eq("is_active", true),
    supabaseServer.from("to_towns").select("to_id, town_id"),
    supabaseServer
      .from("secondary_reports")
      .select("town_id")
      .eq("report_month", settings.month)
      .eq("report_year", settings.year),
  ]);

  const failed = tosRes.error || linksRes.error || filedRes.error;
  if (failed) {
    return NextResponse.json(
      { error: `${failed.message} — did you run migration_ALL_secondary_reports.sql in Supabase?` },
      { status: 500, headers: NO_STORE }
    );
  }

  const townsByTo = new Map<string, string[]>();
  for (const l of linksRes.data ?? []) {
    const list = townsByTo.get(l.to_id) ?? [];
    list.push(l.town_id);
    townsByTo.set(l.to_id, list);
  }

  const tos = (tosRes.data ?? [])
    .slice()
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name)))
    .map((t: any) => ({ id: t.id as string, name: t.name as string, town_ids: townsByTo.get(t.id) ?? [] }));

  const filed_town_ids = (filedRes.data ?? []).map((r: any) => r.town_id).filter(Boolean) as string[];

  return NextResponse.json({ ...settings, tos, filed_town_ids }, { headers: NO_STORE });
}
