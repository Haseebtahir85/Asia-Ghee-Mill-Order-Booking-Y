// Destination: app/admin/reports/StockCheckTable.tsx
"use client";

import { StockCheckResult, Tons } from "@/lib/stockCheck";

const NAVY = "#0b2b5b";

const cols: { key: keyof Tons; label: string }[] = [
  { key: "ghee", label: "Ghee" },
  { key: "oil", label: "Oil" },
  { key: "rso", label: "RSO" },
  { key: "total", label: "Total" },
];

const fmt = (n: number) => n.toFixed(3);
const cellStyle: React.CSSProperties = { padding: "5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" };

// The comparison saved with a filed report: the sheet's formula
//   Closing = Opening + Primary - Secondary   (tons)
// against the closing stock the TO reported.
export default function StockCheckTable({ check }: { check: StockCheckResult | null | undefined }) {
  if (!check) return null;

  let note: string | null = null;
  if (!check.available) {
    note = check.reason === "no_row" ? "This TO was not found in the uploaded stock sheet." : "No stock sheet was uploaded for this month.";
  } else if (!check.complete) {
    note = `Waiting for the remaining towns of this TO (${check.remaining}) before the comparison can be made.`;
  }

  const full = check.available && check.complete && check.to_total && check.expected && check.diff && check.ok;

  return (
    <div style={{ border: "1px solid #e6e9ef", borderRadius: 8, marginBottom: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "#f5f6f8", fontSize: 13, fontWeight: 700, color: NAVY }}>
        <span>Stock check (Tons) — {check.to_name}</span>
        {full && (
          <span
            style={{
              fontSize: 12,
              borderRadius: 12,
              padding: "2px 10px",
              color: check.status === "match" ? "#1b8a3d" : "#d62828",
              background: check.status === "match" ? "#e6f4ea" : "#fdeaea",
            }}
          >
            {check.status === "match" ? "Match" : "Mismatch"}
          </span>
        )}
      </div>

      {note && <div style={{ padding: "8px 10px", fontSize: 12, color: "#666" }}>{note}</div>}

      {full && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "#666", fontSize: 12 }}>
              <th style={{ ...cellStyle, textAlign: "left" }}></th>
              {cols.map((c) => (
                <th key={c.key} style={{ ...cellStyle, fontWeight: 600 }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Opening (TO's page 1)", v: check.to_total!.opening },
              { label: "Primary (stock sheet)", v: check.to_total!.primary },
              { label: "Secondary (TO's page 2)", v: check.to_total!.secondary },
              { label: "Closing by formula", v: check.expected!, strong: true },
              { label: "Closing reported (page 3)", v: check.to_total!.closing },
            ].map((r) => (
              <tr key={r.label} style={{ borderTop: "1px solid #eee", background: r.strong ? "#fff4e0" : undefined, fontWeight: r.strong ? 700 : 400 }}>
                <td style={{ ...cellStyle, textAlign: "left", color: NAVY }}>{r.label}</td>
                {cols.map((c) => (
                  <td key={c.key} style={cellStyle}>
                    {fmt(r.v[c.key])}
                  </td>
                ))}
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid #ddd", fontWeight: 700 }}>
              <td style={{ ...cellStyle, textAlign: "left", color: NAVY }}>Difference</td>
              {cols.map((c) => {
                const good = check.ok![c.key];
                const d = check.diff![c.key];
                return (
                  <td key={c.key} style={{ ...cellStyle, color: good ? "#1b8a3d" : "#d62828" }}>
                    {good ? "✓" : `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}`}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
