import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { DEFAULT_OIL_DENSITY_KG_PER_LITER } from "@/lib/weightParser";

// Always read live data from the database — never a copy frozen at build time
// (otherwise a renamed/deleted town or a changed rate keeps showing the old value).
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

// GET /api/settings — public, read-only. Only exposes the handful
// of keys the booking page needs to compute live weight totals.
const PUBLIC_KEYS = ["oil_density_kg_per_liter"];

export async function GET() {
  const { data, error } = await supabaseServer
    .from("settings")
    .select("key, value")
    .in("key", PUBLIC_KEYS);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value;

  return NextResponse.json({
    oil_density_kg_per_liter: map.oil_density_kg_per_liter
      ? parseFloat(map.oil_density_kg_per_liter)
      : DEFAULT_OIL_DENSITY_KG_PER_LITER,
  });
}
