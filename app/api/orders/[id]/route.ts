import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

interface Params {
  params: { id: string };
}

// GET /api/orders/:id
export async function GET(_req: NextRequest, { params }: Params) {
  const { data, error } = await supabaseServer
    .from("orders")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ order: data });
}

// PATCH /api/orders/:id — partial update (status change, edit weight/rate, etc.)
export async function PATCH(req: NextRequest, { params }: Params) {
  const body = await req.json();

  // Never let the client overwrite these directly
  delete body.id;
  delete body.order_number;
  delete body.total_amount;
  delete body.created_at;

  const { data, error } = await supabaseServer
    .from("orders")
    .update(body)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ order: data });
}

// DELETE /api/orders/:id
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await supabaseServer.from("orders").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
