"use client";

import { useEffect, useState } from "react";
import { RateCard } from "@/lib/types";

const emptyForm = {
  origin: "",
  destination: "",
  min_weight_kg: "0",
  max_weight_kg: "",
  rate_per_kg: "",
  effective_from: new Date().toISOString().slice(0, 10),
};

export default function RatesPage() {
  const [rates, setRates] = useState<RateCard[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadRates() {
    setLoading(true);
    const res = await fetch("/api/rates");
    const json = await res.json();
    setRates(json.rates ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadRates();
  }, []);

  async function submitRate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.origin || !form.destination || !form.rate_per_kg) {
      setError("Origin, destination and rate are required.");
      return;
    }

    const res = await fetch("/api/rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: form.origin,
        destination: form.destination,
        min_weight_kg: parseFloat(form.min_weight_kg || "0"),
        max_weight_kg: form.max_weight_kg ? parseFloat(form.max_weight_kg) : null,
        rate_per_kg: parseFloat(form.rate_per_kg),
        effective_from: form.effective_from,
      }),
    });

    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Failed to save rate");
      return;
    }

    setForm(emptyForm);
    loadRates();
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 20 }}>Rate Cards</h1>

      <form onSubmit={submitRate} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <Field label="Origin">
          <input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
        </Field>
        <Field label="Destination">
          <input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
        </Field>
        <Field label="Rate / kg">
          <input type="number" step="0.01" value={form.rate_per_kg} onChange={(e) => setForm({ ...form, rate_per_kg: e.target.value })} />
        </Field>
        <Field label="Min Weight (kg)">
          <input type="number" step="0.01" value={form.min_weight_kg} onChange={(e) => setForm({ ...form, min_weight_kg: e.target.value })} />
        </Field>
        <Field label="Max Weight (kg, optional)">
          <input type="number" step="0.01" value={form.max_weight_kg} onChange={(e) => setForm({ ...form, max_weight_kg: e.target.value })} placeholder="no cap" />
        </Field>
        <Field label="Effective From">
          <input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
        </Field>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button type="submit" style={buttonStyle}>Add Rate</button>
        </div>
      </form>

      {error && <div style={{ color: "#b00020", marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th style={thStyle}>Route</th>
              <th style={thStyle}>Weight Slab</th>
              <th style={thStyle}>Rate/kg</th>
              <th style={thStyle}>Effective From</th>
              <th style={thStyle}>Active</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={tdStyle}>{r.origin} → {r.destination}</td>
                <td style={tdStyle}>{r.min_weight_kg} – {r.max_weight_kg ?? "∞"} kg</td>
                <td style={tdStyle}>{r.rate_per_kg}</td>
                <td style={tdStyle}>{r.effective_from}</td>
                <td style={tdStyle}>{r.is_active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", fontSize: 13, gap: 4 }}>
      {label}
      {children}
    </label>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#111",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};

const thStyle: React.CSSProperties = { padding: "8px 6px", fontSize: 13 };
const tdStyle: React.CSSProperties = { padding: "8px 6px", fontSize: 13 };
