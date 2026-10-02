// Destination: app/admin/reports/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReportStage, SecondaryReport, SecondaryReportLine, SecondaryReportSettingsInfo, Town, TOWithTowns } from "@/lib/types";
import { MONTH_NAMES, monthLabel } from "@/lib/secondaryReport";
import StockSheetCard from "./StockSheetCard";
import StockCheckTable from "./StockCheckTable";

const NAVY = "#0b2b5b";
const YELLOW = "#F6C90E";
const RED = "#D62828";

const STAGES: { key: ReportStage; label: string }[] = [
  { key: "closing_opening", label: "Closing/Opening" },
  { key: "secondary_sale", label: "Secondary Sale" },
  { key: "closing_stock", label: "Closing Stock" },
];

type Tab = "data" | "settings";

function prevOf(month: number, year: number) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

function formatFiledAt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function stageWeight(report: SecondaryReport, stage: ReportStage): number {
  return (report.secondary_report_lines ?? [])
    .filter((l) => l.stage === stage)
    .reduce((sum, l) => sum + Number(l.weight_total_kg || 0), 0);
}

// One row per item, with the qty/weight for each of the 3 stages side by side.
function checkLabel(status: string | null | undefined): string {
  switch (status) {
    case "match":
      return "Match";
    case "mismatch":
      return "Mismatch";
    case "partial":
      return "Waiting for other towns";
    case "no_sheet":
      return "No stock sheet";
    case "no_row":
      return "TO not in sheet";
    default:
      return "";
  }
}

function CheckBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span style={{ color: "#bbb" }}>—</span>;
  const styles: Record<string, { color: string; bg: string; text: string }> = {
    match: { color: "#1b8a3d", bg: "#e6f4ea", text: "✓ Match" },
    mismatch: { color: "#d62828", bg: "#fdeaea", text: "✗ Mismatch" },
  };
  const s = styles[status];
  if (!s) return <span style={{ color: "#999", fontSize: 12 }}>—</span>;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: s.color, background: s.bg, borderRadius: 12, padding: "2px 9px" }}>{s.text}</span>
  );
}

function buildItemMatrix(report: SecondaryReport) {
  const byKey = new Map<
    string,
    { name: string; sort: number; qty: Record<ReportStage, number>; weight: Record<ReportStage, number> }
  >();
  for (const l of report.secondary_report_lines ?? ([] as SecondaryReportLine[])) {
    const key = l.item_id ?? l.item_name;
    let row = byKey.get(key);
    if (!row) {
      row = {
        name: l.item_name,
        sort: l.item_sort ?? 0,
        qty: { closing_opening: 0, secondary_sale: 0, closing_stock: 0 },
        weight: { closing_opening: 0, secondary_sale: 0, closing_stock: 0 },
      };
      byKey.set(key, row);
    }
    row.qty[l.stage] += Number(l.qty);
    row.weight[l.stage] += Number(l.weight_total_kg || 0);
  }
  return Array.from(byKey.values()).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

export default function AdminSecondaryReportsPage() {
  const [tab, setTab] = useState<Tab>("data");
  const [config, setConfig] = useState<SecondaryReportSettingsInfo | null>(null);
  const [towns, setTowns] = useState<Town[]>([]);
  const [reports, setReports] = useState<SecondaryReport[]>([]);
  const [tos, setTos] = useState<TOWithTowns[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<SecondaryReport | null>(null);

  // Data-tab filter: "all" or a specific month / year.
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const filterInitialisedRef = useRef(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, repRes, tosRes, townsRes] = await Promise.all([
        fetch(`/api/admin/secondary-report-settings?t=${Date.now()}`, { cache: "no-store" }),
        fetch("/api/admin/secondary-reports", { cache: "no-store" }),
        fetch("/api/admin/tos", { cache: "no-store" }),
        fetch("/api/admin/towns", { cache: "no-store" }),
      ]);
      const cfg = await cfgRes.json();
      const rep = await repRes.json();
      const tosJson = await tosRes.json();
      const townsJson = await townsRes.json();
      if (!cfgRes.ok) throw new Error(cfg.error || "Failed to load settings");
      if (!repRes.ok) throw new Error(rep.error || "Failed to load reports");
      if (!tosRes.ok) throw new Error(tosJson.error || "Failed to load TO's");
      if (!townsRes.ok) throw new Error(townsJson.error || "Failed to load towns");
      setConfig(cfg.settings);
      setReports(rep.reports ?? []);
      setTos(tosJson.tos ?? []);
      setTowns(townsJson.towns ?? []);

      // First load: start the Data tab on the period the admin has open.
      if (!filterInitialisedRef.current) {
        filterInitialisedRef.current = true;
        setFilterMonth(String(cfg.settings.month));
        setFilterYear(String(cfg.settings.year));
      }
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Saves ON/OFF and/or the month, then shows exactly what the server stored.
  async function saveSettings(patch: { enabled?: boolean; selected_month?: number }) {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/secondary-report-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to save settings");

      const saved: SecondaryReportSettingsInfo = json.settings;
      setConfig(saved);
      if (patch.selected_month !== undefined) {
        setFilterMonth(String(saved.month));
        setFilterYear(String(saved.year));
      }
      setStatus("Saved.");
    } catch (err: any) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function deleteReport(report: SecondaryReport) {
    if (
      !confirm(
        `Delete the report filed by ${report.to_name} (${report.town_name})?\n\nThis lets that town file again for ${monthLabel(
          report.report_month,
          report.report_year
        )}.`
      )
    )
      return;
    const res = await fetch(`/api/admin/secondary-reports/${report.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to delete report");
      return;
    }
    if (viewing?.id === report.id) setViewing(null);
    loadAll();
  }

  const yearOptions = useMemo(() => {
    const years = new Set<number>(reports.map((r) => r.report_year));
    if (config) years.add(config.year);
    return Array.from(years).sort((a, b) => b - a);
  }, [reports, config]);

  const filtered = useMemo(() => {
    return reports.filter(
      (r) =>
        (filterMonth === "all" || r.report_month === parseInt(filterMonth, 10)) &&
        (filterYear === "all" || r.report_year === parseInt(filterYear, 10))
    );
  }, [reports, filterMonth, filterYear]);

  // For a specific month + year: which towns can file but haven't yet —
  // the towns that belong to an active TO.
  const pendingTowns = useMemo(() => {
    if (filterMonth === "all" || filterYear === "all") return null;
    const filedTownIds = new Set(filtered.map((r) => r.town_id));
    const townsWithTo = new Set(tos.filter((t) => t.is_active).flatMap((t) => t.towns.map((x) => x.id)));
    return towns.filter((t) => t.is_active && townsWithTo.has(t.id) && !filedTownIds.has(t.id));
  }, [filtered, tos, towns, filterMonth, filterYear]);

  async function downloadExcel() {
    const XLSX = await import("xlsx");

    const summaryRows = filtered.map((r) => ({
      Town: r.town_name,
      "TO's Name": r.to_name,
      "Closing/Opening Month": monthLabel(prevOf(r.report_month, r.report_year).month, prevOf(r.report_month, r.report_year).year),
      "Sale / Closing Stock Month": monthLabel(r.report_month, r.report_year),
      "Filed At": formatFiledAt(r.created_at),
      "Closing/Opening Wt (kg)": Number(stageWeight(r, "closing_opening").toFixed(2)),
      "Secondary Sale Wt (kg)": Number(stageWeight(r, "secondary_sale").toFixed(2)),
      "Closing Stock Wt (kg)": Number(stageWeight(r, "closing_stock").toFixed(2)),
      "Stock Check": checkLabel(r.check_status),
      "Ghee Diff (t)": r.check_data?.diff ? r.check_data.diff.ghee : "",
      "Oil Diff (t)": r.check_data?.diff ? r.check_data.diff.oil : "",
      "RSO Diff (t)": r.check_data?.diff ? r.check_data.diff.rso : "",
      "Total Diff (t)": r.check_data?.diff ? r.check_data.diff.total : "",
    }));

    const detailRows: Record<string, string | number>[] = [];
    for (const r of filtered) {
      for (const row of buildItemMatrix(r)) {
        detailRows.push({
          Town: r.town_name,
          "TO's Name": r.to_name,
          Month: monthLabel(r.report_month, r.report_year),
          Item: row.name,
          "Closing/Opening Qty": row.qty.closing_opening,
          "Secondary Sale Qty": row.qty.secondary_sale,
          "Closing Stock Qty": row.qty.closing_stock,
          "Closing/Opening Wt (kg)": Number(row.weight.closing_opening.toFixed(2)),
          "Secondary Sale Wt (kg)": Number(row.weight.secondary_sale.toFixed(2)),
          "Closing Stock Wt (kg)": Number(row.weight.closing_stock.toFixed(2)),
        });
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "Summary");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), "Items");

    const m = filterMonth === "all" ? "all-months" : MONTH_NAMES[parseInt(filterMonth, 10) - 1].toLowerCase();
    const y = filterYear === "all" ? "all-years" : filterYear;
    XLSX.writeFile(workbook, `secondary-reports-${m}-${y}.xlsx`);
  }

  const prev = config ? { month: config.prev_month, year: config.prev_year } : null;

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fffdf5", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 6, height: 24, background: YELLOW, borderRadius: 3 }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: NAVY, margin: 0 }}>TO&apos;s Secondary Ach. Reports</h1>
          {config && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 12,
                padding: "3px 10px",
                color: config.enabled ? "#1b8a3d" : "#888",
                background: config.enabled ? "#e6f4ea" : "#eee",
              }}
            >
              Page {config.enabled ? "ON" : "OFF"}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          {(["data", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: "7px 16px",
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 8,
                cursor: "pointer",
                border: `1px solid ${NAVY}`,
                color: tab === t ? "#fff" : NAVY,
                background: tab === t ? NAVY : "#fff",
              }}
            >
              {t === "data" ? "Data" : "Settings"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ color: RED, background: "#fdecec", border: "1px solid #f6c9c9", borderRadius: 6, padding: "6px 10px", marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}
      {status && (
        <div style={{ color: NAVY, background: "#eef3fb", border: "1px solid #cddaf0", borderRadius: 6, padding: "6px 10px", marginBottom: 12, fontSize: 13 }}>
          {status}
        </div>
      )}

      {loading && !config ? (
        <p>Loading...</p>
      ) : tab === "settings" ? (
        // ------------------------------------------------------------ SETTINGS
        config && prev && (
          <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
            <section style={cardStyle}>
              <h2 style={cardTitleStyle}>Report page</h2>
              <button
                type="button"
                disabled={saving}
                onClick={() => saveSettings({ enabled: !config.enabled })}
                style={{
                  padding: "9px 22px",
                  fontSize: 14,
                  fontWeight: 700,
                  borderRadius: 20,
                  border: "none",
                  cursor: saving ? "default" : "pointer",
                  color: "#fff",
                  background: config.enabled ? "#1b8a3d" : "#888",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Saving..." : config.enabled ? "ON — click to turn OFF" : "OFF — click to turn ON"}
              </button>
            </section>

            <section style={cardStyle}>
              <h2 style={cardTitleStyle}>Report month</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <select
                  value={config.selected_month}
                  disabled={saving}
                  onChange={(e) => saveSettings({ selected_month: parseInt(e.target.value, 10) })}
                  style={{ ...inputStyle, width: 180 }}
                >
                  {MONTH_NAMES.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 14, color: NAVY, fontWeight: 700 }}>{config.year}</span>
              </div>

              <div style={{ border: "1px solid #e6e9ef", borderRadius: 8, background: "#fafbfd", padding: "10px 12px", fontSize: 13, color: "#444", lineHeight: 1.9 }}>
                <div>
                  <strong>Page 1</strong> — Closing/Opening Report <strong>[{monthLabel(prev.month, prev.year)}]</strong>
                </div>
                <div>
                  <strong>Page 2</strong> — Secondary Sale <strong>[{monthLabel(config.month, config.year)}]</strong>
                </div>
                <div>
                  <strong>Page 3</strong> — Closing Stock <strong>[{monthLabel(config.month, config.year)}]</strong>
                </div>
              </div>
            </section>

            <StockSheetCard month={config.month} year={config.year} />
          </div>
        )
      ) : (
        // ------------------------------------------------------------ DATA
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <label style={{ fontSize: 13, color: "#666", fontWeight: 600 }}>Month</label>
            <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} style={{ ...inputStyle, width: 150 }}>
              <option value="all">All months</option>
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
            <label style={{ fontSize: 13, color: "#666", fontWeight: 600 }}>Year</label>
            <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} style={{ ...inputStyle, width: 110 }}>
              <option value="all">All years</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button type="button" onClick={loadAll} style={secondaryButtonStyle}>
                Refresh
              </button>
              <button
                type="button"
                onClick={downloadExcel}
                disabled={filtered.length === 0}
                style={{ ...buttonStyle, opacity: filtered.length === 0 ? 0.6 : 1, cursor: filtered.length === 0 ? "default" : "pointer" }}
              >
                Download Excel
              </button>
            </div>
          </div>

          <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>
            <strong>{filtered.length}</strong> report{filtered.length === 1 ? "" : "s"} filed
            {pendingTowns && (
              <>
                {" "}
                · <strong>{pendingTowns.length}</strong> not filed yet
              </>
            )}
          </div>

          {filtered.length === 0 ? (
            <p style={{ color: "#666", fontSize: 14 }}>No reports filed for this selection.</p>
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${YELLOW}`, borderRadius: 10, background: "#fff" }}>
              <table style={{ width: "100%", minWidth: 840, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", background: NAVY }}>
                    <th style={thStyle}>Sr#</th>
                    <th style={thStyle}>Town</th>
                    <th style={thStyle}>TO&apos;s Name</th>
                    <th style={thStyle}>Month</th>
                    <th style={thStyle}>Filed at</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Opening kg</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Sale kg</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Closing kg</th>
                    <th style={thStyle}>Check</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #f3e6b0" }}>
                      <td style={{ ...tdStyle, color: "#888", textAlign: "center" }}>{i + 1}</td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: NAVY }}>{r.town_name}</td>
                      <td style={tdStyle}>{r.to_name}</td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{monthLabel(r.report_month, r.report_year)}</td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#666" }}>{formatFiledAt(r.created_at)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {stageWeight(r, "closing_opening").toFixed(2)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {stageWeight(r, "secondary_sale").toFixed(2)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {stageWeight(r, "closing_stock").toFixed(2)}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        <CheckBadge status={r.check_status} />
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        <button onClick={() => setViewing(r)} style={moveButtonStyle}>
                          View
                        </button>
                        <button onClick={() => deleteReport(r)} style={{ ...moveButtonStyle, color: RED, borderColor: "#f0b8b8" }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pendingTowns && pendingTowns.length > 0 && (
            <section style={{ ...cardStyle, marginTop: 18 }}>
              <h2 style={cardTitleStyle}>Not filed yet ({monthLabel(parseInt(filterMonth, 10), parseInt(filterYear, 10))})</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {pendingTowns.map((t) => (
                  <span
                    key={t.id}
                    style={{ fontSize: 12, background: "#fff4e0", color: "#8a4b00", border: "1px solid #f3dcae", borderRadius: 14, padding: "3px 10px" }}
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {viewing && <ReportDetailModal report={viewing} onClose={() => setViewing(null)} onDelete={() => deleteReport(viewing)} />}
    </main>
  );
}

function ReportDetailModal({
  report,
  onClose,
  onDelete,
}: {
  report: SecondaryReport;
  onClose: () => void;
  onDelete: () => void;
}) {
  const matrix = useMemo(() => buildItemMatrix(report), [report]);
  const prev = prevOf(report.report_month, report.report_year);

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalBoxStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 17, margin: "0 0 2px", color: NAVY }}>
          {report.town_name} — {report.to_name}
        </h2>
        <p style={{ fontSize: 12, color: "#666", margin: "0 0 12px", lineHeight: 1.6 }}>
          Closing/Opening: <strong>{monthLabel(prev.month, prev.year)}</strong> · Secondary Sale &amp; Closing Stock:{" "}
          <strong>{monthLabel(report.report_month, report.report_year)}</strong>
          <br />
          Filed {formatFiledAt(report.created_at)}
        </p>

        <StockCheckTable check={report.check_data} />

        <div style={{ maxHeight: 420, overflow: "auto", border: "1px solid #eee", borderRadius: 8, marginBottom: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f5f6f8", textAlign: "left", position: "sticky", top: 0 }}>
                <th style={{ padding: "6px 8px" }}>Item</th>
                {STAGES.map((s) => (
                  <th key={s.key} style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.name} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: "6px 8px" }}>{row.name}</td>
                  {STAGES.map((s) => (
                    <td key={s.key} style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: row.qty[s.key] ? "#111" : "#bbb" }}>
                      {row.qty[s.key] || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid #ddd", background: "#fff4e0", fontWeight: 700 }}>
                <td style={{ padding: "7px 8px" }}>Total weight (kg)</td>
                {STAGES.map((s) => (
                  <td key={s.key} style={{ padding: "7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {stageWeight(report, s.key).toFixed(2)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
          <button type="button" onClick={onDelete} style={{ ...secondaryButtonStyle, color: RED, borderColor: "#f0b8b8" }}>
            Delete report
          </button>
          <button type="button" onClick={onClose} style={buttonStyle}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: `1px solid ${YELLOW}`,
  borderRadius: 10,
  padding: 16,
  boxShadow: "0 2px 8px rgba(11,43,91,0.06)",
};

const cardTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: NAVY, margin: "0 0 6px" };

const inputStyle: React.CSSProperties = {
  minWidth: 0,
  boxSizing: "border-box",
  padding: "8px 10px",
  border: "1px solid #d9dde6",
  borderRadius: 6,
  fontSize: 13,
  background: "#fff",
};

const buttonStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: NAVY,
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#fff",
  color: NAVY,
  border: `1px solid ${NAVY}`,
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

const moveButtonStyle: React.CSSProperties = {
  border: `1px solid ${YELLOW}`,
  background: "#fff",
  color: NAVY,
  borderRadius: 4,
  padding: "2px 8px",
  cursor: "pointer",
  marginRight: 4,
  fontWeight: 600,
  fontSize: 12,
};

const thStyle: React.CSSProperties = { padding: "9px 8px", fontSize: 13, color: "#fff", fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: "7px 8px", fontSize: 13 };

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2000,
  padding: 16,
};

const modalBoxStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 22,
  width: "100%",
  maxWidth: 620,
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};
