// Destination: lib/tosExcel.ts
// Pure logic (no React, no network) for "Update Data via Excel" on the
// TO's Names admin page: turns the uploaded sheet's rows into a plan of
// what to add / update / delete, so the page can show it for confirmation.

export const TOS_EXCEL_HEADERS = ["ID", "TO's Name", "Town", "Status", "Delete"] as const;

export interface PlanTo {
  id: string;
  name: string;
  town_id: string | null;
  is_active: boolean;
}
export interface PlanTown {
  id: string;
  name: string;
}

export interface TosImportPlan {
  creates: { name: string; town_id: string | null; is_active: boolean; townLabel: string }[];
  patches: { id: string; patch: { name?: string; town_id?: string | null; is_active?: boolean }; label: string; changes: string[] }[];
  deletes: { id: string; label: string }[];
  issues: string[]; // rows that were skipped, with the reason
}

const norm = (v: unknown) => String(v ?? "").trim();
const lower = (v: unknown) => norm(v).toLowerCase();

function pick(row: Record<string, any>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined) return row[k];
  }
  // tolerate header differences in case / apostrophes (TO's / TO’s / TOs)
  const wanted = keys.map((k) => k.toLowerCase().replace(/['’`\s]/g, ""));
  for (const actual of Object.keys(row)) {
    if (wanted.includes(actual.toLowerCase().replace(/['’`\s]/g, ""))) return row[actual];
  }
  return undefined;
}

const TRUE_WORDS = new Set(["yes", "y", "1", "true", "delete", "x"]);

export function planTosImport(rows: Record<string, any>[], tos: PlanTo[], towns: PlanTown[]): TosImportPlan {
  const plan: TosImportPlan = { creates: [], patches: [], deletes: [], issues: [] };

  const townByName = new Map(towns.map((t) => [lower(t.name), t]));
  const townNameById = new Map(towns.map((t) => [t.id, t.name]));
  const byId = new Map(tos.map((t) => [t.id, t]));
  const keyOf = (name: string, townId: string | null) => `${lower(name)}|${townId ?? ""}`;
  const byKey = new Map(tos.map((t) => [keyOf(t.name, t.town_id), t]));

  const seenCreate = new Set<string>();
  const seenUpdated = new Set<string>(); // an existing TO already handled by an earlier update row
  const deleteIds = new Set<string>();

  rows.forEach((row, index) => {
    const rowNo = index + 2; // +1 header, +1 for 1-based
    const id = norm(pick(row, "ID", "id"));
    const name = norm(pick(row, "TO's Name", "TOs Name", "Name", "name"));
    const townRaw = norm(pick(row, "Town", "town"));
    const statusRaw = lower(pick(row, "Status", "status"));
    const deleteRaw = lower(pick(row, "Delete", "delete"));
    const wantsDelete = TRUE_WORDS.has(deleteRaw);

    if (!id && !name && !townRaw) return; // blank row

    // Town: blank = "all towns"; otherwise it must exist.
    let townId: string | null = null;
    if (townRaw) {
      const t = townByName.get(townRaw.toLowerCase());
      if (!t) {
        plan.issues.push(`Row ${rowNo}: town "${townRaw}" not found${name ? ` (${name})` : ""} — skipped`);
        return;
      }
      townId = t.id;
    }

    const match = id ? byId.get(id) : name ? byKey.get(keyOf(name, townId)) : undefined;
    const townLabel = townId ? townNameById.get(townId) ?? "" : "All towns";

    if (id && !match) {
      plan.issues.push(`Row ${rowNo}: ID not found${name ? ` (${name})` : ""} — skipped`);
      return;
    }

    if (wantsDelete) {
      if (!match) {
        plan.issues.push(`Row ${rowNo}: nothing to delete${name ? ` (${name})` : ""} — skipped`);
        return;
      }
      if (!deleteIds.has(match.id)) {
        deleteIds.add(match.id);
        plan.deletes.push({ id: match.id, label: `${match.name} — ${match.town_id ? townNameById.get(match.town_id) ?? "—" : "All towns"}` });
      }
      return;
    }

    // ---- add ----
    if (!match) {
      if (!name) {
        plan.issues.push(`Row ${rowNo}: TO's name is empty — skipped`);
        return;
      }
      const k = keyOf(name, townId);
      if (seenCreate.has(k)) return; // same TO twice in the file
      seenCreate.add(k);
      plan.creates.push({ name, town_id: townId, is_active: statusRaw !== "inactive", townLabel });
      return;
    }

    // ---- update ----
    if (seenUpdated.has(match.id)) return;
    seenUpdated.add(match.id);

    const patch: { name?: string; town_id?: string | null; is_active?: boolean } = {};
    const changes: string[] = [];
    if (name && name !== match.name) {
      patch.name = name;
      changes.push(`Name: ${match.name} → ${name}`);
    }
    // Town only changes when the sheet is matched by ID (otherwise the town
    // was part of how the row was found).
    if (id && townId !== match.town_id) {
      patch.town_id = townId;
      const from = match.town_id ? townNameById.get(match.town_id) ?? "—" : "All towns";
      changes.push(`Town: ${from} → ${townLabel}`);
    }
    if (statusRaw === "active" && !match.is_active) {
      patch.is_active = true;
      changes.push("Status: Inactive → Active");
    } else if (statusRaw === "inactive" && match.is_active) {
      patch.is_active = false;
      changes.push("Status: Active → Inactive");
    }
    if (changes.length > 0) {
      plan.patches.push({ id: match.id, patch, label: `${match.name} — ${match.town_id ? townNameById.get(match.town_id) ?? "—" : "All towns"}`, changes });
    }
  });

  // A TO marked Delete anywhere in the sheet is deleted — never also updated.
  plan.patches = plan.patches.filter((p) => !deleteIds.has(p.id));

  return plan;
}
