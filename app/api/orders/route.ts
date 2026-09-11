import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { NewOrderInput } from "@/lib/types";
import { parseUnitWeightKg, DEFAULT_OIL_DENSITY_KG_PER_LITER } from "@/lib/weightParser";

// POST /api/orders — public endpoint the /book page submits to.
// Rates, types, and weights are always recomputed server-side from
// the current item catalog — the client only sends item_id + qty,
// so a tampered request can't book at a fake price.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as NewOrderInput;

  if (!body.customer_name || !Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json(
      { error: "customer_name and at least one order line are required" },
      { status: 400 }
    );
  }

  const qtyLines = body.lines.filter((l) => l.qty && l.qty > 0);
  if (qtyLines.length === 0) {
    return NextResponse.json({ error: "Enter a quantity for at least one item" }, { status: 400 });
  }

  const itemIds = qtyLines.map((l) => l.item_id);
  const { data: items, error: itemsError } = await supabaseServer
    .from("items")
    .select("id, name, rate, type")
    .in("id", itemIds);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }
  if (!items || items.length !== itemIds.length) {
    return NextResponse.json({ error: "One or more items no longer exist" }, { status: 400 });
  }

  const { data: densitySetting } = await supabaseServer
    .from("settings")
    .select("value")
    .eq("key", "oil_density_kg_per_liter")
    .maybeSingle();
  const oilDensity = densitySetting ? parseFloat(densitySetting.value) : DEFAULT_OIL_DENSITY_KG_PER_LITER;

  const itemById = new Map(items.map((i) => [i.id, i]));

  let totalAmount = 0;
  let totalWeightGheeKg = 0;
  let totalWeightOilKg = 0;

  const orderItemsToInsert = qtyLines.map((line) => {
    const item = itemById.get(line.item_id)!;
    const unitWeightKg = parseUnitWeightKg(item.name, oilDensity);
    const lineWeightKg = unitWeightKg * line.qty;
    const lineAmount = Math.round(item.rate * line.qty * 100) / 100;

    totalAmount += lineAmount;
    if (item.type === "ghee") totalWeightGheeKg += lineWeightKg;
    if (item.type === "oil") totalWeightOilKg += lineWeightKg;

    return {
      item_id: item.id,
      item_name: item.name,
      item_type: item.type,
      rate: item.rate,
      qty: line.qty,
      weight_kg: Math.round(lineWeightKg * 1000) / 1000,
    };
  });

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .insert({
      customer_name: body.customer_name,
      customer_contact: body.customer_contact ?? null,
      notes: body.notes ?? null,
      total_amount: Math.round(totalAmount * 100) / 100,
      total_weight_ghee_kg: Math.round(totalWeightGheeKg * 1000) / 1000,
      total_weight_oil_kg: Math.round(totalWeightOilKg * 1000) / 1000,
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
