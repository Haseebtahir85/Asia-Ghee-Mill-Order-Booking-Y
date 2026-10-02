// Destination: lib/tosExcel.ts
// Pure logic (no React, no network) for "Update Data via Excel" on the
// TO's Names admin page: turns the uploaded sheet's rows into a plan of
// what to add / update / delete, so the page can show it for confirmation.
//
// Sheet columns: ID | TO's Name | Towns | Status | Delete
//   - Towns holds one or more town names separated by commas.
//   - The same TO may also be spread over several rows (one town each).
//   - A town can belong to only ONE TO: if the sheet gives a town to two
//     TO's, or to a TO other than the one that already has it (and that TO
//     isn't giving it up in the same sheet), the extra claim is skipped.

export const TOS_EXCEL_HEADERS = ["ID", "TO's Name", "Towns", "Status", "Delete"] as const;

export interface PlanTo {
  id: string;
  name: string;
  is_active: boolean;
  town_ids: string[];
}
export interface PlanTown {
  id: string;
  name: string;
}

export interface TosImportPlan {
  creates: { name: string; town_ids: string[]; is_active: boolean; townsLabel: string }[];
  patches: {
    id: string;
    patch: { name?: string; is_active?: boolean; town_ids?: string[] };
    label: string;
    changes: string[];
  }[];
  deletes: { id: string; label: string }[];
  issues: string[]; // rows / towns that were skipped, with the reason
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

// "Multan, Lahore; Karachi" -> ["Multan", "Lahore", "Karachi"]
export function splitTownNames(raw: string): string[] {
  return raw
    .split(/[,;|\n\r،]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

interface Entry {
  key: string; // existing TO id, or "new:<lowername>"
  match?: PlanTo;
  name: string; // name as written in the sheet
  is_active?: boolean; // undefined = not stated
  townsGiven: boolean;
  towns: string[]; // town ids requested (ordered, unique)
  order: number;
}

export function planTosImport(rows: Record<string, any>[], tos: PlanTo[], towns: PlanTown[]): TosImportPlan {
  const plan: TosImportPlan = { creates: [], patches: [], deletes: [], issues: [] };

  const townByName = new Map(towns.map((t) => [lower(t.name), t]));
  const townNameById = new Map(towns.map((t) => [t.id, t.name]));
  const byId = new Map(tos.map((t) => [t.id, t]));
  const byName = new Map(tos.map((t) => [lower(t.name), t]));
  const names = (ids: string[]) => ids.map((id) => townNameById.get(id) ?? "—").join(", ");

  const entries = new Map<string, Entry>();
  const deleteIds = new Set<string>();

  rows.forEach((row, index) => {
    const rowNo = index + 2; // +1 header, +1 for 1-based
    const id = norm(pick(row, "ID", "id"));
    const name = norm(pick(row, "TO's Name", "TOs Name", "Name", "name"));
    const townsRaw = norm(pick(row, "Towns", "Town", "towns", "town"));
    const statusRaw = lower(pick(row, "Status", "status"));
    const wantsDelete = TRUE_WORDS.has(lower(pick(row, "Delete", "delete")));

    if (!id && !name && !townsRaw) return; // blank row

    const match = id ? byId.get(id) : name ? byName.get(name.toLowerCase()) : undefined;

    if (id && !match) {
      plan.issues.push(`Row ${rowNo}: ID not found${name ? ` (${name})` : ""} — skipped`);
      return;
    }

    if (wantsDelete) {
      if (!match) {
        plan.issues.push(`Row ${rowNo}: nothing to delete${name ? ` (${name})` : ""} — skipped`);
        return;
      }
      deleteIds.add(match.id);
      return;
    }

    if (!match && !name) {
      plan.issues.push(`Row ${rowNo}: TO's name is empty — skipped`);
      return;
    }

    const key = match ? match.id : `new:${name.toLowerCase()}`;
    let entry = entries.get(key);
    if (!entry) {
      entry = { key, match, name: name || match!.name, townsGiven: false, towns: [], order: entries.size };
      entries.set(key, entry);
    }
    if (name && match && id) entry.name = name; // renames only via ID
    if (statusRaw === "active") entry.is_active = true;
    else if (statusRaw === "inactive") entry.is_active = false;

    if (townsRaw) {
      entry.townsGiven = true;
      for (const tn of splitTownNames(townsRaw)) {
        const t = townByName.get(tn.toLowerCase());
        if (!t) {
          plan.issues.push(`Row ${rowNo}: town "${tn}" not found${entry.name ? ` (${entry.name})` : ""} — skipped`);
          continue;
        }
        if (!entry.towns.includes(t.id)) entry.towns.push(t.id);
      }
    }
  });

  // A TO marked Delete anywhere is deleted — never also updated.
  for (const id of Array.from(deleteIds)) entries.delete(id);
  for (const id of Array.from(deleteIds)) {
    const t = byId.get(id)!;
    plan.deletes.push({ id, label: `${t.name} — ${t.town_ids.length ? names(t.town_ids) : "no towns"}` });
  }

  // ---- who ends up with each town (a town can only have one TO) ----
  const owner = new Map<string, string>(); // town id -> entry key / TO id
  const ownerName = new Map<string, string>(); // entry key / TO id -> display name

  // TO's the sheet doesn't touch (or touches without a Towns cell) keep their towns.
  const sheetKeys = new Set(entries.keys());
  for (const t of tos) {
    if (deleteIds.has(t.id)) continue;
    const entry = entries.get(t.id);
    ownerName.set(t.id, t.name);
    if (!entry || !entry.townsGiven) {
      for (const tid of t.town_ids) owner.set(tid, t.id);
    }
  }
  void sheetKeys;

  const sorted = Array.from(entries.values()).sort((a, b) => a.order - b.order);
  const finalTowns = new Map<string, string[]>();
  for (const e of sorted) {
    ownerName.set(e.key, e.name);
    if (e.match && !e.townsGiven) {
      finalTowns.set(e.key, e.match.town_ids.slice());
      continue;
    }
    const kept: string[] = [];
    for (const tid of e.towns) {
      const current = owner.get(tid);
      if (current && current !== e.key) {
        plan.issues.push(
          `Town "${townNameById.get(tid)}" is already assigned to ${ownerName.get(current) ?? "another TO"} — skipped for ${e.name}`
        );
        continue;
      }
      owner.set(tid, e.key);
      kept.push(tid);
    }
    finalTowns.set(e.key, kept);
  }

  // ---- turn entries into creates / patches ----
  for (const e of sorted) {
    const finalIds = finalTowns.get(e.key) ?? [];

    if (!e.match) {
      if (finalIds.length === 0) {
        plan.issues.push(`${e.name}: no valid town given — not added`);
        continue;
      }
      plan.creates.push({ name: e.name, town_ids: finalIds, is_active: e.is_active !== false, townsLabel: names(finalIds) });
      continue;
    }

    const m = e.match;
    const patch: { name?: string; is_active?: boolean; town_ids?: string[] } = {};
    const changes: string[] = [];

    if (e.name !== m.name) {
      patch.name = e.name;
      changes.push(`Name: ${m.name} → ${e.name}`);
    }
    if (e.is_active !== undefined && e.is_active !== m.is_active) {
      patch.is_active = e.is_active;
      changes.push(e.is_active ? "Status: Inactive → Active" : "Status: Active → Inactive");
    }
    if (e.townsGiven) {
      const before = new Set(m.town_ids);
      const after = new Set(finalIds);
      const added = finalIds.filter((id) => !before.has(id));
      const removed = m.town_ids.filter((id) => !after.has(id));
      if (added.length > 0 || removed.length > 0) {
        patch.town_ids = finalIds;
        const parts: string[] = [];
        if (added.length) parts.push(`add ${names(added)}`);
        if (removed.length) parts.push(`remove ${names(removed)}`);
        changes.push(`Towns: ${parts.join("; ")}`);
      }
    }
    if (changes.length > 0) plan.patches.push({ id: m.id, patch, label: m.name, changes });
  }

  return plan;
}
