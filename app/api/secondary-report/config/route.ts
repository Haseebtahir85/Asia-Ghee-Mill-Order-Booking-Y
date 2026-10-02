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

  // one entry per (active TO, town) — a town has at most one TO.
  // Plain queries joined here (no embedded relationships), so this works
  // even before Supabase has refreshed its schema cache.
  const [tosRes, linksRes] = await Promise.all([
    supabaseServer.from("tos").select("id, name, sort_order").eq("is_active", true),
    supabaseServer.from("to_towns").select("to_id, town_id"),
  ]);

  const failed = tosRes.error || linksRes.error;
  if (failed) {
    return NextResponse.json(
      { error: `${failed.message} — did you run migration_v9_to_towns.sql in Supabase?` },
      { status: 500, headers: NO_STORE }
    );
  }

  const activeTo = new Map((tosRes.data ?? []).map((t: any) => [t.id, t]));
  const tos = (linksRes.data ?? [])
    .filter((l: any) => activeTo.has(l.to_id))
    .map((l: any) => {
      const t: any = activeTo.get(l.to_id);
      return { id: l.to_id as string, name: t.name as string, town_id: l.town_id as string, sort: t.sort_order ?? 0 };
    })
    .sort((a, b) => a.sort - b.sort)
    .map(({ id, name, town_id }) => ({ id, name, town_id }));

  return NextResponse.json({ ...settings, tos }, { headers: NO_STORE });
}