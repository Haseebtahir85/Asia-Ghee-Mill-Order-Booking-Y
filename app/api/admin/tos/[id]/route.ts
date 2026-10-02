// Destination: app/api/admin/tos/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

interface Params {
  params: { id: string };
}

// PATCH /api/admin/tos/:id — update name / town_id / is_active / sort_order
export async function PATCH(req: NextRequest, { params }: Params) {
  const body = await req.json();

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (!String(body.name).trim()) {
      return NextResponse.json({ error: "TO's name can't be empty" }, { status: 400 });
    }
    patch.name = String(body.name).trim();
  }
  if (body.town_id !== undefined) patch.town_id = body.town_id;
  if (body.is_active !== undefined) patch.is_active = !!body.is_active;
  if (body.sort_order !== undefined) patch.sort_order = body.sort_order;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.from("tos").update(patch).eq("id", params.id).select().single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    const message =
      error.code === "23505" ? "That town already has a TO assigned. A town can only have one TO." : error.message;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ to: data });
}

// DELETE /api/admin/tos/:id — filed reports keep their TO name snapshot;
// only the live link (to_id) is cleared.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await supabaseServer.from("tos").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
