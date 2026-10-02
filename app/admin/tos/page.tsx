// Destination: app/admin/tos/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Town, TOWithTowns } from "@/lib/types";
import { TOS_EXCEL_HEADERS, TosImportPlan, planTosImport } from "@/lib/tosExcel";

const NAVY = "#0b2b5b";
const YELLOW = "#F6C90E";
const RED = "#D62828";

type TownPatch = { name?: string; is_active?: boolean; town_ids?: string[] };

export default function AdminTosPage() {
  const [tos, setTos] = useState<TOWithTowns[]>([]);
  const [towns, setTowns] = useState<Town[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excelStatus, setExcelStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<TosImportPlan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // add form
  const [newName, setNewName] = useState("");
  const [newTownIds, setNewTownIds] = useState<string[]>([]);

  // which picker is open: the add form ("new") or a TO's id
  const [picker, setPicker] = useState<"new" | string | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [tosRes, townsRes] = await Promise.all([
        fetch("/api/admin/tos", { cache: "no-store" }),
        fetch("/api/admin/towns", { cache: "no-store" }),
      ]);
      const tosJson = await tosRes.json();
      const townsJson = await townsRes.json();
      if (!tosRes.ok) throw new Error(tosJson.error || "Failed to load TO's");
      if (!townsRes.ok) throw new Error(townsJson.error || "Failed to load towns");
      setTos(tosJson.tos ?? []);
      setTowns(townsJson.towns ?? []);
      setSelected((prev) => {
        const ids = new Set<string>((tosJson.tos ?? []).map((t: TOWithTowns) => t.id));
        return new Set(Array.from(prev).filter((id) => ids.has(id)));
      });
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  // town id -> the TO that already has it (a town can only have one TO)
  const takenBy = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tos) for (const town of t.towns) map.set(town.id, t.id);
    return map;
  }, [tos]);

  // Towns a picker may offer: free ones, plus the ones this TO already has.
  function optionsFor(toId: string | "new"): Town[] {
    return towns.filter((t) => !takenBy.has(t.id) || (toId !== "new" && takenBy.get(t.id) === toId));
  }

  async function addTo(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExcelStatus(null);

    if (!newName.trim()) {
      setError("TO's name is required.");
      return;
    }
    if (newTownIds.length === 0) {
      setError("Select at least one town for this TO.");
      return;
    }

    const res = await fetch("/api/admin/tos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, town_ids: newTownIds }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to add TO");
      return;
    }

    setNewName("");
    setNewTownIds([]);
    loadAll();
  }

  async function updateTo(id: string, patch: TownPatch) {
    setError(null);
    const res = await fetch(`/api/admin/tos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to update TO");
    }
    loadAll();
  }

  async function deleteTo(id: string) {
    if (!confirm("Remove this TO? Its towns become free. Reports already filed keep the TO's name regardless.")) return;
    await fetch(`/api/admin/tos/${id}`, { method: "DELETE" });
    loadAll();
  }

  async function deleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Remove ${ids.length} selected TO${ids.length === 1 ? "" : "'s"}? Their towns become free. Reports already filed keep the TO's name regardless.`)) return;
    setError(null);
    const res = await fetch("/api/admin/tos/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deletes: ids }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || (json.failures && json.failures.length > 0)) {
      setError(json.error ?? json.failures?.map((f: any) => `${f.what}: ${f.error}`).join(" · ") ?? "Failed to delete");
    }
    setSelected(new Set());
    loadAll();
  }

  async function move(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= tos.length) return;
    const reordered = [...tos];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setTos(reordered);
    await fetch("/api/admin/tos/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: reordered.map((t) => t.id) }),
    });
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = tos.length > 0 && selected.size === tos.length;
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(tos.map((t) => t.id)));
  }

  // ---------------------------------------------------------------- Excel

  // Current TO's as an .xlsx. Towns is one cell with the TO's towns separated
  // by commas. Edit it, add rows (leave ID blank), put "Yes" in Delete to
  // remove a row, then upload it with "Update Data via Excel". A second sheet
  // lists every valid town name.
  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const rows = tos.map((t) => ({
      ID: t.id,
      "TO's Name": t.name,
      Towns: t.towns.map((x) => x.name).join(", "),
      Status: t.is_active ? "Active" : "Inactive",
      Delete: "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows, { header: [...TOS_EXCEL_HEADERS] });
    sheet["!cols"] = [{ wch: 38 }, { wch: 26 }, { wch: 60 }, { wch: 10 }, { wch: 8 }];
    const townSheet = XLSX.utils.json_to_sheet(
      towns.map((t) => ({ "Town List": t.name })),
      { header: ["Town List"] }
    );
    townSheet["!cols"] = [{ wch: 30 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "TOs");
    XLSX.utils.book_append_sheet(workbook, townSheet, "Towns");
    XLSX.writeFile(workbook, "tos-template.xlsx");
  }

  function triggerExcelUpload() {
    fileInputRef.current?.click();
  }

  async function handleExcelFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setImporting(true);
    setExcelStatus(null);
    setError(null);

    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const plan = planTosImport(
        rows,
        tos.map((t) => ({ id: t.id, name: t.name, is_active: t.is_active, town_ids: t.towns.map((x) => x.id) })),
        towns.map((t) => ({ id: t.id, name: t.name }))
      );

      if (plan.creates.length + plan.patches.length + plan.deletes.length === 0) {
        setExcelStatus(plan.issues.length > 0 ? `Nothing to apply. ${plan.issues.join(" · ")}` : "No changes found in the file.");
        return;
      }
      setPendingImport(plan);
    } catch (err: any) {
      setError(err.message || "Failed to read the Excel file.");
    } finally {
      setImporting(false);
    }
  }

  async function confirmImport() {
    if (!pendingImport) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tos/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creates: pendingImport.creates.map((c) => ({ name: c.name, town_ids: c.town_ids, is_active: c.is_active })),
          patches: pendingImport.patches.map((p) => ({ id: p.id, patch: p.patch })),
          deletes: pendingImport.deletes.map((d) => d.id),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to apply changes");

      let msg = `Added ${json.created}, updated ${json.updated}, deleted ${json.deleted}.`;
      if (pendingImport.issues.length > 0) msg += ` Skipped: ${pendingImport.issues.join(" · ")}`;
      if (json.failures?.length > 0) msg += ` Failed: ${json.failures.map((f: any) => `${f.what} (${f.error})`).join(" · ")}`;
      setExcelStatus(msg);
      setPendingImport(null);
      setSelected(new Set());
      loadAll();
    } catch (err: any) {
      setError(err.message || "Failed to apply changes");
    } finally {
      setImporting(false);
    }
  }

  const pickerTo = picker && picker !== "new" ? tos.find((t) => t.id === picker) ?? null : null;
  const newTownNames = towns.filter((t) => newTownIds.includes(t.id)).map((t) => t.name);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fffdf5", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 6, height: 24, background: YELLOW, borderRadius: 3 }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: NAVY, margin: 0 }}>TO&apos;s Names</h1>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={downloadTemplate}
            disabled={loading}
            style={{ ...secondaryButtonStyle, opacity: loading ? 0.6 : 1, cursor: loading ? "default" : "pointer" }}
          >
            Download Excel Template
          </button>
          <button type="button" onClick={triggerExcelUpload} disabled={importing || loading} style={{ ...buttonStyle, opacity: importing || loading ? 0.7 : 1 }}>
            {importing ? "Updating..." : "Update Data via Excel"}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelFile} style={{ display: "none" }} />
        </div>
      </div>

      {excelStatus && (
        <div style={{ color: NAVY, background: "#eef3fb", border: "1px solid #cddaf0", borderRadius: 6, padding: "6px 10px", marginBottom: 12, fontSize: 13 }}>
          {excelStatus}
        </div>
      )}

      <form
        onSubmit={addTo}
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 2fr auto",
          gap: 10,
          marginBottom: 24,
          background: "#fff",
          border: `1px solid ${YELLOW}`,
          borderRadius: 10,
          padding: 14,
          boxShadow: "0 2px 8px rgba(11,43,91,0.06)",
        }}
      >
        <input placeholder="TO's name" value={newName} onChange={(e) => setNewName(e.target.value)} style={inputStyle} />
        <button
          type="button"
          onClick={() => setPicker("new")}
          title={newTownNames.join(", ")}
          style={{ ...inputStyle, textAlign: "left", cursor: "pointer", color: newTownIds.length ? "#111" : "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {newTownIds.length === 0 ? "Select towns…" : newTownNames.join(", ")}
        </button>
        <button type="submit" style={buttonStyle}>
          Add
        </button>
      </form>

      {error && (
        <div style={{ color: RED, background: "#fdecec", border: "1px solid #f6c9c9", borderRadius: 6, padding: "6px 10px", marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {selected.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, fontSize: 13, color: NAVY }}>
          <strong>{selected.size}</strong> selected
          <button type="button" onClick={deleteSelected} style={{ ...secondaryButtonStyle, color: RED, borderColor: "#f0b8b8", padding: "5px 12px" }}>
            Delete selected
          </button>
          <button type="button" onClick={() => setSelected(new Set())} style={{ ...secondaryButtonStyle, padding: "5px 12px" }}>
            Clear
          </button>
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : tos.length === 0 ? null : (
        <div style={{ overflowX: "auto", border: `1px solid ${YELLOW}`, borderRadius: 10, background: "#fff" }}>
          <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse" }}>
            <colgroup>
              <col style={{ width: 34 }} />
              <col style={{ width: 46 }} />
              <col style={{ width: 40 }} />
              <col style={{ minWidth: 150 }} />
              <col style={{ minWidth: 240 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 70 }} />
            </colgroup>
            <thead>
              <tr style={{ textAlign: "left", background: NAVY }}>
                <th style={thStyle}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                </th>
                <th style={thStyle}></th>
                <th style={thStyle}>Sr#</th>
                <th style={thStyle}>TO&apos;s Name</th>
                <th style={thStyle}>Towns</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {tos.map((to, index) => (
                <tr key={to.id} style={{ borderBottom: "1px solid #f3e6b0", background: selected.has(to.id) ? "#fff9e0" : undefined }}>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <input type="checkbox" checked={selected.has(to.id)} onChange={() => toggleSelected(to.id)} aria-label={`Select ${to.name}`} />
                  </td>
                  <td style={tdStyle}>
                    <button onClick={() => move(index, -1)} style={moveButtonStyle} title="Move up">↑</button>
                    <button onClick={() => move(index, 1)} style={moveButtonStyle} title="Move down">↓</button>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center", color: "#888" }}>{index + 1}</td>
                  <td style={tdStyle}>
                    <input
                      defaultValue={to.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== to.name) updateTo(to.id, { name: v });
                        else e.target.value = to.name;
                      }}
                      style={{ width: "100%", minWidth: 150, border: "1px solid transparent", padding: 4, boxSizing: "border-box", borderRadius: 4 }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = YELLOW)}
                      onBlurCapture={(e) => (e.currentTarget.style.borderColor = "transparent")}
                    />
                  </td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => setPicker(to.id)}
                      title={to.towns.map((x) => x.name).join(", ")}
                      style={{ ...inputStyle, textAlign: "left", cursor: "pointer", padding: "5px 8px", color: to.towns.length ? "#111" : "#b00", display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                        {to.towns.length === 0 ? "No towns" : to.towns.map((x) => x.name).join(", ")}
                      </span>
                      {to.towns.length > 0 && (
                        <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: NAVY, background: "#eef3fb", borderRadius: 10, padding: "1px 8px" }}>
                          {to.towns.length}
                        </span>
                      )}
                    </button>
                  </td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => updateTo(to.id, { is_active: !to.is_active })}
                      style={{
                        padding: "4px 10px",
                        fontSize: 12,
                        fontWeight: 600,
                        border: "none",
                        borderRadius: 12,
                        cursor: "pointer",
                        color: to.is_active ? "#1b8a3d" : "#888",
                        background: to.is_active ? "#e6f4ea" : "#eee",
                      }}
                    >
                      {to.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td style={tdStyle}>
                    <button onClick={() => deleteTo(to.id)} style={{ ...moveButtonStyle, color: RED, borderColor: "#f0b8b8" }}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {picker === "new" && (
        <TownPickerModal
          title="Select towns"
          options={optionsFor("new")}
          initial={newTownIds}
          onCancel={() => setPicker(null)}
          onSave={(ids) => {
            setNewTownIds(ids);
            setPicker(null);
          }}
        />
      )}
      {pickerTo && (
        <TownPickerModal
          title={`Towns — ${pickerTo.name}`}
          options={optionsFor(pickerTo.id)}
          initial={pickerTo.towns.map((x) => x.id)}
          onCancel={() => setPicker(null)}
          onSave={(ids) => {
            const before = pickerTo.towns.map((x) => x.id).sort().join(",");
            const after = [...ids].sort().join(",");
            setPicker(null);
            if (before !== after) updateTo(pickerTo.id, { town_ids: ids });
          }}
        />
      )}

      {pendingImport && (
        <div style={modalOverlayStyle} onClick={() => !importing && setPendingImport(null)}>
          <div style={modalBoxStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 17, margin: "0 0 12px", color: NAVY }}>Confirm changes</h2>

            <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid #eee", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              {pendingImport.creates.length > 0 && (
                <PlanSection title={`Add (${pendingImport.creates.length})`} color="#1b8a3d" bg="#e6f4ea">
                  {pendingImport.creates.map((c, i) => (
                    <li key={i}>
                      <strong>{c.name}</strong> — {c.townsLabel}
                      {!c.is_active && " (Inactive)"}
                    </li>
                  ))}
                </PlanSection>
              )}
              {pendingImport.patches.length > 0 && (
                <PlanSection title={`Update (${pendingImport.patches.length})`} color={NAVY} bg="#eef3fb">
                  {pendingImport.patches.map((p) => (
                    <li key={p.id}>
                      <strong>{p.label}</strong>: {p.changes.join(", ")}
                    </li>
                  ))}
                </PlanSection>
              )}
              {pendingImport.deletes.length > 0 && (
                <PlanSection title={`Delete (${pendingImport.deletes.length})`} color={RED} bg="#fdecec">
                  {pendingImport.deletes.map((d) => (
                    <li key={d.id}>{d.label}</li>
                  ))}
                </PlanSection>
              )}
              {pendingImport.issues.length > 0 && (
                <PlanSection title={`Skipped (${pendingImport.issues.length})`} color="#8a4b00" bg="#fff4e0">
                  {pendingImport.issues.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </PlanSection>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setPendingImport(null)} disabled={importing} style={secondaryButtonStyle}>
                Cancel
              </button>
              <button type="button" onClick={confirmImport} disabled={importing} style={buttonStyle}>
                {importing ? "Applying..." : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// Pick any number of towns. Only the towns passed in `options` are offered —
// the page leaves out towns that already belong to another TO, so a town can
// never be used twice.
function TownPickerModal({
  title,
  options,
  initial,
  onSave,
  onCancel,
}: {
  title: string;
  options: Town[];
  initial: string[];
  onSave: (ids: string[]) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(new Set(initial));
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((t) => t.name.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const allShownSelected = shown.length > 0 && shown.every((t) => draft.has(t.id));

  function toggle(id: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleShown() {
    setDraft((prev) => {
      const next = new Set(prev);
      if (allShownSelected) shown.forEach((t) => next.delete(t.id));
      else shown.forEach((t) => next.add(t.id));
      return next;
    });
  }

  return (
    <div style={modalOverlayStyle} onClick={onCancel}>
      <div style={{ ...modalBoxStyle, maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 17, margin: "0 0 10px", color: NAVY }}>{title}</h2>

        <input
          autoFocus
          placeholder="Search towns"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...inputStyle, marginBottom: 8 }}
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "#666", margin: "0 0 6px" }}>
          <span>
            <strong style={{ color: NAVY }}>{draft.size}</strong> selected
          </span>
          <span style={{ display: "flex", gap: 12 }}>
            <button type="button" onClick={toggleShown} style={linkButtonStyle} disabled={shown.length === 0}>
              {allShownSelected ? "Unselect shown" : "Select shown"}
            </button>
            <button type="button" onClick={() => setDraft(new Set())} style={linkButtonStyle}>
              Clear
            </button>
          </span>
        </div>

        <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #eee", borderRadius: 8, marginBottom: 14 }}>
          {shown.length === 0 ? (
            <div style={{ padding: 12, fontSize: 13, color: "#888" }}>—</div>
          ) : (
            shown.map((t) => (
              <label
                key={t.id}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #f4f4f4", background: draft.has(t.id) ? "#fff9e0" : undefined }}
              >
                <input type="checkbox" checked={draft.has(t.id)} onChange={() => toggle(t.id)} />
                {t.name}
              </label>
            ))
          )}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={secondaryButtonStyle}>
            Cancel
          </button>
          <button type="button" onClick={() => onSave(options.filter((t) => draft.has(t.id)).map((t) => t.id))} style={buttonStyle}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanSection({ title, color, bg, children }: { title: string; color: string; bg: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: "1px solid #eee" }}>
      <div style={{ background: bg, color, fontWeight: 700, padding: "6px 10px" }}>{title}</div>
      <ul style={{ margin: 0, padding: "6px 10px 8px 26px", color: "#333", lineHeight: 1.7 }}>{children}</ul>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  minWidth: 0,
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  border: "1px solid #d9dde6",
  borderRadius: 6,
  fontSize: 13,
  background: "#fff",
};

const buttonStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: NAVY,
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#fff",
  color: NAVY,
  border: `1px solid ${NAVY}`,
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

const linkButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: NAVY,
  textDecoration: "underline",
  cursor: "pointer",
  fontSize: 12,
  padding: 0,
};

const moveButtonStyle: React.CSSProperties = {
  border: `1px solid ${YELLOW}`,
  background: "#fff",
  color: NAVY,
  borderRadius: 4,
  padding: "2px 8px",
  cursor: "pointer",
  marginRight: 4,
  fontWeight: 600,
};

const thStyle: React.CSSProperties = { padding: "9px 6px", fontSize: 13, color: "#fff", fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: "6px 6px", fontSize: 13 };

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2000,
  padding: 16,
};

const modalBoxStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 22,
  width: "100%",
  maxWidth: 560,
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};
