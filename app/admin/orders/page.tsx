"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Order, OrderStatus } from "@/lib/types";

const NAVY = "#0b2b5b";
const YELLOW = "#F6C90E";
const RED = "#D62828";

const STATUS_TABS: { value: OrderStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "issue", label: "Issue" },
  { value: "done", label: "Done" },
];

const STATUS_STYLES: Record<OrderStatus, { color: string; background: string }> = {
  pending: { color: "#8a6608", background: "#fff4d6" },
  issue: { color: RED, background: "#fdecec" },
  done: { color: "#1b8a3d", background: "#e6f4ea" },
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OrderStatus>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOrders() {
    setLoading(true);
    const params = new URLSearchParams({ status: statusFilter });
    const res = await fetch(`/api/admin/orders?${params.toString()}`);
    const json = await res.json();
    setOrders(json.orders ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
    setSelected(new Set());
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
    const body = selected.size > 0 ? { ids: Array.from(selected) } : { status: statusFilter };

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
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fffdf5", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 6, height: 24, background: YELLOW, borderRadius: 3 }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: NAVY, margin: 0 }}>Orders</h1>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6, background: "#fff", border: `1px solid ${YELLOW}`, borderRadius: 10, padding: 4 }}>
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                style={{
                  padding: "6px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: active ? "#fff" : NAVY,
                  background: active ? NAVY : "transparent",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <button onClick={exportToExcel} disabled={exporting || orders.length === 0} style={buttonStyle}>
          {exporting ? "Exporting..." : selected.size > 0 ? `Export Selected (${selected.size})` : "Export All (filtered)"}
        </button>
      </div>

      {error && (
        <div style={{ color: RED, background: "#fdecec", border: "1px solid #f6c9c9", borderRadius: 6, padding: "6px 10px", marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : orders.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "#888", background: "#fff", border: `1px solid ${YELLOW}`, borderRadius: 10 }}>
          No orders in this status.
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${YELLOW}`, borderRadius: 10, background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", background: NAVY }}>
              <th style={thStyle}><input type="checkbox" checked={selected.size === orders.length && orders.length > 0} onChange={toggleSelectAll} /></th>
              <th style={thStyle}>Order #</th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Town</th>
              <th style={thStyle}>Amount</th>
              <th style={thStyle}>Weight (kg)</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const statusStyle = STATUS_STYLES[o.status];
              return (
                <tr key={o.id} style={{ borderBottom: "1px solid #f3e6b0" }}>
                  <td style={tdStyle}><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: NAVY }}>{o.order_number}</td>
                  <td style={tdStyle}>{o.order_date}</td>
                  <td style={tdStyle}>{o.town ?? ""}</td>
                  <td style={tdStyle}>{o.total_amount.toLocaleString()}</td>
                  <td style={tdStyle}>{o.total_weight_kg.toFixed(2)}</td>
                  <td style={tdStyle}>
                    <select
                      value={o.status}
                      onChange={(e) => updateStatus(o.id, e.target.value as OrderStatus)}
                      style={{
                        padding: "4px 8px",
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 12,
                        border: "none",
                        color: statusStyle.color,
                        background: statusStyle.background,
                        cursor: "pointer",
                      }}
                    >
                      {STATUS_TABS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <Link href={`/admin/orders/${o.id}/edit`} style={editButtonStyle}>Edit</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </main>
  );
}

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

const editButtonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 12px",
  fontSize: 12,
  fontWeight: 600,
  border: `1px solid ${NAVY}`,
  color: NAVY,
  borderRadius: 6,
  textDecoration: "none",
};

const thStyle: React.CSSProperties = { padding: "9px 6px", fontSize: 13, color: "#fff", fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: "8px 6px", fontSize: 13 };