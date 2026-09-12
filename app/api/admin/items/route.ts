import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

const VALID_ICONS = ["tin", "pack", "bucket", "bottle", "soap"];

// GET /api/admin/items — all items (active + inactive), in sort order
export async function GET() {
  const { data, error } = await supabaseServer
    .from("items")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data });
}

// POST /api/admin/items — create a new item
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.name || body.rate === undefined || body.weight_kg === undefined || !body.type) {
    return NextResponse.json(
      { error: "name, weight_kg, rate, type are required" },
      { status: 400 }
    );
  }
  if (!["ghee", "oil", "other"].includes(body.type)) {
    return NextResponse.json({ error: "type must be ghee, oil, or other" }, { status: 400 });
  }
  if (body.icon !== undefined && body.icon !== null && !VALID_ICONS.includes(body.icon)) {
    return NextResponse.json(
      { error: `icon must be one of ${VALID_ICONS.join(", ")}` },
      { status: 400 }
    );
  }

  // default new items to the end of the list
  let sortOrder = body.sort_order;
  if (sortOrder === undefined) {
    const { data: last } = await supabaseServer
      .from("items")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = (last?.sort_order ?? 0) + 10;
  }

  const { data, error } = await supabaseServer
    .from("items")
    .insert({
      name: body.name,
      weight_kg: body.weight_kg,
      rate: body.rate,
      type: body.type,
      icon: body.icon ?? null,
      item_number: body.item_number ?? null,
      sku_number: body.sku_number ?? null,
      sort_order: sortOrder,
      is_active: body.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
}
