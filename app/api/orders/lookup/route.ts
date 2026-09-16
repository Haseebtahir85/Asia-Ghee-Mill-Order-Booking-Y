// Destination: app/api/orders/lookup/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// POST /api/orders/lookup — public endpoint for the booking page's
// "Edit Order" flow. Town + Order ID together act as a lightweight
// shared credential: both must match (town case-insensitively) for the
// order to be returned at all. Returns the order with its line items
// so the booking page can pre-fill the form for editing.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const orderNumber = String(body.order_number ?? "").trim();
  const town = String(body.town ?? "").trim();

  if (!orderNumber || !town) {
    return NextResponse.json({ error: "Town and Order ID are required" }, { status: 400 });
  }

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select("*, order_items(*)")
    .eq("order_number", orderNumber)
    .ilike("town", town)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "No order found for that Town and Order ID." }, { status: 404 });
  }

  return NextResponse.json({ order });
}