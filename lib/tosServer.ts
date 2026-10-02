// Destination: lib/tosServer.ts
// Server-only helpers for the TO <-> towns assignments (to_towns table).
import { supabaseServer } from "@/lib/supabase";

export interface TownConflict {
  town_id: string;
  town_name: string;
  to_id: string;
  to_name: string;
}

// Which of these towns already belong to a TO (other than `excludeToId`)?
export async function findTownConflicts(townIds: string[], excludeToId?: string): Promise<TownConflict[]> {
  if (townIds.length === 0) return [];
  let query = supabaseServer.from("to_towns").select("town_id, to_id, tos(name), towns(name)").in("town_id", townIds);
  if (excludeToId) query = query.neq("to_id", excludeToId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    town_id: r.town_id,
    to_id: r.to_id,
    town_name: r.towns?.name ?? "A town",
    to_name: r.tos?.name ?? "another TO",
  }));
}

export function conflictMessage(conflicts: TownConflict[]): string {
  return conflicts.map((c) => `${c.town_name} is already assigned to ${c.to_name}`).join("; ") + ".";
}

export function cleanTownIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return Array.from(new Set(input.map((v) => String(v)).filter((v) => uuid.test(v))));
}

// Replace a TO's towns with exactly `townIds`. Caller must have checked conflicts.
// Removals happen before additions (a bulk import can move a town between TO's).
export async function removeTownsFromTo(toId: string, keepTownIds: string[]) {
  let del = supabaseServer.from("to_towns").delete().eq("to_id", toId);
  if (keepTownIds.length > 0) del = del.not("town_id", "in", `(${keepTownIds.join(",")})`);
  const { error } = await del;
  if (error) throw new Error(error.message);
}

export async function addTownsToTo(toId: string, townIds: string[]) {
  if (townIds.length === 0) return;
  const { error } = await supabaseServer
    .from("to_towns")
    .upsert(
      townIds.map((town_id) => ({ to_id: toId, town_id })),
      { onConflict: "to_id,town_id", ignoreDuplicates: true }
    );
  if (error) {
    if (error.code === "23505") throw new Error("One of those towns is already assigned to another TO.");
    throw new Error(error.message);
  }
}
