"use client";

import { useEffect, useState } from "react";
import { Item, ItemType, IconKind } from "@/lib/types";

const ICON_OPTIONS: { value: IconKind; label: string }[] = [
  { value: "tin", label: "Tin" },
  { value: "pack", label: "Pack / Carton" },
  { value: "bucket", label: "Bucket (Balti)" },
  { value: "bottle", label: "Bottle" },
  { value: "soap", label: "Soap" },
];

const emptyForm = { name: "", weight_kg: "", rate: "", type: "ghee" as ItemType, icon: "tin" as IconKind };

export default function AdminItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  async function loadItems() {
    setLoading(true);
    const res = await fetch("/api/admin/items");
    const json = await res.json();
    setItems(json.items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadItems();
  }, []);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name || !form.rate || !form.weight_kg) {
      setError("Name, weight, and rate are required.");
      return;
    }

    const res = await fetch("/api/admin/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        weight_kg: parseFloat(form.weight_kg),
        rate: parseFloat(form.rate),
        type: form.type,
        icon: form.icon,
      }),
    });

    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Failed to add item");
      return;
    }

    setForm(emptyForm);
    loadItems();
  }

  async function updateItem(id: string, patch: Partial<Item>) {
    await fetch(`/api/admin/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    loadItems();
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this item? This does not affect past orders (they keep a snapshot).")) return;
    await fetch(`/api/admin/items/${id}`, { method: "DELETE" });
    loadItems();
  }

  async function move(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setItems(reordered);
    await fetch("/api/admin/items/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: reordered.map((i) => i.id) }),
    });
  }

  return (
    <main style={{ maxWidth: 950, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Items, Weights & Rates</h1>

      <form onSubmit={addItem} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto", gap: 10, marginBottom: 24, padding: 14, border: "1px solid #ddd", borderRadius: 8 }}>
        <input placeholder="Item name (e.g. 1 Kg 12 Pack)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input type="number" step="0.01" placeholder="Weight (kg)" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} />
        <input type="number" step="0.01" placeholder="Rate" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ItemType })}>
          <option value="ghee">Ghee</option>
          <option value="oil">Oil</option>
          <option value="other">Other</option>
        </select>
        <select value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value as IconKind })}>
          {ICON_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button type="submit" style={buttonStyle}>Add</button>
      </form>

      {error && <div style={{ color: "#b00020", marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th style={thStyle}></th>
              <th style={thStyle}>Item</th>
              <th style={thStyle}>Weight (kg)</th>
              <th style={thStyle}>Rate</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Icon</th>
              <th style={thStyle}>Active</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={tdStyle}>
                  <button onClick={() => move(index, -1)} style={moveButtonStyle} title="Move up">↑</button>
                  <button onClick={() => move(index, 1)} style={moveButtonStyle} title="Move down">↓</button>
                </td>
                <td style={tdStyle}>
                  <input
                    defaultValue={item.name}
                    onBlur={(e) => e.target.value !== item.name && updateItem(item.id, { name: e.target.value })}
                    style={{ width: "100%", border: "1px solid transparent", padding: 4 }}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={item.weight_kg}
                    onBlur={(e) => parseFloat(e.target.value) !== item.weight_kg && updateItem(item.id, { weight_kg: parseFloat(e.target.value) })}
                    style={{ width: 80, border: "1px solid transparent", padding: 4 }}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={item.rate}
                    onBlur={(e) => parseFloat(e.target.value) !== item.rate && updateItem(item.id, { rate: parseFloat(e.target.value) })}
                    style={{ width: 90, border: "1px solid transparent", padding: 4 }}
                  />
                </td>
                <td style={tdStyle}>
                  <select value={item.type} onChange={(e) => updateItem(item.id, { type: e.target.value as ItemType })}>
                    <option value="ghee">Ghee</option>
                    <option value="oil">Oil</option>
                    <option value="other">Other</option>
                  </select>
                </td>
                <td style={tdStyle}>
                  <select value={item.icon ?? ""} onChange={(e) => updateItem(item.id, { icon: e.target.value as IconKind })}>
                    <option value="" disabled>Choose...</option>
                    {ICON_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </td>
                <td style={tdStyle}>
                  <input type="checkbox" checked={item.is_active} onChange={(e) => updateItem(item.id, { is_active: e.target.checked })} />
                </td>
                <td style={tdStyle}>
                  <button onClick={() => deleteItem(item.id)} style={{ ...moveButtonStyle, color: "#b00020" }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
