"use client";

import { useEffect, useRef, useState } from "react";
import { Item, ItemType, IconKind } from "@/lib/types";

const ICON_OPTIONS: { value: IconKind; label: string }[] = [
  { value: "tin", label: "Tin" },
  { value: "pack", label: "Pack / Carton" },
  { value: "bucket", label: "Bucket (Balti)" },
  { value: "bottle", label: "Bottle" },
  { value: "soap", label: "Soap" },
];

const emptyForm = { name: "", weight_kg: "", rate: "", type: "ghee" as ItemType, icon: "tin" as IconKind };

// Same five glyphs used on the public /book page, kept in sync so the
// icon an admin picks here is exactly what customers will see there:
//   tin    -> straight cylinder, flat rim + flat base
//   pack   -> square carton with a folded top flap
//   bucket -> wide-to-narrow trapezoid with a handle arc
//   bottle -> tapered oil bottle (RSO)
//   soap   -> rounded bar
function IconGlyph({ kind }: { kind: IconKind }) {
  if (kind === "tin") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="6.5" y="8" width="11" height="11.5" rx="0.6" fill="#F6C90E" stroke="#0B2B5B" strokeWidth="1.4" />
        <ellipse cx="12" cy="8" rx="5.5" ry="1.8" fill="#FDE58A" stroke="#0B2B5B" strokeWidth="1.4" />
        <ellipse cx="12" cy="19.5" rx="5.5" ry="1.2" fill="none" stroke="#0B2B5B" strokeWidth="1" opacity="0.5" />
        <rect x="9.5" y="4.6" width="5" height="1.7" rx="0.4" fill="#0B2B5B" />
      </svg>
    );
  }
  if (kind === "pack") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="9" width="14" height="11" rx="0.5" fill="#FDE9A8" stroke="#D62828" strokeWidth="1.4" />
        <path d="M5 9 9 5h6l4 4" fill="#FBE0B0" stroke="#D62828" strokeWidth="1.3" />
        <path d="M9 5v4M15 5v4" stroke="#D62828" strokeWidth="1" opacity="0.6" />
        <path d="M5 13.5h14" stroke="#0B2B5B" strokeWidth="1" opacity="0.4" />
      </svg>
    );
  }
  if (kind === "bottle") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M10 2.5h4v3.1l1.6 2.4c.4.6.6 1.3.6 2V19a2.5 2.5 0 0 1-2.5 2.5h-3.4A2.5 2.5 0 0 1 7.8 19v-9c0-.7.2-1.4.6-2L10 5.6V2.5z" fill="#CFE8E0" stroke="#0B2B5B" strokeWidth="1.4" />
        <rect x="9.6" y="1.4" width="4.8" height="1.6" rx="0.4" fill="#0B2B5B" />
        <rect x="8.2" y="11.5" width="7.6" height="5" fill="#1B8A6B" opacity="0.75" />
      </svg>
    );
  }
  if (kind === "soap") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="8.5" width="17" height="9" rx="4" fill="#F7D9E6" stroke="#0B2B5B" strokeWidth="1.4" />
        <path d="M7 10.8c3.5 1.6 6.5 1.6 10 0" stroke="#0B2B5B" strokeWidth="1" opacity="0.45" fill="none" />
      </svg>
    );
  }
  // bucket
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M5 7.5h14l-2 11.2a1.6 1.6 0 0 1-1.58 1.3H8.58A1.6 1.6 0 0 1 7 18.7L5 7.5z" fill="#DCE1E8" stroke="#0B2B5B" strokeWidth="1.4" />
      <path d="M4 7.5h16" stroke="#0B2B5B" strokeWidth="1.4" />
      <path d="M7.5 7.5c0-2.6 2-4 4.5-4s4.5 1.4 4.5 4" stroke="#0B2B5B" strokeWidth="1.3" fill="none" />
    </svg>
  );
}

// Dropdown that shows the actual icon glyph for the current value and
// for every option — a native <select> can't render SVGs inside its
// <option> list in any browser, so this is a small custom popover
// instead. Closes on selection or on an outside click.
function IconSelect({ value, onChange }: { value: IconKind | null; onChange: (icon: IconKind) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={value ? ICON_OPTIONS.find((o) => o.value === value)?.label : "Choose icon"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "5px 7px",
          border: "1px solid #ccc",
          borderRadius: 6,
          background: "#fff",
          cursor: "pointer",
        }}
      >
        {value ? <IconGlyph kind={value} /> : <span style={{ fontSize: 11, color: "#999" }}>—</span>}
        <span style={{ fontSize: 8, color: "#888" }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 20,
            display: "flex",
            gap: 4,
            padding: 6,
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 8,
            boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
          }}
        >
          {ICON_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 30,
                height: 30,
                padding: 0,
                border: value === opt.value ? "1.5px solid #0b2b5b" : "1px solid transparent",
                borderRadius: 6,
                background: value === opt.value ? "#eef2f9" : "transparent",
                cursor: "pointer",
              }}
            >
              <IconGlyph kind={opt.value} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
        <IconSelect value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
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
                  <IconSelect value={item.icon} onChange={(icon) => updateItem(item.id, { icon })} />
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