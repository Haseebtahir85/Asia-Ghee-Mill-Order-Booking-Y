"use client";

import { useEffect, useMemo, useState } from "react";
import { Item } from "@/lib/types";
import { parseUnitWeightKg, DEFAULT_OIL_DENSITY_KG_PER_LITER } from "@/lib/weightParser";

export default function BookPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [oilDensity, setOilDensity] = useState(DEFAULT_OIL_DENSITY_KG_PER_LITER);
  const [loading, setLoading] = useState(true);
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [itemsRes, settingsRes] = await Promise.all([
        fetch("/api/items"),
        fetch("/api/settings"),
      ]);
      const itemsJson = await itemsRes.json();
      const settingsJson = await settingsRes.json();
      setItems(itemsJson.items ?? []);
      if (settingsJson.oil_density_kg_per_liter) {
        setOilDensity(settingsJson.oil_density_kg_per_liter);
      }
      setLoading(false);
    }
    load();
  }, []);

  const rows = useMemo(() => {
    return items.map((item) => {
      const qty = parseFloat(qtys[item.id] || "0") || 0;
      const amount = qty * item.rate;
      const unitWeightKg = parseUnitWeightKg(item.name, oilDensity);
      const weightKg = unitWeightKg * qty;
      return { item, qty, amount, weightKg };
    });
  }, [items, qtys, oilDensity]);

  const totals = useMemo(() => {
    let amount = 0;
    let gheeKg = 0;
    let oilKg = 0;
    for (const r of rows) {
      amount += r.amount;
      if (r.item.type === "ghee") gheeKg += r.weightKg;
      if (r.item.type === "oil") oilKg += r.weightKg;
    }
    return { amount, gheeTon: gheeKg / 1000, oilTon: oilKg / 1000 };
  }, [rows]);

  function updateQty(itemId: string, value: string) {
    setQtys((prev) => ({ ...prev, [itemId]: value }));
  }

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customerName.trim()) {
      setError("Customer name is required.");
      return;
    }

    const lines = rows.filter((r) => r.qty > 0).map((r) => ({ item_id: r.item.id, qty: r.qty }));
    if (lines.length === 0) {
      setError("Enter a quantity for at least one item.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: customerName,
        customer_contact: customerContact || undefined,
        notes: notes || undefined,
        lines,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "Failed to submit order" }));
      setError(json.error ?? "Failed to submit order");
      return;
    }

    const json = await res.json();
    setConfirmedOrderNumber(json.order.order_number);
  }

  if (confirmedOrderNumber) {
    return (
      <main style={pageStyle}>
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Order booked</h1>
          <p style={{ fontSize: 16, color: "#555" }}>
            Your order number is <strong>{confirmedOrderNumber}</strong>.
          </p>
          <button
            onClick={() => {
              setConfirmedOrderNumber(null);
              setQtys({});
              setCustomerName("");
              setCustomerContact("");
              setNotes("");
            }}
            style={{ ...buttonStyle, marginTop: 20 }}
          >
            Book another order
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Order Booking</h1>

      <form onSubmit={submitOrder}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
          <Field label="Customer Name">
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </Field>
          <Field label="Contact">
            <input value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} />
          </Field>
          <Field label="Notes">
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        {loading ? (
          <p>Loading items...</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
            <thead>
              <tr style={{ background: "#eee", textAlign: "left" }}>
                <th style={thStyle}>Item</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Qty</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Rate</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                <th style={thStyle}>Type</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, qty, amount }) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #eee", background: item.type === "oil" ? "#eaf6ea" : undefined }}>
                  <td style={tdStyle}>{item.name}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={qtys[item.id] ?? ""}
                      onChange={(e) => updateQty(item.id, e.target.value)}
                      style={{ width: 70, textAlign: "right", padding: "4px 6px" }}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{item.rate.toLocaleString()}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{amount ? amount.toLocaleString() : 0}</td>
                  <td style={tdStyle}>{item.type}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 600, borderTop: "2px solid #ccc" }}>
                <td style={tdStyle}>Weight (Ton)</td>
                <td style={tdStyle}></td>
                <td style={tdStyle}></td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{totals.amount.toLocaleString()}</td>
                <td style={tdStyle}></td>
              </tr>
              <tr>
                <td style={tdStyle}>Weight-Ghee</td>
                <td colSpan={4} style={tdStyle}>{totals.gheeTon.toFixed(2)}</td>
              </tr>
              <tr>
                <td style={tdStyle}>Weight-Oil</td>
                <td colSpan={4} style={tdStyle}>{totals.oilTon.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        {error && <div style={{ color: "#b00020", marginBottom: 12 }}>{error}</div>}

        <button type="submit" disabled={submitting || loading} style={buttonStyle}>
          {submitting ? "Booking..." : "Book Order"}
        </button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", fontSize: 13, gap: 4 }}>
      {label}
      {children}
    </label>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "24px 16px",
  fontFamily: "system-ui, sans-serif",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 20px",
  background: "#111",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 15,
};

const thStyle: React.CSSProperties = { padding: "8px 6px", fontSize: 13, border: "1px solid #ddd" };
const tdStyle: React.CSSProperties = { padding: "6px 6px", fontSize: 13, border: "1px solid #eee" };
