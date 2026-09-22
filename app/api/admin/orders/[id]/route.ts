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
// total_amount/total_weight_kg.
//
// Rate/weight handling: an order's line items are a PRICE SNAPSHOT taken
// at booking time and must never drift just because the admin edits the
// order later (e.g. to fix a qty, change status, or change town) — a
// price change on the catalog should only ever affect orders placed
// AFTER that change, never orders that already exist. So for any line
// whose item_id was already part of this order, we reuse the rate and
// weight_kg it already had — we do NOT re-fetch the item's current
// catalog rate for it. Only a line whose item_id is genuinely new to
// this order (the admin adding an item that wasn't on it before) gets
// priced at the item's current catalog rate, exactly like a brand new
// booking would.
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

    // What this order's lines looked like BEFORE this edit — the source
    // of truth for rate/weight_kg on any item_id that was already here.
    const { data: existingLines, error: existingError } = await supabaseServer
      .from("order_items")
      .select("item_id, rate, weight_kg")
      .eq("order_id", params.id);

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const existingByItemId = new Map(
      (existingLines ?? []).filter((l: any) => l.item_id).map((l: any) => [l.item_id, l])
    );

    // Only fetch current catalog rate/weight for lines that are new to
    // this order — existing lines keep their original snapshot and
    // never need the live catalog value.
    const newItemIds = qtyLines
      .map((l: any) => l.item_id)
      .filter((id: string) => !existingByItemId.has(id));

    const itemById = new Map<string, any>();
    if (newItemIds.length > 0) {
      const { data: items, error: itemsError } = await supabaseServer
        .from("items")
        .select("id, name, weight_kg, rate, type")
        .in("id", newItemIds);

      if (itemsError) {
        return NextResponse.json({ error: itemsError.message }, { status: 500 });
      }
      if (!items || items.length !== newItemIds.length) {
        return NextResponse.json({ error: "One or more items no longer exist" }, { status: 400 });
      }
      for (const it of items) itemById.set(it.id, it);
    }

    // Need name/type for every line (existing lines don't carry these
    // in existingByItemId), so fetch the full current catalog rows for
    // ALL item_ids involved — but rate/weight_kg below still prefer the
    // preserved snapshot over these current values.
    const allItemIds = qtyLines.map((l: any) => l.item_id);
    const { data: allItems, error: allItemsError } = await supabaseServer
      .from("items")
      .select("id, name, weight_kg, rate, type")
      .in("id", allItemIds);

    if (allItemsError) {
      return NextResponse.json({ error: allItemsError.message }, { status: 500 });
    }
    if (!allItems || allItems.length !== allItemIds.length) {
      return NextResponse.json({ error: "One or more items no longer exist" }, { status: 400 });
    }
    const catalogById = new Map(allItems.map((i) => [i.id, i]));

    let totalAmount = 0;
    let totalWeightKg = 0;

    const newLines = qtyLines.map((line: any) => {
      const catalogItem = catalogById.get(line.item_id)!;
      const existing = existingByItemId.get(line.item_id) as { rate: number; weight_kg: number } | undefined;
      const rate = existing ? existing.rate : catalogItem.rate;
      const weightKg = existing ? existing.weight_kg : catalogItem.weight_kg;

      totalAmount += Math.round(rate * line.qty * 100) / 100;
      totalWeightKg += weightKg * line.qty;
      return {
        order_id: params.id,
        item_id: catalogItem.id,
        item_name: catalogItem.name,
        item_type: catalogItem.type,
        rate,
        weight_kg: weightKg,
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