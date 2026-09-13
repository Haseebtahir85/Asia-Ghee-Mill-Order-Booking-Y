"use client";

import { useEffect, useRef, useState } from "react";
import { Town } from "@/lib/types";

const NAVY = "#0b2b5b";
const YELLOW = "#F6C90E";
const RED = "#D62828";

// NOTE: `discount` isn't on the Town type/table yet in what you shared —
// this assumes a nullable numeric `discount` column exists (or will be
// added) on the towns table, and that /api/admin/towns (POST) and
// /api/admin/towns/[id] (PATCH) accept a `discount` field. If the column
// name or type differs, tell me and I'll adjust the field name below.
type TownWithDiscount = Town & { discount: number | null };

const emptyForm = { name: "", group_no: "", upc: "", discount: "" };

// Excel column headers, in the exact order they're written and read back.
// ID is included so renamed rows still match back to the right town —
// matching by name text alone can't survive a rename.
const EXCEL_HEADERS = ["ID", "Name", "Group No", "Code", "Discount", "Status"] as const;

type PendingChange = {
  townId: string;
  townLabel: string;
  field: "Name" | "Group No" | "Code";
  oldValue: string;
  newValue: string;
};

type PendingImport = {
  patches: { id: string; patch: Partial<TownWithDiscount> }[];
  changes: PendingChange[];
  skipped: number;
};

export default function AdminTownsPage() {
  const [towns, setTowns] = useState<TownWithDiscount[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [excelStatus, setExcelStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadTowns() {
    setLoading(true);
    const res = await fetch("/api/admin/towns");
    const json = await res.json();
    setTowns(json.towns ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadTowns();
  }, []);

  async function addTown(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("Town name is required.");
      return;
    }

    const res = await fetch("/api/admin/towns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        group_no: form.group_no ? parseInt(form.group_no, 10) : null,
        upc: form.upc || null,
        discount: form.discount ? parseFloat(form.discount) : null,
      }),
    });

    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Failed to add town");
      return;
    }

    setForm(emptyForm);
    loadTowns();
  }

  async function updateTown(id: string, patch: Partial<TownWithDiscount>) {
    await fetch(`/api/admin/towns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    loadTowns();
  }

  async function deleteTown(id: string) {
    if (!confirm("Remove this town? Past orders keep their town name regardless.")) return;
    await fetch(`/api/admin/towns/${id}`, { method: "DELETE" });
    loadTowns();
  }

  async function move(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= towns.length) return;
    const reordered = [...towns];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setTowns(reordered);
    await fetch("/api/admin/towns/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: reordered.map((t) => t.id) }),
    });
  }

  // Builds an .xlsx of the current towns list so the admin can edit values
  // in Excel and re-upload it. The ID column is included so a renamed row
  // still matches back to the right town — don't delete/edit that column.
  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const rows = towns.map((t) => ({
      ID: t.id,
      Name: t.name,
      "Group No": t.group_no ?? "",
      Code: t.upc ?? "",
      Discount: t.discount ?? "",
      Status: t.is_active ? "Active" : "Inactive",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows, { header: [...EXCEL_HEADERS] });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Towns");
    XLSX.writeFile(workbook, "towns-template.xlsx");
  }

  function triggerExcelUpload() {
    fileInputRef.current?.click();
  }

  async function applyPatches(patches: { id: string; patch: Partial<TownWithDiscount> }[]) {
    for (const { id, patch } of patches) {
      await fetch(`/api/admin/towns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    }
  }

  // Reads the uploaded workbook, matches each row to an existing town by
  // ID (falling back to name, case-insensitive, if ID is missing), and
  // compares Name / Group No / Code against the current values.
  //
  // - If none of those three changed anywhere in the file: Discount (and
  //   Status) changes apply immediately — no confirmation needed.
  // - If any of Name / Group No / Code changed for any row: nothing is
  //   applied yet. A confirmation popup lists every affected Name/Group
  //   No/Code change (Discount changes are never listed there, even
  //   though they ride along in the same batch). Cancel applies nothing
  //   at all — including any Discount-only changes in the same upload.
  //   Overwrite applies everything at once.
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
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet);

      const byId = new Map(towns.map((t) => [t.id, t]));
      const byLowerName = new Map(towns.map((t) => [t.name.trim().toLowerCase(), t]));

      const patches: { id: string; patch: Partial<TownWithDiscount> }[] = [];
      const changes: PendingChange[] = [];
      let skipped = 0;

      for (const row of rows) {
        const rowId = String(row["ID"] ?? row["id"] ?? "").trim();
        const rawName = String(row["Name"] ?? row["name"] ?? "").trim();

        let match = rowId ? byId.get(rowId) : undefined;
        if (!match && rawName) match = byLowerName.get(rawName.toLowerCase());
        if (!match) {
          skipped++;
          continue;
        }

        const patch: Partial<TownWithDiscount> = {};

        // Name
        if (rawName && rawName !== match.name.trim()) {
          patch.name = rawName;
          changes.push({ townId: match.id, townLabel: match.name, field: "Name", oldValue: match.name, newValue: rawName });
        }

        // Group No
        const groupNoRaw = row["Group No"] ?? row["group_no"];
        if (groupNoRaw !== undefined) {
          const newGroupNo = groupNoRaw === "" ? null : parseInt(String(groupNoRaw), 10);
          if (newGroupNo !== (match.group_no ?? null)) {
            patch.group_no = newGroupNo;
            changes.push({
              townId: match.id,
              townLabel: match.name,
              field: "Group No",
              oldValue: String(match.group_no ?? ""),
              newValue: String(newGroupNo ?? ""),
            });
          }
        }

        // Code
        const codeRaw = row["Code"] ?? row["code"] ?? row["upc"];
        if (codeRaw !== undefined) {
          const newCode = String(codeRaw).trim() || null;
          if (newCode !== (match.upc ?? null)) {
            patch.upc = newCode;
            changes.push({
              townId: match.id,
              townLabel: match.name,
              field: "Code",
              oldValue: match.upc ?? "",
              newValue: newCode ?? "",
            });
          }
        }

        // Discount — excepted from the confirmation gate: always included
        // in the patch when changed, but never added to `changes`.
        const discountRaw = row["Discount"] ?? row["discount"];
        if (discountRaw !== undefined) {
          const newDiscount = discountRaw === "" ? null : parseFloat(String(discountRaw));
          if (newDiscount !== (match.discount ?? null)) {
            patch.discount = newDiscount;
          }
        }

        // Status — also applied directly, not gated.
        const statusRaw = String(row["Status"] ?? row["status"] ?? "").trim().toLowerCase();
        if (statusRaw === "active" && !match.is_active) patch.is_active = true;
        else if (statusRaw === "inactive" && match.is_active) patch.is_active = false;

        if (Object.keys(patch).length > 0) {
          patches.push({ id: match.id, patch });
        }
      }

      if (changes.length > 0) {
        // Name/Group No/Code changed somewhere — hold everything for
        // confirmation instead of applying it.
        setPendingImport({ patches, changes, skipped });
        setImporting(false);
        return;
      }

      // Nothing gated changed — apply Discount/Status updates directly.
      await applyPatches(patches);
      setExcelStatus(
        skipped > 0
          ? `Updated ${patches.length} town${patches.length === 1 ? "" : "s"}, ${skipped} row${skipped === 1 ? "" : "s"} skipped (not found).`
          : `Updated ${patches.length} town${patches.length === 1 ? "" : "s"}.`
      );
      loadTowns();
    } catch (err: any) {
      setError(err.message || "Failed to read the Excel file.");
    } finally {
      setImporting(false);
    }
  }

  async function confirmOverwrite() {
    if (!pendingImport) return;
    setImporting(true);
    await applyPatches(pendingImport.patches);
    setExcelStatus(
      pendingImport.skipped > 0
        ? `Updated ${pendingImport.patches.length} town${pendingImport.patches.length === 1 ? "" : "s"}, ${pendingImport.skipped} row${pendingImport.skipped === 1 ? "" : "s"} skipped (not found).`
        : `Updated ${pendingImport.patches.length} town${pendingImport.patches.length === 1 ? "" : "s"}.`
    );
    setPendingImport(null);
    setImporting(false);
    loadTowns();
  }

  function cancelImport() {
    // Cancels everything in this batch, including any Discount-only
    // changes that were riding along with the gated ones.
    setPendingImport(null);
    setExcelStatus("Import cancelled — no changes were made.");
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fffdf5", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 6, height: 24, background: YELLOW, borderRadius: 3 }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: NAVY, margin: 0 }}>Towns</h1>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={downloadTemplate} style={secondaryButtonStyle}>
            Download Excel Template
          </button>
          <button type="button" onClick={triggerExcelUpload} disabled={importing} style={{ ...buttonStyle, opacity: importing ? 0.7 : 1 }}>
            {importing ? "Updating..." : "Update Data via Excel"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleExcelFile}
            style={{ display: "none" }}
          />
        </div>
      </div>

      <p style={{ color: "#666", fontSize: 13, marginBottom: 8, marginLeft: 16 }}>
        This list fills the Town dropdown on the public booking page. The Excel template's ID column is used to match rows back to towns — don't edit or remove it.
      </p>

      {excelStatus && (
        <div style={{ color: NAVY, background: "#eef3fb", border: "1px solid #cddaf0", borderRadius: 6, padding: "6px 10px", marginBottom: 12, fontSize: 13 }}>
          {excelStatus}
        </div>
      )}

      <form
        onSubmit={addTown}
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr auto",
          gap: 10,
          marginBottom: 24,
          background: "#fff",
          border: `1px solid ${YELLOW}`,
          borderRadius: 10,
          padding: 14,
          boxShadow: "0 2px 8px rgba(11,43,91,0.06)",
        }}
      >
        <input
          placeholder="Town name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          style={inputStyle}
        />
        <input
          placeholder="Group No"
          type="number"
          value={form.group_no}
          onChange={(e) => setForm({ ...form, group_no: e.target.value })}
          style={inputStyle}
        />
        <input
          placeholder="Code"
          value={form.upc}
          onChange={(e) => setForm({ ...form, upc: e.target.value })}
          style={inputStyle}
        />
        <input
          placeholder="Discount"
          type="number"
          step="0.01"
          value={form.discount}
          onChange={(e) => setForm({ ...form, discount: e.target.value })}
          style={inputStyle}
        />
        <button type="submit" style={buttonStyle}>Add</button>
      </form>

      {error && (
        <div style={{ color: RED, background: "#fdecec", border: "1px solid #f6c9c9", borderRadius: 6, padding: "6px 10px", marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${YELLOW}`, borderRadius: 10, background: "#fff" }}>
        <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
          <colgroup>
            <col style={{ width: 46 }} />
            <col style={{ minWidth: 160 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 70 }} />
          </colgroup>
          <thead>
            <tr style={{ textAlign: "left", background: NAVY }}>
              <th style={thStyle}></th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Group No</th>
              <th style={thStyle}>Code</th>
              <th style={thStyle}>Discount</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {towns.map((town, index) => (
              <tr key={town.id} style={{ borderBottom: `1px solid #f3e6b0` }}>
                <td style={tdStyle}>
                  <button onClick={() => move(index, -1)} style={moveButtonStyle} title="Move up">↑</button>
                  <button onClick={() => move(index, 1)} style={moveButtonStyle} title="Move down">↓</button>
                </td>
                <td style={tdStyle}>
                  <input
                    defaultValue={town.name}
                    onBlur={(e) => e.target.value !== town.name && updateTown(town.id, { name: e.target.value })}
                    style={{ width: "100%", minWidth: 160, border: "1px solid transparent", padding: 4, boxSizing: "border-box", borderRadius: 4 }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = YELLOW)}
                    onBlurCapture={(e) => (e.currentTarget.style.borderColor = "transparent")}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    defaultValue={town.group_no ?? ""}
                    onBlur={(e) => {
                      const value = e.target.value === "" ? null : parseInt(e.target.value, 10);
                      if (value !== (town.group_no ?? null)) updateTown(town.id, { group_no: value });
                    }}
                    style={{ width: "100%", border: "1px solid transparent", padding: 4, boxSizing: "border-box", borderRadius: 4 }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = YELLOW)}
                    onBlurCapture={(e) => (e.currentTarget.style.borderColor = "transparent")}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    defaultValue={town.upc ?? ""}
                    onBlur={(e) => e.target.value !== (town.upc ?? "") && updateTown(town.id, { upc: e.target.value || null })}
                    style={{ width: "100%", border: "1px solid transparent", padding: 4, boxSizing: "border-box", borderRadius: 4 }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = YELLOW)}
                    onBlurCapture={(e) => (e.currentTarget.style.borderColor = "transparent")}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={town.discount ?? ""}
                    onBlur={(e) => {
                      const value = e.target.value === "" ? null : parseFloat(e.target.value);
                      if (value !== (town.discount ?? null)) updateTown(town.id, { discount: value });
                    }}
                    style={{ width: "100%", border: "1px solid transparent", padding: 4, boxSizing: "border-box", borderRadius: 4 }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = YELLOW)}
                    onBlurCapture={(e) => (e.currentTarget.style.borderColor = "transparent")}
                  />
                </td>
                <td style={tdStyle}>
                  <button
                    type="button"
                    onClick={() => updateTown(town.id, { is_active: !town.is_active })}
                    style={{
                      padding: "4px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      border: "none",
                      borderRadius: 12,
                      cursor: "pointer",
                      color: town.is_active ? "#1b8a3d" : "#888",
                      background: town.is_active ? "#e6f4ea" : "#eee",
                    }}
                  >
                    {town.is_active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td style={tdStyle}>
                  <button onClick={() => deleteTown(town.id)} style={{ ...moveButtonStyle, color: RED, borderColor: "#f0b8b8" }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {pendingImport && (
        <div style={modalOverlayStyle} onClick={cancelImport}>
          <div style={modalBoxStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 17, margin: "0 0 4px", color: NAVY }}>Confirm changes</h2>
            <p style={{ fontSize: 13, color: "#666", margin: "0 0 14px" }}>
              These Name / Group No / Code changes were found in the uploaded file. Review before overwriting.
            </p>
            <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid #eee", borderRadius: 8, marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f5f6f8", textAlign: "left" }}>
                    <th style={{ padding: "6px 8px" }}>Town</th>
                    <th style={{ padding: "6px 8px" }}>Field</th>
                    <th style={{ padding: "6px 8px" }}>Old</th>
                    <th style={{ padding: "6px 8px" }}>New</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingImport.changes.map((c, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #eee" }}>
                      <td style={{ padding: "6px 8px" }}>{c.townLabel}</td>
                      <td style={{ padding: "6px 8px" }}>{c.field}</td>
                      <td style={{ padding: "6px 8px", color: "#888" }}>{c.oldValue || "—"}</td>
                      <td style={{ padding: "6px 8px", color: NAVY, fontWeight: 600 }}>{c.newValue || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={cancelImport} style={secondaryButtonStyle}>Cancel</button>
              <button type="button" onClick={confirmOverwrite} disabled={importing} style={buttonStyle}>
                {importing ? "Overwriting..." : "Overwrite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
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