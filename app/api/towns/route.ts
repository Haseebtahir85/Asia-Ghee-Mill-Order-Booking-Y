// Destination: app/api/towns/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// Always read live data from the database — never a copy frozen at build time
// (otherwise a renamed/deleted town or a changed rate keeps showing the old value).
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

// GET /api/towns — active towns only, in sort order. Used by the
// public /book page's Town dropdown. group_no and upc are included
// so the dropdown can match a search against them, but the page
// only ever displays the town name — never the raw codes.
export async function GET() {
  const { data, error } = await supabaseServer
    .from("towns")
    .select("id, name, group_no, upc, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ towns: data });
}