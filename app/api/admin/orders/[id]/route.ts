// Destination: app/api/admin/orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

interface Params {
  params: { id: string };
}

// GET /api/admin/orders/:id — order header + its line items, for the edit page.
export async function GET(_req: NextRequest, { params }: Params) {
  const { data: order, error } = await supabaseServer
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ order });
}

// PATCH /api/admin/orders/:id — update status/notes/town, and optionally
// replace the order's line items entirely (body.lines), recalculating
// total_amount/total_weight_kg the same way the public booking endpoint
// does — server re-fetches current rate/weight per item rather than
// trusting whatever the client sends.
export async function PATCH(req: NextRequest, { params }: Params) {
  const body = await req.json();
  const patch: Record<string, any> = {};

  if (body.status !== undefined) patch.status = body.status;
  if (body.notes !== undefined) patch.notes = body.notes;

  if (body.town_id !== undefined) {
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
    patch.town_id = town.id;
    patch.town = town.name;
  }

  if (Array.isArray(body.lines)) {
    const qtyLines = body.lines.filter((l: any) => l.qty && l.qty > 0);
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

    const { error: deleteError } = await supabaseServer.from("order_items").delete().eq("order_id", params.id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const { error: insertError } = await supabaseServer.from("order_items").insert(newLines);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    patch.total_amount = Math.round(totalAmount * 100) / 100;
    patch.total_weight_kg = Math.round(totalWeightKg * 1000) / 1000;
  }

  delete patch.id;
  delete patch.created_at;

  const { data, error } = await supabaseServer
    .from("orders")
    .update(patch)
    .eq("id", params.id)
    .select("*, order_items(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ order: data });
}