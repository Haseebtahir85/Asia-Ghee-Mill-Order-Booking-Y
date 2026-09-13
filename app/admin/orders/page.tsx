"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Order, OrderStatus } from "@/lib/types";

const NAVY = "#0b2b5b";
const YELLOW = "#F6C90E";
const RED = "#D62828";

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "issue", label: "Issue" },
  { value: "done", label: "Done" },
];

const STATUS_STYLES: Record<OrderStatus, { color: string; background: string }> = {
  pending: { color: "#8a6608", background: "#fff4d6" },
  issue: { color: RED, background: "#fdecec" },
  done: { color: "#1b8a3d", background: "#e6f4ea" },
};

function formatDateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// A single control that opens a small popover with two native date inputs
// (Start/End) instead of two separate fields sitting in the filter bar —
// picking both, then closing, is "one date picker" for the whole range.
function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const label = from && to ? `${formatDateLabel(from)} – ${formatDateLabel(to)}` : from ? `From ${formatDateLabel(from)}` : to ? `Until ${formatDateLabel(to)}` : "All dates";

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <label style={labelStyle}>Date range</label>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...filterInputStyle, textAlign: "left", cursor: "pointer", minWidth: 170 }}>
        {label}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 30,
            background: "#fff",
            border: `1px solid ${YELLOW}`,
            borderRadius: 8,
            boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <div>
              <label style={labelStyle}>Start</label>
              <input type="date" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} style={filterInputStyle} />
            </div>
            <div>
              <label style={labelStyle}>End</label>
              <input type="date" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} style={filterInputStyle} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                onChange("", "");
              }}
              style={{ background: "none", border: "none", color: "#888", fontSize: 12, cursor: "pointer", padding: 0 }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ background: NAVY, color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminOrdersPage() {
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "">("");
  const [townFilter, setTownFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetched once — every filter after that is instant, applied client-side
  // against this same list, with no network round-trip per change.
  async function loadOrders() {
    setLoading(true);
    const res = await fetch("/api/admin/orders");
    const json = await res.json();
    setAllOrders(json.orders ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
  }, []);

  // Town filter options come straight from the orders actually loaded —
  // never the full towns catalog, so it only ever lists towns that appear
  // in the order list, and never depends on a second network call.
  const townOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of allOrders) {
      if (o.town_id && o.town && !seen.has(o.town_id)) seen.set(o.town_id, o.town);
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allOrders]);

  const filteredOrders = useMemo(() => {
    return allOrders.filter((o) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (townFilter && o.town_id !== townFilter) return false;
      if (dateFrom && o.order_date < dateFrom) return false;
      if (dateTo && o.order_date > dateTo) return false;
      return true;
    });
  }, [allOrders, statusFilter, townFilter, dateFrom, dateTo]);

  useEffect(() => {
    setSelected(new Set());
  }, [statusFilter, townFilter, dateFrom, dateTo]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(selected.size === filteredOrders.length ? new Set() : new Set(filteredOrders.map((o) => o.id)));
  }

  async function updateStatus(id: string, status: OrderStatus) {
    // Optimistic update — the row reflects the new status immediately,
    // no waiting on a refetch to feel responsive.
    setAllOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    await fetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function exportToExcel() {
    setExporting(true);
    setError(null);
    const ids = selected.size > 0 ? Array.from(selected) : filteredOrders.map((o) => o.id);

    const res = await fetch("/api/admin/orders/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
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

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 16,
          background: "#fff",
          border: `1px solid ${YELLOW}`,
          borderRadius: 10,
          padding: 14,
        }}
      >
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div>
            <label style={labelStyle}>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "")} style={filterInputStyle}>
              <option value="">All</option>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Town</label>
            <select value={townFilter} onChange={(e) => setTownFilter(e.target.value)} style={filterInputStyle}>
              <option value="">All towns</option>
              {townOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        </div>

        <button onClick={exportToExcel} disabled={exporting || filteredOrders.length === 0} style={buttonStyle}>
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
      ) : filteredOrders.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "#888", background: "#fff", border: `1px solid ${YELLOW}`, borderRadius: 10 }}>
          No orders match these filters.
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${YELLOW}`, borderRadius: 10, background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", background: NAVY }}>
              <th style={thStyle}><input type="checkbox" checked={selected.size === filteredOrders.length && filteredOrders.length > 0} onChange={toggleSelectAll} /></th>
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
            {filteredOrders.map((o) => {
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
                      {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
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

const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, color: "#888", marginBottom: 3, fontWeight: 600 };

const filterInputStyle: React.CSSProperties = {
  padding: "6px 8px",
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