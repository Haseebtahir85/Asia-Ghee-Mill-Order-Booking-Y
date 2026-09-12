"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Item, Town } from "@/lib/types";
import styles from "./book.module.css";

function townLabel(t: Town): string {
  return t.upc ? `${t.name} (${t.upc})` : t.name;
}

export default function BookPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [towns, setTowns] = useState<Town[]>([]);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [townId, setTownId] = useState("");
  const [townQuery, setTownQuery] = useState("");
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
    let gheeWeight = 0;
    let oilWeight = 0;
    for (const r of rows) {
      amount += r.amount;
      weight += r.weight;
      if (r.item.type === "ghee") gheeWeight += r.weight;
      if (r.item.type === "oil") oilWeight += r.weight;
    }
    return { amount, weight, gheeWeight, oilWeight };
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
      <div className={styles.page}>
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
              setTownQuery("");
            }}
          >
            Book another order
          </button>
        </div>
      </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
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
              <input
                className={styles.select}
                list="town-options"
                placeholder="Type to search towns..."
                value={townQuery}
                onChange={(e) => {
                  const value = e.target.value;
                  setTownQuery(value);
                  const match = towns.find((t) => townLabel(t) === value);
                  setTownId(match ? match.id : "");
                }}
              />
              <datalist id="town-options">
                {towns.map((t) => (
                  <option key={t.id} value={townLabel(t)} />
                ))}
              </datalist>
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
          <div className={styles.tableOuter}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <colgroup>
                <col style={{ width: "44%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "20%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className={styles.center}>Qty</th>
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
                    <td className={styles.center}>
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
                <tr className={styles.breakdownRow}>
                  <td colSpan={3} className={styles.breakdownLabel}>Weight breakdown</td>
                  <td className={styles.right}>
                    <div className={styles.weightBreakdown}>
                      <span>Ghee: {totals.gheeWeight.toFixed(2)} kg</span>
                      <span>Oil: {totals.oilWeight.toFixed(2)} kg</span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
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
    </div>
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

// Container-accurate glyphs: ghee items are packed in tins, oil items
// in cartons/packs, everything else ("other") in a balti (bucket).
// Each icon sits in a small bordered box (see .itemIcon) so it reads
// as a distinct little badge next to the item name.
function ProductIcon({ type }: { type: "ghee" | "oil" | "other" }) {
  if (type === "ghee") {
    // Tin
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path
          d="M6 7.5 6.9 19.6a1.4 1.4 0 0 0 1.4 1.3h7.4a1.4 1.4 0 0 0 1.4-1.3L18 7.5z"
          fill="#F6C90E"
          stroke="#0B2B5B"
          strokeWidth="1.4"
        />
        <ellipse cx="12" cy="7.5" rx="6" ry="1.9" fill="#FDE58A" stroke="#0B2B5B" strokeWidth="1.4" />
        <path d="M8.3 7.4V6.1a1 1 0 0 1 1-1h5.4a1 1 0 0 1 1 1v1.3" stroke="#0B2B5B" strokeWidth="1.1" fill="none" />
        <path d="M6.6 12.5c1.6.7 9.2.7 10.8 0" stroke="#0B2B5B" strokeWidth="0.8" opacity="0.35" fill="none" />
      </svg>
    );
  }
  if (type === "oil") {
    // Carton / pack
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M4 8.5 12 5l8 3.5v9L12 21 4 17.5z" fill="#FDE9A8" stroke="#D62828" strokeWidth="1.4" />
        <path d="M4 8.5 12 12l8-3.5M12 12v9" stroke="#D62828" strokeWidth="1.3" fill="none" />
        <path d="M7.7 6.8 15.7 10.3" stroke="#0B2B5B" strokeWidth="1" opacity="0.5" />
      </svg>
    );
  }
  // Balti (bucket)
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M6.5 8h11l-1.3 10.2a1.8 1.8 0 0 1-1.78 1.6H9.58a1.8 1.8 0 0 1-1.78-1.6L6.5 8z"
        fill="#e2e5ea"
        stroke="#0B2B5B"
        strokeWidth="1.4"
      />
      <path d="M5.5 8h13" stroke="#0B2B5B" strokeWidth="1.4" />
      <path d="M8.5 8c0-3 1.5-4.6 3.5-4.6S15.5 5 15.5 8" stroke="#0B2B5B" strokeWidth="1.3" fill="none" />
    </svg>
  );
}