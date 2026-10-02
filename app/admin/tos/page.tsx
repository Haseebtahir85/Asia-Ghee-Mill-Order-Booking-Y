// Destination: app/admin/tos/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Town, TOWithTown } from "@/lib/types";

const NAVY = "#0b2b5b";
const YELLOW = "#F6C90E";
const RED = "#D62828";

const emptyForm = { name: "", town_id: "" };

export default function AdminTosPage() {
  const [tos, setTos] = useState<TOWithTown[]>([]);
  const [towns, setTowns] = useState<Town[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [tosRes, townsRes] = await Promise.all([fetch("/api/admin/tos"), fetch("/api/admin/towns")]);
      const tosJson = await tosRes.json();
      const townsJson = await townsRes.json();
      if (!tosRes.ok) throw new Error(tosJson.error || "Failed to load TO's");
      if (!townsRes.ok) throw new Error(townsJson.error || "Failed to load towns");
      setTos(tosJson.tos ?? []);
      setTowns(townsJson.towns ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  // A town can only have ONE TO — so the "add" dropdown only offers towns
  // that don't have one yet, and each row's dropdown offers its own town
  // plus the free ones.
  const takenTownIds = useMemo(() => new Set(tos.map((t) => t.town_id)), [tos]);
  const freeTowns = useMemo(() => towns.filter((t) => !takenTownIds.has(t.id)), [towns, takenTownIds]);

  async function addTo(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("TO's name is required.");
      return;
    }
    if (!form.town_id) {
      setError("Please select a town for this TO.");
      return;
    }

    const res = await fetch("/api/admin/tos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, town_id: form.town_id }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to add TO");
      return;
    }

    setForm(emptyForm);
    loadAll();
  }

  async function updateTo(id: string, patch: Partial<TOWithTown>) {
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
    if (!confirm("Remove this TO? Reports already filed keep the TO's name regardless.")) return;
    await fetch(`/api/admin/tos/${id}`, { method: "DELETE" });
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

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fffdf5", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div style={{ width: 6, height: 24, background: YELLOW, borderRadius: 3 }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: NAVY, margin: 0 }}>TO&apos;s Names</h1>
      </div>
      <p style={{ fontSize: 13, color: "#666", margin: "0 0 16px" }}>
        These names fill in automatically on the booking page&apos;s <strong>TO,s Secondary Ach. Report</strong> when a
        town is selected. A town can only have one TO.
      </p>

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
        <input
          placeholder="TO's name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          style={inputStyle}
        />
        <select
          value={form.town_id}
          onChange={(e) => setForm({ ...form, town_id: e.target.value })}
          style={inputStyle}
        >
          <option value="">{freeTowns.length === 0 ? "No free towns left" : "Select town…"}</option>
          {freeTowns.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button type="submit" style={buttonStyle}>
          Add
        </button>
      </form>

      {error && (
        <div style={{ color: RED, background: "#fdecec", border: "1px solid #f6c9c9", borderRadius: 6, padding: "6px 10px", marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : tos.length === 0 ? (
        <p style={{ color: "#666", fontSize: 14 }}>No TO&apos;s added yet. Add the first one above.</p>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${YELLOW}`, borderRadius: 10, background: "#fff" }}>
          <table style={{ width: "100%", minWidth: 600, borderCollapse: "collapse" }}>
            <colgroup>
              <col style={{ width: 46 }} />
              <col style={{ width: 40 }} />
              <col style={{ minWidth: 160 }} />
              <col style={{ minWidth: 160 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 70 }} />
            </colgroup>
            <thead>
              <tr style={{ textAlign: "left", background: NAVY }}>
                <th style={thStyle}></th>
                <th style={thStyle}>Sr#</th>
                <th style={thStyle}>TO&apos;s Name</th>
                <th style={thStyle}>Town</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {tos.map((to, index) => (
                <tr key={to.id} style={{ borderBottom: "1px solid #f3e6b0" }}>
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
                      style={{ width: "100%", minWidth: 160, border: "1px solid transparent", padding: 4, boxSizing: "border-box", borderRadius: 4 }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = YELLOW)}
                      onBlurCapture={(e) => (e.currentTarget.style.borderColor = "transparent")}
                    />
                  </td>
                  <td style={tdStyle}>
                    <select
                      value={to.town_id}
                      onChange={(e) => e.target.value !== to.town_id && updateTo(to.id, { town_id: e.target.value })}
                      style={{ width: "100%", minWidth: 160, border: "1px solid #e3e6ec", padding: 4, boxSizing: "border-box", borderRadius: 4, fontSize: 13, background: "#fff" }}
                    >
                      {towns
                        .filter((t) => t.id === to.town_id || !takenTownIds.has(t.id))
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
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
