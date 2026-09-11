"use client";

import { usePathname, useRouter } from "next/navigation";

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
    <div>
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", borderBottom: "1px solid #ddd", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", gap: 16 }}>
          <a href="/admin/items">Items & Rates</a>
          <a href="/admin/towns">Towns</a>
          <a href="/admin/orders">Orders</a>
          <a href="/book" style={{ color: "#888" }}>← Booking page</a>
        </div>
        <button onClick={logout} style={{ border: "none", background: "none", cursor: "pointer", color: "#555" }}>
          Log out
        </button>
      </nav>
      {children}
    </div>
  );
}
