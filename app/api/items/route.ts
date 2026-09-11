import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// GET /api/items — active items only, in sort order. Used by the
// public /book page. Rate and weight_kg are included so the page
// can compute Amount and Weight live as quantities are typed —
// the UI just doesn't render a Rate column.
export async function GET() {
  const { data, error } = await supabaseServer
    .from("items")
    .select("id, name, weight_kg, rate, type, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data });
}
