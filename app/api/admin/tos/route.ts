// Destination: app/api/admin/tos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { addTownsToTo, cleanTownIds, conflictMessage, findTownConflicts } from "@/lib/tosServer";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// GET /api/admin/tos — all TOs (active + inactive) with their towns, in sort order.
// Three plain queries joined here (no embedded relationships).
export async function GET() {
  const [tosRes, linksRes, townsRes] = await Promise.all([
    supabaseServer.from("tos").select("*").order("sort_order", { ascending: true }),
    supabaseServer.from("to_towns").select("to_id, town_id"),
    supabaseServer.from("towns").select("id, name"),
  ]);

  const failed = tosRes.error || linksRes.error || townsRes.error;
  if (failed) {
    return NextResponse.json({ error: failed.message }, { status: 500 });
  }

  const townName = new Map((townsRes.data ?? []).map((t: any) => [t.id, t.name as string]));
  const townsByTo = new Map<string, { id: string; name: string }[]>();
  for (const l of linksRes.data ?? []) {
    const list = townsByTo.get(l.to_id) ?? [];
    list.push({ id: l.town_id, name: townName.get(l.town_id) ?? "" });
    townsByTo.set(l.to_id, list);
  }

  const tos = (tosRes.data ?? []).map((to: any) => ({
    ...to,
    towns: (townsByTo.get(to.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  }));

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