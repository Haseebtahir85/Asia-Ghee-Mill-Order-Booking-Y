// Destination: app/api/admin/tos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { addTownsToTo, cleanTownIds, conflictMessage, findTownConflicts } from "@/lib/tosServer";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// GET /api/admin/tos — all TOs (active + inactive) with their towns, in sort order
export async function GET() {
  const { data, error } = await supabaseServer
    .from("tos")
    .select("*, to_towns(town_id, towns(name))")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tos = (data ?? []).map((row: any) => {
    const { to_towns, ...rest } = row;
    const towns = (to_towns ?? [])
      .map((x: any) => ({ id: x.town_id, name: x.towns?.name ?? "" }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
    return { ...rest, towns };
  });

  return NextResponse.json({ tos });
}

// POST /api/admin/tos — add a TO with one or more towns.
// Body: { name: string, town_ids: string[] }. A town can only belong to one TO.
export async function POST(req: NextRequest) {
  const body = await req.json();

  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "TO's name is required" }, { status: 400 });
  }
  const townIds = cleanTownIds(body.town_ids);

  try {
    const conflicts = await findTownConflicts(townIds);
    if (conflicts.length > 0) {
      return NextResponse.json({ error: conflictMessage(conflicts) }, { status: 409 });
    }

    let sortOrder = body.sort_order;
    if (sortOrder === undefined) {
      const { data: last } = await supabaseServer
        .from("tos")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      sortOrder = (last?.sort_order ?? 0) + 10;
    }

    const { data, error } = await supabaseServer
      .from("tos")
      .insert({ name, sort_order: sortOrder, is_active: body.is_active ?? true })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A TO with this name already exists." }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    try {
      await addTownsToTo(data.id, townIds);
    } catch (err: any) {
      // don't leave a TO behind without the towns that were asked for
      await supabaseServer.from("tos").delete().eq("id", data.id);
      return NextResponse.json({ error: err.message }, { status: 409 });
    }

    return NextResponse.json({ to: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
