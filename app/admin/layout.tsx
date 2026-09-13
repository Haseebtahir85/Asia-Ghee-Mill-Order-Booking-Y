// Destination: app/admin/layout.tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

const NAVY = "#0b2b5b";
const YELLOW = "#F6C90E";

const NAV_LINKS = [
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/items", label: "Items & Rates" },
  { href: "/admin/towns", label: "Towns" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  if (isLoginPage) return <div>{children}</div>;

  return (
    <div style={{ minHeight: "100vh", background: "#fffdf5" }}>
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 24px",
          background: NAVY,
          borderBottom: `3px solid ${YELLOW}`,
          fontFamily: "system-ui, sans-serif",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="ASIA GHEE MILLS (Pvt.) Ltd." style={{ width: 30, height: 30, borderRadius: 7, objectFit: "cover", background: "#fff" }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>ASIA GHEE MILLS</span>
          </Link>

          <div style={{ display: "flex", gap: 4 }}>
            {NAV_LINKS.map((link) => {
              const active = pathname?.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    padding: "6px 12px",
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 7,
                    textDecoration: "none",
                    color: active ? NAVY : "#dfe7f5",
                    background: active ? YELLOW : "transparent",
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/book" style={{ fontSize: 12, color: "#a9bde0", textDecoration: "none" }}>
            ← Booking page
          </a>
          <button
            onClick={logout}
            style={{
              border: `1px solid rgba(255,255,255,0.35)`,
              background: "transparent",
              cursor: "pointer",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: 7,
            }}
          >
            Log out
          </button>
        </div>
      </nav>
      {children}
    </div>
  );
}