// Destination: app/admin/page.tsx
import Link from "next/link";

const NAVY = "#0b2b5b";
const YELLOW = "#F6C90E";

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

export default function AdminIndexPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ width: 6, height: 22, background: YELLOW, borderRadius: 3 }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: NAVY, margin: 0 }}>Dashboard</h2>
      </div>

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