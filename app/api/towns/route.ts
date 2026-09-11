import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// GET /api/towns — active towns only, in sort order. Used by the
// public /book page's Town dropdown.
export async function GET() {
  const { data, error } = await supabaseServer
    .from("towns")
    .select("id, name, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ towns: data });
}
