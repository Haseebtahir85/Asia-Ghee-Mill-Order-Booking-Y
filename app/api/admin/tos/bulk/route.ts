// Destination: app/api/admin/tos/bulk/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { addTownsToTo, cleanTownIds, removeTownsFromTo } from "@/lib/tosServer";

export const dynamic = "force-dynamic";

type Create = { name: string; town_ids: string[]; is_active?: boolean };
type Patch = { id: string; patch: { name?: string; is_active?: boolean; town_ids?: string[] } };

// POST /api/admin/tos/bulk — used by "Update Data via Excel" and "Delete selected".
// Body: { creates?: Create[], patches?: Patch[], deletes?: string[] }
// Order matters because a town can only belong to one TO:
//   1) deletes (frees their towns)
//   2) every TO that loses towns gives them up
//   3) name/status updates, then towns are added to the TO's that gain them
//   4) new TO's
// Each row is applied on its own, so one bad row never blocks the rest; the
// response lists the ones that failed.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const creates: Create[] = Array.isArray(body.creates) ? body.creates : [];
  const patches: Patch[] = Array.isArray(body.patches) ? body.patches : [];
  const deletes: string[] = Array.isArray(body.deletes) ? body.deletes.map(String) : [];

  const failures: { what: string; error: string }[] = [];
  let created = 0;
  let updated = 0;
  let deleted = 0;

  // 1) deletes
  if (deletes.length > 0) {
    const { error, count } = await supabaseServer.from("tos").delete({ count: "exact" }).in("id", deletes);
    if (error) failures.push({ what: "Delete", error: error.message });
    else deleted = count ?? deletes.length;
  }

  // 2) towns that are being given up
  const failedIds = new Set<string>();
  for (const { id, patch } of patches) {
    if (patch.town_ids === undefined) continue;
    try {
      await removeTownsFromTo(id, cleanTownIds(patch.town_ids));
    } catch (err: any) {
      failedIds.add(id);
      failures.push({ what: `Update ${id}`, error: err.message });
    }
  }

  // 3) name / status, then towns gained
  for (const { id, patch } of patches) {
    if (failedIds.has(id)) continue;
    const clean: Record<string, unknown> = {};
    if (patch.name !== undefined) clean.name = String(patch.name).trim();
    if (patch.is_active !== undefined) clean.is_active = !!patch.is_active;

    let ok = true;
    if (Object.keys(clean).length > 0) {
      const { error } = await supabaseServer.from("tos").update(clean).eq("id", id);
      if (error) {
        ok = false;
        failures.push({
          what: `Update ${clean.name ?? id}`,
          error: error.code === "23505" ? "a TO with this name already exists" : error.message,
        });
      }
    }
    if (ok && patch.town_ids !== undefined) {
      try {
        await addTownsToTo(id, cleanTownIds(patch.town_ids));
      } catch (err: any) {
        ok = false;
        failures.push({ what: `Update ${clean.name ?? id}`, error: err.message });
      }
    }
    if (ok) updated++;
  }

  // 4) new TO's
  if (creates.length > 0) {
    const { data: last } = await supabaseServer
      .from("tos")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    let sortOrder = (last?.sort_order ?? 0) + 10;

    for (const c of creates) {
      const name = String(c.name ?? "").trim();
      if (!name) continue;
      const { data, error } = await supabaseServer
        .from("tos")
        .insert({ name, is_active: c.is_active ?? true, sort_order: sortOrder })
        .select("id")
        .single();
      if (error || !data) {
        failures.push({
          what: `Add ${name}`,
          error: error?.code === "23505" ? "a TO with this name already exists" : error?.message ?? "failed",
        });
        continue;
      }
      try {
        await addTownsToTo(data.id, cleanTownIds(c.town_ids));
        created++;
        sortOrder += 10;
      } catch (err: any) {
        await supabaseServer.from("tos").delete().eq("id", data.id);
        failures.push({ what: `Add ${name}`, error: err.message });
      }
    }
  }

  return NextResponse.json({ created, updated, deleted, failures });
}
