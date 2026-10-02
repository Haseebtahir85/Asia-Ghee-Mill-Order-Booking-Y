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

  let { data: order, error } = await supabaseServer
    .from("orders")
    .select("*, order_items(*)")
    .eq("order_number", orderNumber)
    .ilike("town", town)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The order stores the town's name as it was when the order was booked. If the
  // admin has renamed that town since, the customer types the NEW name (it is
  // what the dropdown shows), so also match through the town record itself.
  if (!order) {
    const { data: matchingTowns } = await supabaseServer.from("towns").select("id").ilike("name", town);
    const townIds = (matchingTowns ?? []).map((t: any) => t.id);
    if (townIds.length > 0) {
      const retry = await supabaseServer
        .from("orders")
        .select("*, order_items(*)")
        .eq("order_number", orderNumber)
        .in("town_id", townIds)
        .maybeSingle();
      if (retry.error) {
        return NextResponse.json({ error: retry.error.message }, { status: 500 });
      }
      order = retry.data;
    }
  }
  if (!order) {
    return NextResponse.json({ error: "No order found for that Town and Order ID." }, { status: 404 });
  }

  return NextResponse.json({ order });
}