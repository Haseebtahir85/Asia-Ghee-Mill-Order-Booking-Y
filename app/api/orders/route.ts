// Destination: app/api/orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { NewOrderInput } from "@/lib/types";

// POST /api/orders — public endpoint the /book page submits to.
// Rate, weight, type, and town name are always re-fetched from the
// current catalog/town list server-side — the client only sends
// item_id + qty and a town_id, so a tampered request can't book at
// a fake price/weight or an invalid town.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as NewOrderInput;

  if (!body.town_id || !Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json(
      { error: "town and at least one order line are required" },
      { status: 400 }
    );
  }

  const qtyLines = body.lines.filter((l) => l.qty && l.qty > 0);
  if (qtyLines.length === 0) {
    return NextResponse.json({ error: "Enter a quantity for at least one item" }, { status: 400 });
  }

  const { data: town, error: townError } = await supabaseServer
    .from("towns")
    .select("id, name")
    .eq("id", body.town_id)
    .maybeSingle();

  if (townError) {
    return NextResponse.json({ error: townError.message }, { status: 500 });
  }
  if (!town) {
    return NextResponse.json({ error: "Selected town is invalid" }, { status: 400 });
  }

  const itemIds = qtyLines.map((l) => l.item_id);
  const { data: items, error: itemsError } = await supabaseServer
    .from("items")
    .select("id, name, weight_kg, rate, type")
    .in("id", itemIds);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }
  if (!items || items.length !== itemIds.length) {
    return NextResponse.json({ error: "One or more items no longer exist" }, { status: 400 });
  }

  const itemById = new Map(items.map((i) => [i.id, i]));

  let totalAmount = 0;
  let totalWeightKg = 0;

  // rate and weight_kg stored per line are PER UNIT (a snapshot of
  // the catalog item at order time) — amount and weight_total_kg
  // are computed by the database as generated columns (qty * rate,
  // qty * weight_kg), so we never multiply by qty twice here.
  const orderItemsToInsert = qtyLines.map((line) => {
    const item = itemById.get(line.item_id)!;
    totalAmount += Math.round(item.rate * line.qty * 100) / 100;
    totalWeightKg += item.weight_kg * line.qty;

    return {
      item_id: item.id,
      item_name: item.name,
      item_type: item.type,
      rate: item.rate,
      weight_kg: item.weight_kg,
      qty: line.qty,
    };
  });

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .insert({
      town_id: town.id,
      town: town.name,
      notes: body.notes ?? null,
      total_amount: Math.round(totalAmount * 100) / 100,
      total_weight_kg: Math.round(totalWeightKg * 1000) / 1000,
    })
    .select()
    .single();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  const { error: lineError } = await supabaseServer
    .from("order_items")
    .insert(orderItemsToInsert.map((line) => ({ ...line, order_id: order.id })));

  if (lineError) {
    // roll back the order header so we don't leave an empty order behind
    await supabaseServer.from("orders").delete().eq("id", order.id);
    return NextResponse.json({ error: lineError.message }, { status: 500 });
  }

  return NextResponse.json({ order }, { status: 201 });
}