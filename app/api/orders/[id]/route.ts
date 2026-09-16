// Destination: app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

interface Params {
  params: { id: string };
}

// PATCH /api/orders/:id — public endpoint for the booking page's
// "Edit Order" flow. The order's id alone is NEVER treated as
// sufficient authorization — order_number and town (the same pair
// required to look the order up in the first place) must be supplied
// again here and are re-verified server-side before anything is
// changed. Without this re-check, anyone who obtained the id from the
// lookup response could edit the order without actually knowing its
// real order_number/town.
//
// Rate/weight are always re-fetched fresh from the current catalog —
// never trusted from the client — same pattern as the public booking
// endpoint and the admin edit route.
export async function PATCH(req: NextRequest, { params }: Params) {
  const body = await req.json().catch(() => ({}));
  const orderNumber = String(body.order_number ?? "").trim();
  const town = String(body.town ?? "").trim();
  const lines = Array.isArray(body.lines) ? body.lines : [];
  const newTownId = typeof body.town_id === "string" ? body.town_id : undefined;

  if (!orderNumber || !town) {
    return NextResponse.json({ error: "Town and Order ID are required" }, { status: 400 });
  }

  const { data: existing, error: findError } = await supabaseServer
    .from("orders")
    .select("id")
    .eq("id", params.id)
    .eq("order_number", orderNumber)
    .ilike("town", town)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Order not found for that Town and Order ID." }, { status: 404 });
  }

  const qtyLines = lines.filter((l: any) => l.qty && l.qty > 0);
  if (qtyLines.length === 0) {
    return NextResponse.json({ error: "Enter a quantity for at least one item" }, { status: 400 });
  }

  const itemIds = qtyLines.map((l: any) => l.item_id);
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

  const newLines = qtyLines.map((line: any) => {
    const item = itemById.get(line.item_id)!;
    totalAmount += Math.round(item.rate * line.qty * 100) / 100;
    totalWeightKg += item.weight_kg * line.qty;
    return {
      order_id: params.id,
      item_id: item.id,
      item_name: item.name,
      item_type: item.type,
      rate: item.rate,
      weight_kg: item.weight_kg,
      qty: line.qty,
    };
  });

  const patch: Record<string, any> = {
    total_amount: Math.round(totalAmount * 100) / 100,
    total_weight_kg: Math.round(totalWeightKg * 1000) / 1000,
  };

  if (newTownId) {
    const { data: townRow, error: townError } = await supabaseServer
      .from("towns")
      .select("id, name")
      .eq("id", newTownId)
      .maybeSingle();

    if (townError) {
      return NextResponse.json({ error: townError.message }, { status: 500 });
    }
    if (!townRow) {
      return NextResponse.json({ error: "Selected town is invalid" }, { status: 400 });
    }
    patch.town_id = townRow.id;
    patch.town = townRow.name;
  }

  const { error: deleteError } = await supabaseServer.from("order_items").delete().eq("order_id", params.id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: insertError } = await supabaseServer.from("order_items").insert(newLines);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("orders")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ order: updated });
}