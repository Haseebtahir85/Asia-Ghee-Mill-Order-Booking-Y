// Destination: app/api/admin/tos/bulk/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Create = { name: string; town_id: string | null; is_active?: boolean };
type Patch = { id: string; patch: { name?: string; town_id?: string | null; is_active?: boolean } };

// POST /api/admin/tos/bulk — used by "Update Data via Excel" and by
// "Delete selected". Body: { creates?: Create[], patches?: Patch[], deletes?: string[] }
// Every row is applied on its own, so one bad row never blocks the rest;
// the response says how many worked and lists the ones that didn't.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const creates: Create[] = Array.isArray(body.creates) ? body.creates : [];
  const patches: Patch[] = Array.isArray(body.patches) ? body.patches : [];
  const deletes: string[] = Array.isArray(body.deletes) ? body.deletes.map(String) : [];

  const failures: { what: string; error: string }[] = [];
  let created = 0;
  let updated = 0;
  let deleted = 0;

  // ---- deletes (one query) ----
  if (deletes.length > 0) {
    const { error, count } = await supabaseServer.from("tos").delete({ count: "exact" }).in("id", deletes);
    if (error) failures.push({ what: "Delete", error: error.message });
    else deleted = count ?? deletes.length;
  }

  // ---- updates ----
  for (const { id, patch } of patches) {
    const clean: Record<string, unknown> = {};
    if (patch.name !== undefined) clean.name = String(patch.name).trim();
    if (patch.town_id !== undefined) clean.town_id = patch.town_id || null;
    if (patch.is_active !== undefined) clean.is_active = !!patch.is_active;
    if (Object.keys(clean).length === 0) continue;

    const { error } = await supabaseServer.from("tos").update(clean).eq("id", id);
    if (error) {
      failures.push({
        what: `Update ${clean.name ?? id}`,
        error: error.code === "23505" ? "already added for that town" : error.message,
      });
    } else {
      updated++;
    }
  }

  // ---- creates ----
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
      const { error } = await supabaseServer.from("tos").insert({
        name,
        town_id: c.town_id || null,
        is_active: c.is_active ?? true,
        sort_order: sortOrder,
      });
      if (error) {
        failures.push({
          what: `Add ${name}`,
          error: error.code === "23505" ? "already added for that town" : error.message,
        });
      } else {
        created++;
        sortOrder += 10;
      }
    }
  }

  return NextResponse.json({ created, updated, deleted, failures });
}
