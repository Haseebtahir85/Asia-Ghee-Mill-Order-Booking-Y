"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Item, Town } from "@/lib/types";
import styles from "./book.module.css";

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
      <main className={styles.wrapper}>
        <Header />
        <div className={styles.confirmCard}>
          <div className={styles.confirmIcon}>
            <CheckIcon />
          </div>
          <h1 style={{ fontSize: 21, margin: "0 0 8px", color: "#0b2b5b" }}>Order booked</h1>
          <p style={{ fontSize: 15, color: "#555", margin: 0 }}>
            Your order number is <strong>{confirmedOrderNumber}</strong>.
          </p>
          <button
            className={styles.secondaryBtn}
            onClick={() => {
              setConfirmedOrderNumber(null);
              setQtys({});
              setCustomerName("");
              setTownId("");
            }}
          >
            Book another order
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.wrapper}>
      <Header />

      <form onSubmit={submitOrder}>
        <div className={styles.card}>
          <div className={styles.fieldGrid}>
            <div>
              <label className={styles.fieldLabel}>Customer Name</label>
              <input
                className={styles.input}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Malik Traders"
              />
            </div>
            <div>
              <label className={styles.fieldLabel}>Town</label>
              <select className={styles.select} value={townId} onChange={(e) => setTownId(e.target.value)}>
                <option value="">Select town...</option>
                {towns.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className={styles.stateCard}>
            <div className={styles.spinner} />
            Loading catalog...
          </div>
        ) : loadError ? (
          <div className={`${styles.stateCard} ${styles.errorState}`}>
            Couldn&apos;t load the booking page: {loadError}. Try refreshing — if this keeps happening,
            the catalog may not be set up yet.
          </div>
        ) : items.length === 0 ? (
          <div className={`${styles.stateCard} ${styles.errorState}`}>
            No items found in the catalog. Add items in the admin panel before orders can be booked.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className={styles.right}>Qty</th>
                  <th className={styles.right}>Amount</th>
                  <th className={styles.right}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ item, amount, weight }, i) => (
                  <tr key={item.id} style={{ animation: "fadeUp 0.35s ease both", animationDelay: `${Math.min(i * 0.02, 0.4)}s` }}>
                    <td>
                      <div className={styles.itemCell}>
                        <span className={styles.itemIcon}>
                          <ProductIcon type={item.type} />
                        </span>
                        {item.name}
                      </div>
                    </td>
                    <td className={styles.right}>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={qtys[item.id] ?? ""}
                        onChange={(e) => updateQty(item.id, e.target.value)}
                        className={styles.qtyInput}
                      />
                    </td>
                    <td className={styles.right}>{amount ? amount.toLocaleString() : 0}</td>
                    <td className={styles.right}>{weight ? weight.toFixed(2) : 0}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={styles.totalRow}>
                  <td>Total</td>
                  <td></td>
                  <td className={styles.right}>{totals.amount.toLocaleString()}</td>
                  <td className={styles.right}>{totals.weight.toFixed(2)} kg</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {error && <div className={styles.errorBanner}>{error}</div>}

        <button
          type="submit"
          disabled={submitting || loading || !!loadError || items.length === 0}
          className={styles.submitBtn}
        >
          {submitting ? "Booking..." : "Book Order"}
        </button>
      </form>
    </main>
  );
}

function Header() {
  return (
    <div className={styles.hero}>
      <div className={styles.logoRow}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="Asia Ghee Mill" className={styles.logo} />
        <div>
          <h1 className={styles.brandTitle}>Asia Ghee Mill</h1>
          <p className={styles.brandSub}>Order Booking</p>
        </div>
      </div>

      <Link href="/admin" title="Admin panel" aria-label="Open admin panel" className={styles.gearBtn}>
        <SettingsIcon />
      </Link>
    </div>
  );
}

function SettingsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// Simple, self-drawn glyphs (not sourced from any product photo) so
// each row has a little visual identity without needing real product
// photography — a tin/bucket silhouette for ghee, a bottle for oil,
// a box for everything else.
function ProductIcon({ type }: { type: "ghee" | "oil" | "other" }) {
  if (type === "ghee") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8z" fill="#F6C90E" stroke="#0B2B5B" strokeWidth="1.4" />
        <rect x="7" y="5" width="10" height="3" rx="1" fill="#0B2B5B" />
      </svg>
    );
  }
  if (type === "oil") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M10 3h4v3.2l2.2 3.3c.5.8.8 1.7.8 2.6V19a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-6.9c0-.9.3-1.8.8-2.6L10 6.2V3z"
          fill="#FDE9A8"
          stroke="#D62828"
          strokeWidth="1.4"
        />
        <rect x="9.5" y="2" width="5" height="2" rx="0.5" fill="#0B2B5B" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 8l8-4 8 4-8 4-8-4z" fill="#e2e5ea" stroke="#0B2B5B" strokeWidth="1.2" />
      <path d="M4 8v9l8 4 8-4V8" stroke="#0B2B5B" strokeWidth="1.2" fill="none" />
      <path d="M12 12v9" stroke="#0B2B5B" strokeWidth="1.2" />
    </svg>
  );
}