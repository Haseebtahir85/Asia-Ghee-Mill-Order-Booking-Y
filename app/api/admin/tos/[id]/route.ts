// Destination: app/api/admin/tos/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { addTownsToTo, cleanTownIds, conflictMessage, findTownConflicts, removeTownsFromTo } from "@/lib/tosServer";

interface Params {
  params: { id: string };
}

// PATCH /api/admin/tos/:id — update name / is_active / sort_order and/or the
// TO's full list of towns (town_ids replaces the current list).
export async function PATCH(req: NextRequest, { params }: Params) {
  const body = await req.json();

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (!String(body.name).trim()) {
      return NextResponse.json({ error: "TO's name can't be empty" }, { status: 400 });
    }
    patch.name = String(body.name).trim();
  }
  if (body.is_active !== undefined) patch.is_active = !!body.is_active;
  if (body.sort_order !== undefined) patch.sort_order = body.sort_order;

  const hasTowns = body.town_ids !== undefined;
  if (Object.keys(patch).length === 0 && !hasTowns) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    if (hasTowns) {
      const townIds = cleanTownIds(body.town_ids);
      const conflicts = await findTownConflicts(townIds, params.id);
      if (conflicts.length > 0) {
        return NextResponse.json({ error: conflictMessage(conflicts) }, { status: 409 });
      }
      await removeTownsFromTo(params.id, townIds);
      await addTownsToTo(params.id, townIds);
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseServer.from("tos").update(patch).eq("id", params.id);
      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ error: "A TO with this name already exists." }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/admin/tos/:id — its towns are freed; filed reports keep the
// TO's name snapshot, only the live link (to_id) is cleared.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await supabaseServer.from("tos").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
