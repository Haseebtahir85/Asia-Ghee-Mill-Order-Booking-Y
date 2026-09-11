import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

interface Params {
  params: { id: string };
}

// PATCH /api/admin/items/:id — update name/rate/type/is_active/sort_order
export async function PATCH(req: NextRequest, { params }: Params) {
  const body = await req.json();

  delete body.id;
  delete body.created_at;

  if (body.type && !["ghee", "oil", "other"].includes(body.type)) {
    return NextResponse.json({ error: "type must be ghee, oil, or other" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("items")
    .update(body)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

// DELETE /api/admin/items/:id
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await supabaseServer.from("items").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
