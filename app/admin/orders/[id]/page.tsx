"use client";

import { useEffect, useState } from "react";
import { OrderWithItems } from "@/lib/types";

export default function AdminOrderDetailPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/orders/${params.id}`)
      .then((r) => r.json())
      .then((json) => setOrder(json.order))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <main style={{ padding: 24 }}>Loading...</main>;
  if (!order) return <main style={{ padding: 24 }}>Order not found.</main>;

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>{order.order_number}</h1>
      <p style={{ color: "#555", marginBottom: 20 }}>
        {order.customer_name} {order.town ? `· ${order.town}` : ""} · {order.order_date} · {order.status}
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead>
          <tr style={{ background: "#eee", textAlign: "left" }}>
            <th style={thStyle}>Item</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Qty</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Weight (kg)</th>
          </tr>
        </thead>
        <tbody>
          {order.order_items.map((li) => (
            <tr key={li.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={tdStyle}>{li.item_name}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{li.qty}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{li.amount.toLocaleString()}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{li.weight_total_kg.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ fontSize: 14, lineHeight: 1.8 }}>
        <div><strong>Total Amount:</strong> {order.total_amount.toLocaleString()}</div>
        <div><strong>Total Weight:</strong> {order.total_weight_kg.toFixed(2)} kg</div>
        {order.notes && <div><strong>Notes:</strong> {order.notes}</div>}
      </div>
    </main>
  );
}

const thStyle: React.CSSProperties = { padding: "8px 6px", fontSize: 13, border: "1px solid #ddd" };
const tdStyle: React.CSSProperties = { padding: "6px 6px", fontSize: 13, border: "1px solid #eee" };
