"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Item, Town } from "@/lib/types";

// Brand colors pulled from the Asia Ghee Mill logo
const BRAND = {
  yellow: "#F6C90E",
  navy: "#0B2B5B",
  red: "#D62828",
};

export default function BookPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [towns, setTowns] = useState<Town[]>([]);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [townId, setTownId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [itemsRes, townsRes] = await Promise.all([fetch("/api/items"), fetch("/api/towns")]);
        const itemsJson = await itemsRes.json();
        const townsJson = await townsRes.json();
        if (!itemsRes.ok) throw new Error(itemsJson.error || `Items request failed (${itemsRes.status})`);
        if (!townsRes.ok) throw new Error(townsJson.error || `Towns request failed (${townsRes.status})`);
        setItems(itemsJson.items ?? []);
        setTowns(townsJson.towns ?? []);
      } catch (err: any) {
        setLoadError(err.message || "Failed to load booking page data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Rate and per-unit weight are fetched but never rendered — they're
  // only used here to compute each row's Amount/Weight live as the
  // customer types a quantity.
  const rows = useMemo(() => {
    return items.map((item) => {
      const qty = parseFloat(qtys[item.id] || "0") || 0;
      const amount = qty * item.rate;
      const weight = qty * item.weight_kg;
      return { item, qty, amount, weight };
    });
  }, [items, qtys]);

  const totals = useMemo(() => {
    let amount = 0;
    let weight = 0;
    for (const r of rows) {
      amount += r.amount;
      weight += r.weight;
    }
    return { amount, weight };
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
    if (!townId) {
      setError("Please select a town.");
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
        town_id: townId,
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
        <Header />
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <h1 style={{ fontSize: 22, marginBottom: 8, color: BRAND.navy }}>Order booked</h1>
          <p style={{ fontSize: 16, color: "#555" }}>
            Your order number is <strong>{confirmedOrderNumber}</strong>.
          </p>
          <button
            onClick={() => {
              setConfirmedOrderNumber(null);
              setQtys({});
              setCustomerName("");
              setTownId("");
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
      <Header />

      <form onSubmit={submitOrder}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
          <Field label="Customer Name">
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </Field>
          <Field label="Town">
            <select value={townId} onChange={(e) => setTownId(e.target.value)}>
              <option value="">Select town...</option>
              {towns.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>
        </div>

        {loading ? (
          <p>Loading items...</p>
        ) : loadError ? (
          <p style={{ color: "#b00020" }}>
            Couldn&apos;t load the booking page: {loadError}. Try refreshing — if this keeps happening,
            the catalog may not be set up yet.
          </p>
        ) : items.length === 0 ? (
          <p style={{ color: "#b00020" }}>
            No items found in the catalog. Add items in the admin panel before orders can be booked.
          </p>
        ) : (
          <div style={{ overflowX: "auto", marginBottom: 16 }}>
          <table style={{ width: "100%", minWidth: 480, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: BRAND.navy, color: "#fff", textAlign: "left" }}>
                <th style={thStyle}>Item</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Qty</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Weight</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, amount, weight }) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
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
                  <td style={{ ...tdStyle, textAlign: "right" }}>{amount ? amount.toLocaleString() : 0}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{weight ? weight.toFixed(2) : 0}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 600, borderTop: `2px solid ${BRAND.navy}`, background: "#fdf6d8" }}>
                <td style={tdStyle}>Total</td>
                <td style={tdStyle}></td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{totals.amount.toLocaleString()}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{totals.weight.toFixed(2)} kg</td>
              </tr>
            </tfoot>
          </table>
          </div>
        )}

        {error && <div style={{ color: "#b00020", marginBottom: 12 }}>{error}</div>}

        <button
          type="submit"
          disabled={submitting || loading || !!loadError || items.length === 0}
          style={buttonStyle}
        >
          {submitting ? "Booking..." : "Book Order"}
        </button>
      </form>
    </main>
  );
}

function Header() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: `3px solid ${BRAND.yellow}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="Asia Ghee Mill" style={{ height: 56, width: 56, borderRadius: 12, objectFit: "cover" }} />
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: BRAND.navy }}>Asia Ghee Mill</h1>
          <p style={{ fontSize: 12, margin: 0, color: BRAND.red, fontWeight: 600 }}>Order Booking</p>
        </div>
      </div>

      <Link
        href="/admin"
        title="Admin panel"
        aria-label="Open admin panel"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: BRAND.navy,
          color: "#fff",
          textDecoration: "none",
        }}
      >
        <SettingsIcon />
      </Link>
    </div>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", fontSize: 13, gap: 4, color: BRAND.navy, fontWeight: 500 }}>
      {label}
      {children}
    </label>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 700,
  margin: "0 auto",
  padding: "24px 16px",
  fontFamily: "system-ui, sans-serif",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 20px",
  background: BRAND.red,
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 600,
};

const thStyle: React.CSSProperties = { padding: "8px 6px", fontSize: 13, border: "1px solid #ddd" };
const tdStyle: React.CSSProperties = { padding: "6px 6px", fontSize: 13, border: "1px solid #eee" };
