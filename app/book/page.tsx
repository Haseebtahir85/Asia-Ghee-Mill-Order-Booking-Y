"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Item, Town } from "@/lib/types";
import styles from "./book.module.css";

// Jameel Noori Nastaleeq loads via next/font/local (see lib/fonts.ts) and is
// exposed as the --font-jameel-noori CSS variable on <html> in the root
// layout. Noto Nastaliq Urdu (also loaded via next/font) is the fallback if
// that font file is ever missing, before finally falling back to any
// Nastaliq-capable font already on the device, then generic serif.
const urduFont: React.CSSProperties = {
  fontFamily: "var(--font-jameel-noori), var(--font-noto-nastaliq), 'Noto Nastaliq Urdu', serif",
};

// True if the string contains Urdu/Arabic-script characters, so we only
// apply the Urdu font to messages that are actually in Urdu.
function isUrduText(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function townLabel(t: Town): string {
  return t.name;
}

function townMatches(t: Town, query: string): boolean {
  const q = query.toLowerCase();
  if (t.name.toLowerCase().includes(q)) return true;
  if (t.upc && t.upc.toLowerCase().includes(q)) return true;
  if (t.group_no != null && String(t.group_no).toLowerCase().includes(q)) return true;
  return false;
}

function getPakistanTimeString() {
  // Always computed against Asia/Karachi, regardless of the device's own timezone/clock settings.
  const now = new Date();
  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  const datePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(now);
  return `${timePart}, ${datePart}`;
}

// Icon is the admin's explicit choice (item.icon) when one is set.
// Otherwise it's guessed from what the item is called — a plain
// substring check, so it doesn't matter what comes before the
// container word — "6 Kg Tin", "16 Kg Tin (B)", "1 Kg 12 Pack",
// "16 Kg Bucket" all resolve correctly off the word tin/pack/bucket.
// RSO and Soap are checked first since those are specific products,
// not containers. Category is the last-resort fallback.
type IconKind = "tin" | "pack" | "bucket" | "bottle" | "soap";

function getIconKind(item: Item): IconKind {
  if (item.icon) return item.icon;

  const n = item.name.toLowerCase();
  if (n.includes("rso")) return "bottle";
  if (n.includes("soap")) return "soap";
  if (n.includes("tin")) return "tin";
  if (n.includes("pack")) return "pack";
  if (n.includes("bucket") || n.includes("balti")) return "bucket";
  // Fallback for names that don't carry a container word
  if (item.type === "ghee") return "tin";
  if (item.type === "oil") return "pack";
  return "bucket";
}

// Some items come in two rival pack sizes for the same base weight
// (e.g. "1 Kg 12 Pack" vs "1 Kg 10 Pack") — only one of a pair should
// ever be ordered at once. This pulls out a group key ("1", "1/2", "1/4")
// from any item name that looks like "<weight> Kg ... Pack".
function getPackGroupKey(item: Item): string | null {
  if (!item.name.toLowerCase().includes("pack")) return null;
  const match = item.name.match(/(\d+(?:\/\d+)?)\s*Kg/i);
  return match ? match[1] : null;
}

const QTY_OPTIONS = [1, 2, 3, 4];

export default function BookPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [towns, setTowns] = useState<Town[]>([]);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [townId, setTownId] = useState("");
  const [townQuery, setTownQuery] = useState("");
  const [townSuggestions, setTownSuggestions] = useState<Town[]>([]);
  const [showTownDropdown, setShowTownDropdown] = useState(false);
  const townBoxRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOrderNumbers, setConfirmedOrderNumbers] = useState<string[] | null>(null);
  const [showQtyModal, setShowQtyModal] = useState(false);
  const [conflictModalNames, setConflictModalNames] = useState<string[] | null>(null);
  const conflictSignatureRef = useRef<string>("");

  // Read-only Pakistan Standard Time clock (not derived from the device's local time zone)
  const [pkTime, setPkTime] = useState(getPakistanTimeString());

  useEffect(() => {
    const interval = setInterval(() => setPkTime(getPakistanTimeString()), 1000);
    return () => clearInterval(interval);
  }, []);

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

  // Close the town dropdown when clicking outside it
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (townBoxRef.current && !townBoxRef.current.contains(e.target as Node)) {
        setShowTownDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Rate and per-unit weight are fetched but never rendered per-row anymore —
  // amount is still computed here (for the overall total) even though the
  // Amount column itself is hidden from the table. `kind` drives the icon,
  // the group-divider logic, and the RSO/Soap breakdown below.
  const rows = useMemo(() => {
    return items.map((item) => {
      const qty = parseFloat(qtys[item.id] || "0") || 0;
      const amount = qty * item.rate;
      const weight = qty * item.weight_kg;
      return { item, qty, amount, weight, kind: getIconKind(item) };
    });
  }, [items, qtys]);

  const totals = useMemo(() => {
    let amount = 0;
    let weight = 0;
    let gheeWeight = 0;
    let oilWeight = 0;
    let rsoWeight = 0;
    let soapWeight = 0;
    for (const r of rows) {
      amount += r.amount;
      weight += r.weight;
      if (r.item.type === "ghee") gheeWeight += r.weight;
      if (r.item.type === "oil") oilWeight += r.weight;
      if (r.kind === "bottle") rsoWeight += r.weight;
      if (r.kind === "soap") soapWeight += r.weight;
    }
    const totalTon = (gheeWeight + oilWeight) / 1000;
    const grandTotalTon = weight / 1000;
    return { amount, weight, gheeWeight, oilWeight, rsoWeight, soapWeight, totalTon, grandTotalTon };
  }, [rows]);

  // Rival pack-size items (same weight, different pack count) — flag any
  // item whose group has more than one entry with a qty entered.
  const conflictItemIds = useMemo(() => {
    const groups: Record<string, typeof rows> = {};
    for (const r of rows) {
      const key = getPackGroupKey(r.item);
      if (!key) continue;
      (groups[key] ||= []).push(r);
    }
    const conflicts = new Set<string>();
    for (const key in groups) {
      const active = groups[key].filter((r) => r.qty > 0);
      if (active.length > 1) {
        active.forEach((r) => conflicts.add(r.item.id));
      }
    }
    return conflicts;
  }, [rows]);

  // Pop up the conflict warning the moment a new conflicting pair appears —
  // but only once per distinct conflict, not on every further keystroke
  // while the same conflict is still unresolved.
  useEffect(() => {
    const signature = Array.from(conflictItemIds).sort().join(",");
    if (signature && signature !== conflictSignatureRef.current) {
      const names = rows.filter((r) => conflictItemIds.has(r.item.id)).map((r) => r.item.name);
      setConflictModalNames(names);
    }
    conflictSignatureRef.current = signature;
  }, [conflictItemIds, rows]);

  function updateQty(itemId: string, value: string) {
    setQtys((prev) => ({ ...prev, [itemId]: value }));
  }

  function handleTownInputChange(value: string) {
    setTownQuery(value);
    setTownId("");
    if (!value.trim()) {
      setTownSuggestions([]);
      setShowTownDropdown(false);
      return;
    }
    const matches = towns.filter((t) => townMatches(t, value)).slice(0, 8);
    setTownSuggestions(matches);
    setShowTownDropdown(true);
  }

  function selectTown(t: Town) {
    setTownQuery(townLabel(t));
    setTownId(t.id);
    setShowTownDropdown(false);
  }

  function openQtyModal(e: React.FormEvent | React.MouseEvent) {
    e.preventDefault();
    setError(null);

    if (!townId) {
      setError("براہ کرم شہر منتخب کریں۔");
      return;
    }

    if (conflictItemIds.size > 0) {
      setError("صرف ایک پیک سائز منتخب کریں — ایک ہی وزن کے دو مختلف پیک ایک ساتھ نہیں لیے جا سکتے۔");
      return;
    }

    const lines = rows.filter((r) => r.qty > 0).map((r) => ({ item_id: r.item.id, qty: r.qty }));
    if (lines.length === 0) {
      setError("Enter a quantity for at least one item.");
      return;
    }

    setShowQtyModal(true);
  }

  async function bookOrders(copies: number) {
    setShowQtyModal(false);
    setError(null);
    setSubmitting(true);

    const lines = rows.filter((r) => r.qty > 0).map((r) => ({ item_id: r.item.id, qty: r.qty }));
    const orderNumbers: string[] = [];

    try {
      // Same town, same items — booked as `copies` separate bills, each
      // getting its own order number from the backend.
      for (let i = 0; i < copies; i++) {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ town_id: townId, lines }),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({ error: "Failed to submit order" }));
          throw new Error(json.error ?? "Failed to submit order");
        }

        const json = await res.json();
        orderNumbers.push(json.order.order_number);
      }
      setConfirmedOrderNumbers(orderNumbers);
    } catch (err: any) {
      setError(err.message || "Failed to submit order");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmedOrderNumbers) {
    return (
      <div className={styles.page} style={{ overflowX: "hidden" }}>
      <main className={styles.wrapper} style={{ maxWidth: 480, width: "100%", margin: "0 auto" }}>
        <Header />
        <div className={styles.confirmCard}>
          <div className={styles.confirmIcon}>
            <CheckIcon />
          </div>
          <h1 style={{ fontSize: 21, margin: "0 0 8px", color: "#0b2b5b" }}>Order booked</h1>
          <p style={{ fontSize: 15, color: "#555", margin: 0 }}>
            {confirmedOrderNumbers.length === 1 ? (
              <>Your order number is <strong>{confirmedOrderNumbers[0]}</strong>.</>
            ) : (
              <>
                Your order numbers are:{" "}
                <strong>{confirmedOrderNumbers.join(", ")}</strong>.
              </>
            )}
          </p>
          <button
            className={styles.secondaryBtn}
            onClick={() => {
              setConfirmedOrderNumbers(null);
              setQtys({});
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
    <div className={styles.page} style={{ overflowX: "hidden" }}>
    <main className={styles.wrapper} style={{ maxWidth: 480, width: "100%", margin: "0 auto" }}>
      <Header />

      <form onSubmit={openQtyModal}>
        <div className={styles.card} style={{ overflow: "visible", position: "relative", zIndex: 10 }}>
          <div className={styles.fieldGrid}>
            <div style={{ gridColumn: "1 / -1", position: "relative", zIndex: 50 }} ref={townBoxRef}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <label className={styles.fieldLabel}>Town</label>
                <span style={{ fontSize: 12, color: "#666", fontVariantNumeric: "tabular-nums" }}>
                  Current Time / Date: {pkTime}
                </span>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  className={styles.select}
                  style={{ width: "100%", ...urduFont }}
                  placeholder="شہر تلاش کرنے کے لیے ٹائپ کریں..."
                  value={townQuery}
                  onChange={(e) => handleTownInputChange(e.target.value)}
                  onFocus={() => townSuggestions.length > 0 && setShowTownDropdown(true)}
                  autoComplete="off"
                />
                {showTownDropdown && townSuggestions.length > 0 && (
                  <ul style={dropdownStyle}>
                    {townSuggestions.map((t) => (
                      <li key={t.id} onClick={() => selectTown(t)} style={dropdownItemStyle}>
                        {townLabel(t)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
          <div className={styles.tableOuter} style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 480, margin: "0 auto" }}>
          <div className={styles.tableWrap} style={{ overflowX: "hidden", width: "100%" }}>
            <table className={styles.table} style={{ tableLayout: "fixed", width: "100%", maxWidth: "100%", minWidth: 0, borderCollapse: "collapse" }}>
              <colgroup>
                <col style={{ width: "54%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "26%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Item</th>
                  <th className={styles.center} style={{ textAlign: "center", padding: "6px 8px" }}>Qty</th>
                  <th className={styles.right} style={{ textAlign: "right", padding: "6px 8px" }}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ item, weight, kind }, i) => {
                  const isGroupEnd = i === rows.length - 1 || rows[i + 1].kind !== kind;
                  const hasConflict = conflictItemIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={isGroupEnd ? styles.groupEnd : undefined}
                      style={{ animation: "fadeUp 0.35s ease both", animationDelay: `${Math.min(i * 0.02, 0.4)}s` }}
                    >
                      <td style={{ textAlign: "left", verticalAlign: "middle", padding: "6px 8px", whiteSpace: "normal", wordBreak: "break-word" }}>
                        <div className={styles.itemCell} style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
                          <span className={styles.itemIcon}>
                            <ProductIcon kind={kind} />
                          </span>
                          {item.name}
                        </div>
                      </td>
                      <td className={styles.center} style={{ textAlign: "center", verticalAlign: "middle", padding: "6px 8px" }}>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={qtys[item.id] ?? ""}
                          onChange={(e) => updateQty(item.id, e.target.value)}
                          className={styles.qtyInput}
                          style={{
                            boxSizing: "border-box",
                            width: "100%",
                            maxWidth: 60,
                            minWidth: 0,
                            display: "block",
                            margin: "0 auto",
                            textAlign: "center",
                            borderColor: hasConflict ? "#d62828" : undefined,
                          }}
                        />
                      </td>
                      <td className={styles.right} style={{ textAlign: "right", verticalAlign: "middle", padding: "6px 8px" }}>
                        {weight ? weight.toFixed(2) : 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className={styles.totalRow}>
                  <td colSpan={2} style={{ textAlign: "left", padding: "6px 8px" }}>Total</td>
                  <td className={styles.right} style={{ textAlign: "right", padding: "6px 8px" }}>{totals.weight.toFixed(2)} kg</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style={summaryCardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600, color: "#0b2b5b", marginBottom: 8 }}>
              <span>Total Amount</span>
              <span>{totals.amount.toLocaleString()}</span>
            </div>

            <div style={summaryRowStyle}>
              <span>Weight (Ghee)</span>
              <strong>{totals.gheeWeight.toFixed(2)} kg</strong>
            </div>
            <div style={summaryRowStyle}>
              <span>Weight (Oil)</span>
              <strong>{totals.oilWeight.toFixed(2)} kg</strong>
            </div>
            <div style={summaryTotalBarStyle}>
              <span>Total Weight (Ton)</span>
              <strong>{totals.totalTon.toFixed(3)}</strong>
            </div>

            <div style={summaryRowStyle}>
              <span>Weight (RSO)</span>
              <strong>{totals.rsoWeight.toFixed(2)} kg</strong>
            </div>
            <div style={summaryRowStyle}>
              <span>Weight (SOAP)</span>
              <strong>{totals.soapWeight.toFixed(2)} kg</strong>
            </div>
            <div style={summaryGrandTotalBarStyle}>
              <span>G.Total Weight (Ton)</span>
              <strong>{totals.grandTotalTon.toFixed(3)}</strong>
            </div>
          </div>
          </div>
        )}

        {error && (
          <div
            className={styles.errorBanner}
            style={isUrduText(error) ? { ...urduFont, textAlign: "right" } : undefined}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || loading || !!loadError || items.length === 0}
          className={styles.submitBtn}
          style={{ width: "100%", display: "block", ...urduFont }}
        >
          {submitting ? "بک ہو رہا ہے..." : "ابھی بک کریں"}
        </button>
      </form>

      {showQtyModal && (
        <div style={modalOverlayStyle} onClick={() => setShowQtyModal(false)}>
          <div style={modalBoxStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 17, margin: "0 0 4px", color: "#0b2b5b" }}>Order Quantity</h2>
            <p style={{ fontSize: 14, color: "#666", margin: "0 0 16px", ...urduFont, textAlign: "right" }}>
              اس ایک ہی آرڈر کے لیے کتنے بل بک کیے جائیں؟
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {QTY_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => bookOrders(n)}
                  style={qtyOptionButtonStyle}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowQtyModal(false)}
              style={{ marginTop: 16, background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 13 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {conflictModalNames && (
        <div style={modalOverlayStyle} onClick={() => setConflictModalNames(null)}>
          <div style={modalBoxStyle} onClick={(e) => e.stopPropagation()}>
            <p style={{ ...urduFont, fontSize: 15, color: "#d62828", margin: "0 0 12px", textAlign: "right", lineHeight: 1.7 }}>
              صرف ایک پیک سائز منتخب کریں — ایک ہی وزن کے دو مختلف پیک ایک ساتھ نہیں لیے جا سکتے۔
            </p>
            <ul style={{ margin: "0 0 16px", paddingLeft: 18, fontSize: 13, color: "#444" }}>
              {conflictModalNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setConflictModalNames(null)}
              style={qtyOptionButtonStyle}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </main>
    </div>
  );
}

function Header() {
  return (
    <div className={styles.hero}>
      <div className={styles.logoRow}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="ASIA GHEE MILLS (Pvt.) Ltd." className={styles.logo} />
        <div>
          <h1 className={styles.brandTitle}>ASIA GHEE MILLS (Pvt.) Ltd.</h1>
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

// Five distinct container glyphs — each has its own silhouette so
// tin/pack/bucket never read as the same shape at a glance:
//   tin    -> straight cylinder, flat rim + flat base
//   pack   -> square carton with a folded top flap
//   bucket -> wide-to-narrow trapezoid with a handle arc
//   bottle -> tapered oil bottle (RSO)
//   soap   -> rounded bar
function ProductIcon({ kind }: { kind: IconKind }) {
  if (kind === "tin") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="6.5" y="8" width="11" height="11.5" rx="0.6" fill="#F6C90E" stroke="#0B2B5B" strokeWidth="1.4" />
        <ellipse cx="12" cy="8" rx="5.5" ry="1.8" fill="#FDE58A" stroke="#0B2B5B" strokeWidth="1.4" />
        <ellipse cx="12" cy="19.5" rx="5.5" ry="1.2" fill="none" stroke="#0B2B5B" strokeWidth="1" opacity="0.5" />
        <rect x="9.5" y="4.6" width="5" height="1.7" rx="0.4" fill="#0B2B5B" />
      </svg>
    );
  }
  if (kind === "pack") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="9" width="14" height="11" rx="0.5" fill="#FDE9A8" stroke="#D62828" strokeWidth="1.4" />
        <path d="M5 9 9 5h6l4 4" fill="#FBE0B0" stroke="#D62828" strokeWidth="1.3" />
        <path d="M9 5v4M15 5v4" stroke="#D62828" strokeWidth="1" opacity="0.6" />
        <path d="M5 13.5h14" stroke="#0B2B5B" strokeWidth="1" opacity="0.4" />
      </svg>
    );
  }
  if (kind === "bottle") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M10 2.5h4v3.1l1.6 2.4c.4.6.6 1.3.6 2V19a2.5 2.5 0 0 1-2.5 2.5h-3.4A2.5 2.5 0 0 1 7.8 19v-9c0-.7.2-1.4.6-2L10 5.6V2.5z" fill="#CFE8E0" stroke="#0B2B5B" strokeWidth="1.4" />
        <rect x="9.6" y="1.4" width="4.8" height="1.6" rx="0.4" fill="#0B2B5B" />
        <rect x="8.2" y="11.5" width="7.6" height="5" fill="#1B8A6B" opacity="0.75" />
      </svg>
    );
  }
  if (kind === "soap") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="8.5" width="17" height="9" rx="4" fill="#F7D9E6" stroke="#0B2B5B" strokeWidth="1.4" />
        <path d="M7 10.8c3.5 1.6 6.5 1.6 10 0" stroke="#0B2B5B" strokeWidth="1" opacity="0.45" fill="none" />
      </svg>
    );
  }
  // bucket
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M5 7.5h14l-2 11.2a1.6 1.6 0 0 1-1.58 1.3H8.58A1.6 1.6 0 0 1 7 18.7L5 7.5z" fill="#DCE1E8" stroke="#0B2B5B" strokeWidth="1.4" />
      <path d="M4 7.5h16" stroke="#0B2B5B" strokeWidth="1.4" />
      <path d="M7.5 7.5c0-2.6 2-4 4.5-4s4.5 1.4 4.5 4" stroke="#0B2B5B" strokeWidth="1.3" fill="none" />
    </svg>
  );
}

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  maxHeight: 240,
  overflowY: "auto",
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: 8,
  boxShadow: "0 4px 14px rgba(0,0,0,0.1)",
  listStyle: "none",
  margin: 0,
  padding: 4,
  zIndex: 1000,
};

const dropdownItemStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 14,
  cursor: "pointer",
  borderRadius: 6,
};

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2000,
  padding: 16,
};

const modalBoxStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 24,
  width: "100%",
  maxWidth: 360,
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};

const qtyOptionButtonStyle: React.CSSProperties = {
  flex: "1 1 60px",
  padding: "10px 0",
  fontSize: 16,
  fontWeight: 600,
  border: "1px solid #0b2b5b",
  color: "#0b2b5b",
  background: "#fff",
  borderRadius: 8,
  cursor: "pointer",
};

const summaryCardStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "12px 14px",
  background: "#fafbfd",
  border: "1px solid #e6e9ef",
  borderRadius: 10,
};

const summaryRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 13,
  color: "#444",
  padding: "2px 0",
};

const summaryTotalBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 13,
  fontWeight: 700,
  color: "#0b2b5b",
  background: "#eef3fb",
  borderRadius: 6,
  padding: "6px 8px",
  margin: "6px 0 10px",
};

const summaryGrandTotalBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 14,
  fontWeight: 700,
  color: "#8a4b00",
  background: "#fff4e0",
  borderRadius: 6,
  padding: "7px 8px",
  marginTop: 6,
};