import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// GET /api/items — active items only, in sort order. Used by the
// public /book page. No admin auth required (it's meant to be a
// shareable link), but only active items and only these columns
// are exposed.
export async function GET() {
  const { data, error } = await supabaseServer
    .from("items")
    .select("id, name, rate, type, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data });
}
