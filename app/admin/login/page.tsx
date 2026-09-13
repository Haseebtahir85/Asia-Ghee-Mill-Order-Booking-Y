"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const NAVY = "#0b2b5b";
const NAVY_DEEP = "#082042";
const DARK_YELLOW = "#B8860B";
const RED = "#D62828";

// Seamless dot-lattice texture (two offset radial-gradient dot grids) — used
// on both the page background and, more subtly, on the card itself. Tiles
// perfectly with no visible seams, and reads as a texture rather than lines
// or checkmarks.
function dotLattice(dotColor: string, tile: number) {
  return {
    backgroundImage: `radial-gradient(circle at ${tile / 4}px ${tile / 4}px, ${dotColor} 1.6px, transparent 1.7px), radial-gradient(circle at ${(tile * 3) / 4}px ${(tile * 3) / 4}px, ${dotColor} 1.6px, transparent 1.7px)`,
    backgroundSize: `${tile}px ${tile}px`,
  };
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}

function AdminLoginForm() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    setSubmitting(false);

    if (!res.ok) {
      setError("Incorrect password.");
      return;
    }

    const next = searchParams.get("next") || "/admin/items";
    router.push(next);
    router.refresh();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: NAVY_DEEP,
        ...dotLattice("rgba(255,255,255,0.07)", 32),
        fontFamily: "system-ui, sans-serif",
        padding: 16,
      }}
    >
      <main
        style={{
          width: "100%",
          maxWidth: 380,
          borderRadius: 16,
          boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
          overflow: "hidden",
          backgroundColor: NAVY,
          backgroundImage: `radial-gradient(circle at 7px 7px, rgba(255,255,255,0.10) 1.4px, transparent 1.5px), radial-gradient(circle at 21px 21px, rgba(255,255,255,0.10) 1.4px, transparent 1.5px), linear-gradient(135deg, ${NAVY} 0%, ${NAVY} 52%, ${DARK_YELLOW} 52%, ${DARK_YELLOW} 100%)`,
          backgroundSize: "28px 28px, 28px 28px, 100% 100%",
        }}
      >
        <div
          style={{
            padding: "28px 24px 22px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.jpg"
            alt="ASIA GHEE MILLS (Pvt.) Ltd."
            style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}
          />
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: 0.3, textShadow: "0 1px 3px rgba(0,0,0,0.35)" }}>
              ASIA GHEE MILLS (Pvt.) Ltd.
            </h1>
            <p style={{ fontSize: 12, color: "#fff", opacity: 0.85, margin: "2px 0 0" }}>Admin Login</p>
          </div>
        </div>

        <form
          onSubmit={submit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            padding: "20px 24px 26px",
            background: "rgba(0,0,0,0.12)",
          }}
        >
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 42px 10px 12px",
                border: "1px solid rgba(255,255,255,0.5)",
                borderRadius: 8,
                boxSizing: "border-box",
                fontSize: 14,
                outline: "none",
                background: "#fff",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = DARK_YELLOW)}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)")}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "none",
                cursor: "pointer",
                padding: 4,
                display: "flex",
                color: "#888",
              }}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>

          {error && (
            <div style={{ color: RED, fontSize: 13, background: "#fdecec", border: "1px solid #f6c9c9", borderRadius: 6, padding: "6px 10px" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "10px 16px",
              background: "#fff",
              color: NAVY_DEEP,
              border: "none",
              borderRadius: 8,
              cursor: submitting ? "default" : "pointer",
              fontSize: 14,
              fontWeight: 700,
              opacity: submitting ? 0.7 : 1,
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            }}
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </main>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}