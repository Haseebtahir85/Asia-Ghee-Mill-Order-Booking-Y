"use client";

import { useEffect, useState } from "react";
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

export default function AdminTownsPage() {
  const [towns, setTowns] = useState<TownWithDiscount[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fffdf5", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div style={{ width: 6, height: 24, background: YELLOW, borderRadius: 3 }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: NAVY, margin: 0 }}>Towns</h1>
      </div>
      <p style={{ color: "#666", fontSize: 13, marginBottom: 20, marginLeft: 16 }}>
        This list fills the Town dropdown on the public booking page.
      </p>

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