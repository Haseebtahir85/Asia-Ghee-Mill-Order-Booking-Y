// Destination: app/api/admin/orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// GET /api/admin/orders — filterable list for the admin Orders page.
// Query params (all optional): status, town_id, from (YYYY-MM-DD), to (YYYY-MM-DD)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const townId = searchParams.get("town_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabaseServer.from("orders").select("*").order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (townId) query = query.eq("town_id", townId);
  if (from) query = query.gte("order_date", from);
  if (to) query = query.lte("order_date", to);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: data });
}