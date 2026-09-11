"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Order, OrderStatus } from "@/lib/types";

const STATUS_OPTIONS: OrderStatus[] = ["pending", "confirmed", "dispatched", "delivered", "cancelled"];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOrders() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/admin/orders?${params.toString()}`);
    const json = await res.json();
    setOrders(json.orders ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(selected.size === orders.length ? new Set() : new Set(orders.map((o) => o.id)));
  }

  async function updateStatus(id: string, status: OrderStatus) {
    await fetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadOrders();
  }

  async function exportToExcel() {
    setExporting(true);
    setError(null);
    const body = selected.size > 0 ? { ids: Array.from(selected) } : { status: statusFilter || undefined };

    const res = await fetch("/api/admin/orders/export", {
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
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Orders</h1>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label>Status:</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button onClick={exportToExcel} disabled={exporting || orders.length === 0} style={buttonStyle}>
          {exporting ? "Exporting..." : selected.size > 0 ? `Export Selected (${selected.size})` : "Export All (filtered)"}
        </button>
      </div>

      {error && <div style={{ color: "#b00020", marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th style={thStyle}><input type="checkbox" checked={selected.size === orders.length && orders.length > 0} onChange={toggleSelectAll} /></th>
              <th style={thStyle}>Order #</th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Customer</th>
              <th style={thStyle}>Amount</th>
              <th style={thStyle}>Weight-Ghee</th>
              <th style={thStyle}>Weight-Oil</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={tdStyle}><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                <td style={tdStyle}><Link href={`/admin/orders/${o.id}`}>{o.order_number}</Link></td>
                <td style={tdStyle}>{o.order_date}</td>
                <td style={tdStyle}>{o.customer_name}</td>
                <td style={tdStyle}>{o.total_amount.toLocaleString()}</td>
                <td style={tdStyle}>{(o.total_weight_ghee_kg / 1000).toFixed(2)} t</td>
                <td style={tdStyle}>{(o.total_weight_oil_kg / 1000).toFixed(2)} t</td>
                <td style={tdStyle}>
                  <select value={o.status} onChange={(e) => updateStatus(o.id, e.target.value as OrderStatus)}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
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
