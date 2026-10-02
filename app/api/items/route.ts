import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// Always read live data from the database — never a copy frozen at build time
// (otherwise a renamed/deleted town or a changed rate keeps showing the old value).
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

// GET /api/items — active items only, in sort order. Used by the
// public /book page. Rate and weight_kg are included so the page
// can compute Amount and Weight live as quantities are typed —
// the UI just doesn't render a Rate column. icon is included so the
// book page can use the admin's explicit choice instead of guessing
// from the item name.
export async function GET() {
  const { data, error } = await supabaseServer
    .from("items")
    .select("id, name, weight_kg, rate, type, icon, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data });
}
