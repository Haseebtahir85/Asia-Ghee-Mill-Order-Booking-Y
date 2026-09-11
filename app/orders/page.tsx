"use client";

import { useEffect, useState } from "react";
import { Order, OrderStatus } from "@/lib/types";

const STATUS_OPTIONS: OrderStatus[] = [
  "pending",
  "confirmed",
  "dispatched",
  "delivered",
  "cancelled",
];

const emptyForm = {
  customer_name: "",
  customer_contact: "",
  origin: "",
  destination: "",
  weight_kg: "",
  rate_per_kg: "",
  extra_charges: "0",
  notes: "",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOrders() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/orders?${params.toString()}`);
    const json = await res.json();
    setOrders(json.orders ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // Try to auto-fill the rate when origin/destination/weight are all set
  async function tryAutoRate(origin: string, destination: string, weight: string) {
    if (!origin || !destination || !weight) return;
    const params = new URLSearchParams({ origin, destination, weight });
    const res = await fetch(`/api/rates?${params.toString()}`);
    const json = await res.json();
    if (json.rate) {
      setForm((f) => ({ ...f, rate_per_kg: String(json.rate.rate_per_kg) }));
    }
  }

  function updateField(field: keyof typeof emptyForm, value: string) {
    const next = { ...form, [field]: value };
    setForm(next);
    if (field === "origin" || field === "destination" || field === "weight_kg") {
      tryAutoRate(next.origin, next.destination, next.weight_kg);
    }
  }

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.customer_name || !form.origin || !form.destination || !form.weight_kg || !form.rate_per_kg) {
      setError("Customer, origin, destination, weight and rate are required.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: form.customer_name,
        customer_contact: form.customer_contact || undefined,
        origin: form.origin,
        destination: form.destination,
        weight_kg: parseFloat(form.weight_kg),
        rate_per_kg: parseFloat(form.rate_per_kg),
        extra_charges: parseFloat(form.extra_charges || "0"),
        notes: form.notes || undefined,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Failed to create order");
      return;
    }

    setForm(emptyForm);
    loadOrders();
  }

  async function updateStatus(id: string, status: OrderStatus) {
    await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadOrders();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === orders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(orders.map((o) => o.id)));
    }
  }

  async function exportToExcel() {
    setExporting(true);
    const body =
      selected.size > 0
        ? { ids: Array.from(selected) }
        : { status: statusFilter || undefined };

    const res = await fetch("/api/orders/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "Export failed" }));
      setError(json.error ?? "Export failed");
      setExporting(false);
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="(.+)"/);
    a.href = url;
    a.download = match ? match[1] : "orders-export.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    setExporting(false);
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 20 }}>Order Booking</h1>

      <form onSubmit={submitOrder} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <Field label="Customer Name">
          <input value={form.customer_name} onChange={(e) => updateField("customer_name", e.target.value)} />
        </Field>
        <Field label="Contact">
          <input value={form.customer_contact} onChange={(e) => updateField("customer_contact", e.target.value)} />
        </Field>
        <Field label="Origin">
          <input value={form.origin} onChange={(e) => updateField("origin", e.target.value)} />
        </Field>
        <Field label="Destination">
          <input value={form.destination} onChange={(e) => updateField("destination", e.target.value)} />
        </Field>
        <Field label="Weight (kg)">
          <input type="number" step="0.01" value={form.weight_kg} onChange={(e) => updateField("weight_kg", e.target.value)} />
        </Field>
        <Field label="Rate / kg">
          <input type="number" step="0.01" value={form.rate_per_kg} onChange={(e) => updateField("rate_per_kg", e.target.value)} />
        </Field>
        <Field label="Extra Charges">
          <input type="number" step="0.01" value={form.extra_charges} onChange={(e) => updateField("extra_charges", e.target.value)} />
        </Field>
        <Field label="Notes">
          <input value={form.notes} onChange={(e) => updateField("notes", e.target.value)} />
        </Field>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button type="submit" disabled={submitting} style={buttonStyle}>
            {submitting ? "Booking..." : "Book Order"}
          </button>
        </div>
      </form>

      {error && <div style={{ color: "#b00020", marginBottom: 16 }}>{error}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label>Status filter:</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button onClick={exportToExcel} disabled={exporting || orders.length === 0} style={buttonStyle}>
          {exporting
            ? "Exporting..."
            : selected.size > 0
            ? `Export Selected (${selected.size})`
            : "Export All (filtered)"}
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th style={thStyle}><input type="checkbox" checked={selected.size === orders.length && orders.length > 0} onChange={toggleSelectAll} /></th>
              <th style={thStyle}>Order #</th>
              <th style={thStyle}>Customer</th>
              <th style={thStyle}>Route</th>
              <th style={thStyle}>Weight</th>
              <th style={thStyle}>Rate/kg</th>
              <th style={thStyle}>Total</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={tdStyle}><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                <td style={tdStyle}>{o.order_number}</td>
                <td style={tdStyle}>{o.customer_name}</td>
                <td style={tdStyle}>{o.origin} → {o.destination}</td>
                <td style={tdStyle}>{o.weight_kg} kg</td>
                <td style={tdStyle}>{o.rate_per_kg}</td>
                <td style={tdStyle}>{o.total_amount}</td>
                <td style={tdStyle}>
                  <select value={o.status} onChange={(e) => updateStatus(o.id, e.target.value as OrderStatus)}>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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

const buttonStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#111",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};

const thStyle: React.CSSProperties = { padding: "8px 6px", fontSize: 13 };
const tdStyle: React.CSSProperties = { padding: "8px 6px", fontSize: 13 };
