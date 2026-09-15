// Destination: app/admin/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const NAVY = "#0b2b5b";
const YELLOW = "#F6C90E";
const RED = "#D62828";

const SECTIONS = [
  {
    href: "/admin/orders",
    title: "Orders",
    description: "Review, filter, and edit incoming bookings.",
    icon: <ClipboardIcon />,
  },
  {
    href: "/admin/items",
    title: "Items, Weights & Rates",
    description: "Manage the product catalog admins book from.",
    icon: <BoxIcon />,
  },
  {
    href: "/admin/towns",
    title: "Towns",
    description: "Manage the town list, codes, and discounts.",
    icon: <PinIcon />,
  },
];

type TownStat = { town: string; total: number; new: number };
type DashboardStats = {
  totalOrders: number;
  newOrdersCount: number;
  lastExportAt: string | null;
  byTown: TownStat[];
};

export default function AdminIndexPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/dashboard-stats", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setStats(json);
      })
      .catch(() => setError("Failed to load stats"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ width: 6, height: 22, background: YELLOW, borderRadius: 3 }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: NAVY, margin: 0 }}>Dashboard</h2>
      </div>

      {error && (
        <div style={{ color: RED, background: "#fdecec", border: "1px solid #f6c9c9", borderRadius: 6, padding: "6px 10px", marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && stats && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
            <div style={statCardStyle}>
              <div style={statLabelStyle}>Total Orders</div>
              <div style={{ ...statValueStyle, color: NAVY }}>{stats.totalOrders}</div>
            </div>
            <div style={{ ...statCardStyle, background: "#fff8e6", borderColor: YELLOW }}>
              <div style={statLabelStyle}>New Orders</div>
              <div style={{ ...statValueStyle, color: "#8a6608" }}>{stats.newOrdersCount}</div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
                {stats.lastExportAt ? `Since last "New Order" export` : "Since the beginning (no export yet)"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 6, height: 18, background: YELLOW, borderRadius: 3 }} />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: NAVY, margin: 0 }}>Orders by Town</h3>
          </div>

          <div style={{ overflowX: "auto", border: `1px solid ${YELLOW}`, borderRadius: 10, background: "#fff", marginBottom: 32 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", background: NAVY }}>
                  <th style={thStyle}>Town</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Total Orders</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>New Orders</th>
                </tr>
              </thead>
              <tbody>
                {stats.byTown.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 20 }}>
                      No orders yet.
                    </td>
                  </tr>
                ) : (
                  stats.byTown.map((t) => (
                    <tr key={t.town} style={{ borderBottom: "1px solid #f3e6b0" }}>
                      <td style={tdStyle}>{t.town}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{t.total}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: t.new > 0 ? 700 : 400, color: t.new > 0 ? "#8a6608" : "#888" }}>
                        {t.new}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            style={{
              display: "block",
              background: "#fff",
              border: `1px solid ${YELLOW}`,
              borderRadius: 12,
              padding: 20,
              textDecoration: "none",
              boxShadow: "0 2px 8px rgba(11,43,91,0.06)",
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: "#eef3fb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: NAVY,
                marginBottom: 14,
              }}
            >
              {s.icon}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 13, color: "#666", lineHeight: 1.4 }}>{s.description}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}

const statCardStyle: React.CSSProperties = {
  background: "#fff",
  border: `1px solid #e6e9ef`,
  borderRadius: 12,
  padding: "16px 18px",
};

const statLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const statValueStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  marginTop: 4,
};

const thStyle: React.CSSProperties = { padding: "9px 10px", fontSize: 13, color: "#fff", fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 13 };

function ClipboardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="6" y="4" width="12" height="17" rx="1.5" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 11h6M9 15h6" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3.5 8 12 3l8.5 5v8L12 21l-8.5-5z" />
      <path d="M3.5 8 12 13l8.5-5M12 13v8" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.4" />
    </svg>
  );
}