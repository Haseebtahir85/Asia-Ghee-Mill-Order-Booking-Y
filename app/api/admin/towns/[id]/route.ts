// Destination: app/api/admin/towns/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

interface Params {
  params: { id: string };
}

// PATCH /api/admin/towns/:id — update name/is_active/sort_order
export async function PATCH(req: NextRequest, { params }: Params) {
  const body = await req.json();
  delete body.id;
  delete body.created_at;

  const { data, error } = await supabaseServer
    .from("towns")
    .update(body)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ town: data });
}

// DELETE /api/admin/towns/:id — past orders keep their town name
// snapshot; only the live link (town_id) is cleared.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await supabaseServer.from("towns").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}