"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const NAVY = "#0b2b5b";
const YELLOW = "#F6C90E";
const RED = "#D62828";

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
        background: `linear-gradient(180deg, ${NAVY} 0%, #133a75 45%, #fff7e0 45%, #fff7e0 100%)`,
        fontFamily: "system-ui, sans-serif",
        padding: 16,
      }}
    >
      <main
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 12px 32px rgba(11,43,91,0.18)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: NAVY,
            padding: "28px 24px 22px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            borderBottom: `3px solid ${YELLOW}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.jpg"
            alt="ASIA GHEE MILLS (Pvt.) Ltd."
            style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", background: "#fff" }}
          />
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: 0.3 }}>
              ASIA GHEE MILLS (Pvt.) Ltd.
            </h1>
            <p style={{ fontSize: 12, color: "#c9d6ec", margin: "2px 0 0" }}>Admin Login</p>
          </div>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14, padding: "24px" }}>
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 42px 10px 12px",
                border: "1px solid #d5dbe6",
                borderRadius: 8,
                boxSizing: "border-box",
                fontSize: 14,
                outline: "none",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = NAVY)}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#d5dbe6")}
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
              background: NAVY,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: submitting ? "default" : "pointer",
              fontSize: 14,
              fontWeight: 600,
              opacity: submitting ? 0.7 : 1,
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