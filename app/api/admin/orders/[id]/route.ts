import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

interface Params {
  params: { id: string };
}

// GET /api/admin/orders/:id — order header + line items
export async function GET(_req: NextRequest, { params }: Params) {
  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("*")
    .eq("id", params.id)
    .single();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 404 });
  }

  const { data: orderItems, error: itemsError } = await supabaseServer
    .from("order_items")
    .select("*")
    .eq("order_id", params.id)
    .order("created_at", { ascending: true });

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  return NextResponse.json({ order: { ...order, order_items: orderItems } });
}

// PATCH /api/admin/orders/:id — status/notes only (line items are a snapshot, not editable)
export async function PATCH(req: NextRequest, { params }: Params) {
  const body = await req.json();
  const allowed: Record<string, unknown> = {};
  if (body.status !== undefined) allowed.status = body.status;
  if (body.notes !== undefined) allowed.notes = body.notes;

  const { data, error } = await supabaseServer
    .from("orders")
    .update(allowed)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ order: data });
}
