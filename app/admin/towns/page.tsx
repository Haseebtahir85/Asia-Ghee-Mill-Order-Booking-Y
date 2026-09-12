"use client";

import { useEffect, useState } from "react";
import { Town } from "@/lib/types";

const emptyForm = { name: "", group_no: "", upc: "" };

export default function AdminTownsPage() {
  const [towns, setTowns] = useState<Town[]>([]);
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

  async function updateTown(id: string, patch: Partial<Town>) {
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
    <main style={{ maxWidth: 700, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Towns</h1>
      <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
        This list fills the Town dropdown on the public booking page.
      </p>

      <form onSubmit={addTown} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10, marginBottom: 24 }}>
        <input placeholder="Town name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ minWidth: 0, width: "100%", boxSizing: "border-box" }} />
        <input placeholder="Group No" type="number" value={form.group_no} onChange={(e) => setForm({ ...form, group_no: e.target.value })} style={{ minWidth: 0, width: "100%", boxSizing: "border-box" }} />
        <input placeholder="Code" value={form.upc} onChange={(e) => setForm({ ...form, upc: e.target.value })} style={{ minWidth: 0, width: "100%", boxSizing: "border-box" }} />
        <button type="submit" style={buttonStyle}>Add</button>
      </form>

      {error && <div style={{ color: "#b00020", marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
          <colgroup>
            <col style={{ width: 46 }} />
            <col style={{ minWidth: 180 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 70 }} />
          </colgroup>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th style={thStyle}></th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Group No</th>
              <th style={thStyle}>Code</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {towns.map((town, index) => (
              <tr key={town.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={tdStyle}>
                  <button onClick={() => move(index, -1)} style={moveButtonStyle} title="Move up">↑</button>
                  <button onClick={() => move(index, 1)} style={moveButtonStyle} title="Move down">↓</button>
                </td>
                <td style={tdStyle}>
                  <input
                    defaultValue={town.name}
                    onBlur={(e) => e.target.value !== town.name && updateTown(town.id, { name: e.target.value })}
                    style={{ width: "100%", minWidth: 160, border: "1px solid transparent", padding: 4, boxSizing: "border-box" }}
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
                    style={{ width: "100%", border: "1px solid transparent", padding: 4, boxSizing: "border-box" }}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    defaultValue={town.upc ?? ""}
                    onBlur={(e) => e.target.value !== (town.upc ?? "") && updateTown(town.id, { upc: e.target.value || null })}
                    style={{ width: "100%", border: "1px solid transparent", padding: 4, boxSizing: "border-box" }}
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
                  <button onClick={() => deleteTown(town.id)} style={{ ...moveButtonStyle, color: "#b00020" }}>Delete</button>
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

const buttonStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#111",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};

const moveButtonStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  background: "#fff",
  borderRadius: 4,
  padding: "2px 8px",
  cursor: "pointer",
  marginRight: 4,
};

const thStyle: React.CSSProperties = { padding: "8px 6px", fontSize: 13 };
const tdStyle: React.CSSProperties = { padding: "6px 6px", fontSize: 13 };
