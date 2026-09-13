// Destination: app/admin/orders/[id]/edit/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Item, OrderStatus, OrderWithItems, Town } from "@/lib/types";

const NAVY = "#0b2b5b";
const YELLOW = "#F6C90E";
const RED = "#D62828";

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "issue", label: "Issue" },
  { value: "done", label: "Done" },
];

export default function EditOrderPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [towns, setTowns] = useState<Town[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [townId, setTownId] = useState("");
  const [status, setStatus] = useState<OrderStatus>("pending");
  const [notes, setNotes] = useState("");
  const [qtys, setQtys] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [orderRes, itemsRes, townsRes] = await Promise.all([
          fetch(`/api/admin/orders/${params.id}`),
          fetch("/api/admin/items"),
          fetch("/api/admin/towns"),
        ]);
        const orderJson = await orderRes.json();
        const itemsJson = await itemsRes.json();
        const townsJson = await townsRes.json();

        if (!orderRes.ok) throw new Error(orderJson.error || "Order not found");

        const o: OrderWithItems = orderJson.order;
        setOrder(o);
        setTownId(o.town_id ?? "");
        setStatus(o.status);
        setNotes(o.notes ?? "");

        const initialQtys: Record<string, string> = {};
        for (const line of o.order_items) {
          if (line.item_id) initialQtys[line.item_id] = String(line.qty);
        }
        setQtys(initialQtys);

        setItems(itemsJson.items ?? []);
        setTowns(townsJson.towns ?? []);
      } catch (err: any) {
        setLoadError(err.message || "Failed to load order");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  function updateQty(itemId: string, value: string) {
    setQtys((prev) => ({ ...prev, [itemId]: value }));
  }

  const rows = useMemo(() => {
    return items.map((item) => {
      const qty = parseFloat(qtys[item.id] || "0") || 0;
      return { item, qty, amount: qty * item.rate, weight: qty * item.weight_kg };
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

  async function save() {
    setError(null);

    if (!townId) {
      setError("Please select a town.");
      return;
    }
    const lines = rows.filter((r) => r.qty > 0).map((r) => ({ item_id: r.item.id, qty: r.qty }));
    if (lines.length === 0) {
      setError("Enter a quantity for at least one item.");
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/admin/orders/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ town_id: townId, status, notes: notes || null, lines }),
    });
    setSaving(false);

    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "Failed to save" }));
      setError(json.error ?? "Failed to save");
      return;
    }

    router.push("/admin/orders");
  }

  if (loading) {
    return <main style={{ maxWidth: 700, margin: "60px auto", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>Loading...</main>;
  }

  if (loadError || !order) {
    return (
      <main style={{ maxWidth: 500, margin: "60px auto", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
        <p style={{ color: RED }}>{loadError ?? "Order not found."}</p>
        <Link href="/admin/orders" style={{ color: NAVY }}>← Back to Orders</Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fffdf5", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 6, height: 24, background: YELLOW, borderRadius: 3 }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: NAVY, margin: 0 }}>Edit Order {order.order_number}</h1>
        </div>
        <Link href="/admin/orders" style={{ fontSize: 13, color: NAVY }}>← Back to Orders</Link>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${YELLOW}`, borderRadius: 10, padding: 16, marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Town</label>
          <select value={townId} onChange={(e) => setTownId(e.target.value)} style={inputStyle}>
            <option value="">Select town</option>
            {towns.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} style={inputStyle}>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${YELLOW}`, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: NAVY, textAlign: "left" }}>
              <th style={thStyle}>Item</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Qty</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Weight</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, qty, amount, weight }) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #f3e6b0" }}>
                <td style={tdStyle}>{item.name}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={qtys[item.id] ?? ""}
                    onChange={(e) => updateQty(item.id, e.target.value)}
                    style={{ width: 70, textAlign: "center", padding: 4, border: "1px solid #d9dde6", borderRadius: 4 }}
                  />
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{amount ? amount.toLocaleString() : 0}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{weight ? weight.toFixed(2) : 0}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "#fafbfd", fontWeight: 700 }}>
              <td style={tdStyle} colSpan={2}>Total</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{totals.amount.toLocaleString()}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{totals.weight.toFixed(2)} kg</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {error && (
        <div style={{ color: RED, background: "#fdecec", border: "1px solid #f6c9c9", borderRadius: 6, padding: "6px 10px", marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      <button onClick={save} disabled={saving} style={{ ...buttonStyle, opacity: saving ? 0.7 : 1 }}>
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </main>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 4 };

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #d9dde6",
  borderRadius: 6,
  fontSize: 13,
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 20px",
  background: NAVY,
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 14,
};

const thStyle: React.CSSProperties = { padding: "9px 8px", fontSize: 13, color: "#fff", fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: "8px 8px" };