// Destination: app/admin/reports/StockSheetCard.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TOWithTowns } from "@/lib/types";
import { MONTH_NAMES, monthLabel } from "@/lib/secondaryReport";
import { nameKey } from "@/lib/stockCheck";
import { ParsedSheet, ParsedSheetRow, parseStockSheet } from "@/lib/stockSheetParse";

const NAVY = "#0b2b5b";
const YELLOW = "#F6C90E";
const RED = "#D62828";

interface SheetSummary {
  id: string;
  report_month: number;
  report_year: number;
  file_name: string | null;
  uploaded_at: string;
  has_file: boolean; // a copy of the original Excel file was kept
  rows: number;
  matched: number;
}

interface Preview {
  fileName: string;
  fileData: string | null; // base64 of the uploaded file (new uploads only)
  parsed: ParsedSheet;
  rows: ParsedSheetRow[];
  rowIds: string[]; // saved row ids (when reviewing a saved file)
  toIds: string[]; // chosen TO for each row ("" = not matched)
  month: number;
  year: number;
  sheetId: string | null; // set when reviewing a saved file
}

// base64 of the file, so the original can be downloaded again exactly as uploaded
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
  return btoa(bin);
}

// Reads the first sheet in the workbook that looks like the "Town wise Closing
// Stock Report" (headers are found by reading them, not by cell address).
async function readWorkbook(file: File): Promise<ParsedSheet> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, cellFormula: true, cellStyles: true });
  let firstError = "";
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws["!ref"]) continue;
    // start at A1 so row/column numbers line up with Excel
    const ref = XLSX.utils.decode_range(ws["!ref"]);
    ref.s = { r: 0, c: 0 };
    const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null, range: ref });
    const hidden = new Set<number>();
    (ws["!cols"] ?? []).forEach((c: any, i: number) => {
      if (c && c.hidden) hidden.add(i);
    });
    try {
      return parseStockSheet(aoa, {
        hiddenCols: hidden,
        formulaAt: (r, c) => ws[XLSX.utils.encode_cell({ r, c })]?.f,
      });
    } catch (e: any) {
      if (!firstError) firstError = e.message;
    }
  }
  throw new Error(firstError || "This file has no sheet to read.");
}

function formatWhen(iso: string): string {
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

const f3 = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toFixed(3));

export default function StockSheetCard({ month, year }: { month: number; year: number }) {
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [tos, setTos] = useState<TOWithTowns[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null); // "upload" | "save" | a file id
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, tRes] = await Promise.all([
        fetch("/api/admin/stock-sheet", { cache: "no-store" }),
        fetch("/api/admin/tos", { cache: "no-store" }),
      ]);
      const sJson = await sRes.json();
      const tJson = await tRes.json();
      if (!sRes.ok) throw new Error(sJson.error || "Failed to load the stock sheets");
      setSheets(sJson.sheets ?? []);
      setTos(tRes.ok ? tJson.tos ?? [] : []);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load the stock sheets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-match every sheet row to a TO by name. An exact name (ignoring case and
  // spaces) wins first; after that case, dots and word order don't matter
  // ("M. Riaz Amin" = "m riaz  amin"). A TO is never given to two rows
  // automatically — rows that stay unmatched can be set by hand.
  const autoMatchAll = useCallback(
    (names: string[]): string[] => {
      const result: string[] = names.map(() => "");
      const taken = new Set<string>();
      const lowerTrim = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
      names.forEach((n, i) => {
        const t = tos.find((x) => !taken.has(x.id) && lowerTrim(x.name) === lowerTrim(n));
        if (t) {
          result[i] = t.id;
          taken.add(t.id);
        }
      });
      names.forEach((n, i) => {
        if (result[i]) return;
        const t = tos.find((x) => !taken.has(x.id) && nameKey(x.name) === nameKey(n));
        if (t) {
          result[i] = t.id;
          taken.add(t.id);
        }
      });
      return result;
    },
    [tos]
  );

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    setBusyId("upload");
    setError(null);
    setStatus(null);
    try {
      const parsed = await readWorkbook(file);
      const fileData = await fileToBase64(file);
      setPreview({
        fileName: file.name,
        fileData: fileData.length <= 5_500_000 ? fileData : null,
        parsed,
        rows: parsed.rows,
        rowIds: [],
        toIds: autoMatchAll(parsed.rows.map((r) => r.to_name)),
        month: parsed.period?.month ?? month,
        year: parsed.period?.year ?? year,
        sheetId: null,
      });
    } catch (err: any) {
      setError(err.message || "Could not read this file.");
    } finally {
      setBusyId(null);
    }
  }

  // Re-open a saved file to fix which TO each row is matched to (e.g. after adding a TO).
  async function reviewSaved(sheet: SheetSummary) {
    setBusyId(sheet.id);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/stock-sheet?id=${sheet.id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.sheet) throw new Error(json.error || "Failed to open the file");
      const saved: any[] = json.rows ?? [];
      const rows: ParsedSheetRow[] = saved.map((r) => ({
        row_no: r.row_no,
        to_name: r.sheet_to_name,
        towns: r.sheet_towns ?? "",
        opening: { ghee: r.opening_ghee, oil: r.opening_oil, rso: r.opening_rso },
        primary: { ghee: Number(r.primary_ghee), oil: Number(r.primary_oil), rso: Number(r.primary_rso) },
        secondary: { ghee: r.secondary_ghee, oil: r.secondary_oil, rso: r.secondary_rso },
        closing: { ghee: r.closing_ghee, oil: r.closing_oil, rso: r.closing_rso },
        remarks: r.remarks ?? "",
      }));
      // keep links already saved; try to match the rest by name
      const auto = autoMatchAll(saved.map((r) => r.sheet_to_name));
      const used = new Set(saved.map((r) => r.to_id).filter(Boolean));
      setPreview({
        fileName: sheet.file_name ?? "",
        fileData: null,
        parsed: { rows, period: { month: sheet.report_month, year: sheet.report_year }, warnings: [], formulaChecked: false, formulaOk: false },
        rows,
        rowIds: saved.map((r) => r.id),
        toIds: saved.map((r, i) => r.to_id || (auto[i] && !used.has(auto[i]) ? auto[i] : "")),
        month: sheet.report_month,
        year: sheet.report_year,
        sheetId: sheet.id,
      });
    } catch (err: any) {
      setError(err.message || "Failed to open the file");
    } finally {
      setBusyId(null);
    }
  }

  async function save() {
    if (!preview) return;
    setBusyId("save");
    setError(null);
    try {
      if (preview.sheetId) {
        // reviewing a saved file: only the TO matching changes — the file itself is left as it is
        const res = await fetch(`/api/admin/stock-sheet?id=${preview.sheetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ links: preview.rowIds.map((id, i) => ({ id, to_id: preview.toIds[i] || null })) }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Failed to save the matching");
        setStatus(`Matching saved — ${json.matched} of ${json.rows} rows matched to TO's.`);
      } else {
        const res = await fetch("/api/admin/stock-sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            report_month: preview.month,
            report_year: preview.year,
            file_name: preview.fileName,
            file_data: preview.fileData,
            rows: preview.rows.map((r, i) => ({ ...r, to_id: preview.toIds[i] || null })),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Failed to save the stock sheet");
        let msg = `Saved ${json.saved} rows for ${monthLabel(preview.month, preview.year)} — ${json.matched} matched to TO's.`;
        if (preview.fileData && json.file_stored === false) {
          msg += " A copy of the file could not be kept (run migration_v11_stock_sheet_file.sql); its download will be rebuilt in the same layout.";
        }
        setStatus(msg);
      }
      setPreview(null);
      load();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(sheet: SheetSummary) {
    if (!confirm(`Delete the stock sheet for ${monthLabel(sheet.report_month, sheet.report_year)}${sheet.file_name ? ` (${sheet.file_name})` : ""}? Reports will no longer be compared with it.`)) return;
    setBusyId(sheet.id);
    setError(null);
    const res = await fetch(`/api/admin/stock-sheet?id=${sheet.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to delete the file");
    } else {
      setStatus(`Deleted the ${monthLabel(sheet.report_month, sheet.report_year)} file.`);
    }
    setBusyId(null);
    load();
  }

  const busy = busyId !== null;

  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <h2 style={{ ...cardTitleStyle, margin: 0 }}>Stock sheets</h2>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy || loading} style={{ ...buttonStyle, opacity: busy ? 0.7 : 1 }}>
          {busyId === "upload" ? "Reading..." : "Upload Excel"}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: "none" }} />
      </div>

      {error && <div style={errorStyle}>{error}</div>}
      {status && <div style={statusStyle}>{status}</div>}

      {loading ? (
        <p style={{ fontSize: 13, color: "#666", margin: 0 }}>Loading...</p>
      ) : sheets.length === 0 ? (
        <p style={{ fontSize: 13, color: "#666", margin: 0 }}>No file uploaded yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {sheets.map((sh) => {
            const current = sh.report_month === month && sh.report_year === year;
            return (
              <div
                key={sh.id}
                style={{
                  border: `1px solid ${current ? YELLOW : "#e6e9ef"}`,
                  background: current ? "#fffbea" : "#fafbfd",
                  borderRadius: 8,
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0, fontSize: 13, lineHeight: 1.7 }}>
                  <div style={{ fontWeight: 700, color: NAVY }}>
                    {monthLabel(sh.report_month, sh.report_year)}
                    {current && (
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "#8a4b00", background: "#fff4e0", borderRadius: 10, padding: "1px 8px" }}>
                        Report month
                      </span>
                    )}
                  </div>
                  <div style={{ color: "#333", wordBreak: "break-word" }}>{sh.file_name || "Uploaded file"}</div>
                  <div style={{ color: "#666", fontSize: 12 }}>
                    {formatWhen(sh.uploaded_at)} · {sh.rows} rows · {sh.matched} matched to TO&apos;s
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <a
                    href={`/api/admin/stock-sheet/download?id=${sh.id}`}
                    title={sh.has_file ? "The file exactly as uploaded" : "Rebuilt in the same layout"}
                    style={{ ...secondaryButtonStyle, textDecoration: "none", display: "inline-block", padding: "6px 12px" }}
                  >
                    Download
                  </a>
                  <button type="button" onClick={() => reviewSaved(sh)} disabled={busy} style={{ ...secondaryButtonStyle, padding: "6px 12px" }}>
                    {busyId === sh.id ? "Opening..." : "Review matching"}
                  </button>
                  <button type="button" onClick={() => remove(sh)} disabled={busy} style={{ ...secondaryButtonStyle, padding: "6px 12px", color: RED, borderColor: "#f0b8b8" }}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {preview && (
        <PreviewModal
          preview={preview}
          tos={tos}
          saving={busyId === "save"}
          replacing={!preview.sheetId && sheets.some((x) => x.report_month === preview.month && x.report_year === preview.year)}
          onChange={setPreview}
          onCancel={() => setPreview(null)}
          onSave={save}
        />
      )}
    </section>
  );
}

function PreviewModal({
  preview,
  tos,
  saving,
  replacing,
  onChange,
  onCancel,
  onSave,
}: {
  preview: Preview;
  tos: TOWithTowns[];
  saving: boolean;
  replacing: boolean;
  onChange: (p: Preview) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { parsed, rows, toIds } = preview;
  const matched = toIds.filter(Boolean).length;
  const usedToIds = new Set(toIds.filter(Boolean));
  const notInSheet = tos.filter((t) => t.is_active && t.towns.length > 0 && !usedToIds.has(t.id));

  // sheet totals (tons) — Ghee / Oil / RSO
  const totals = rows.reduce(
    (acc, r) => ({
      ghee: acc.ghee + (r.primary.ghee ?? 0),
      oil: acc.oil + (r.primary.oil ?? 0),
      rso: acc.rso + (r.primary.rso ?? 0),
    }),
    { ghee: 0, oil: 0, rso: 0 }
  );

  const years = [preview.year - 1, preview.year, preview.year + 1];

  return (
    <div style={overlayStyle} onClick={() => !saving && onCancel()}>
      <div style={boxStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 17, margin: "0 0 4px", color: NAVY }}>Review stock sheet</h2>
        <p style={{ fontSize: 12, color: "#666", margin: "0 0 10px" }}>{preview.fileName}</p>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10, fontSize: 13 }}>
          <span style={{ fontWeight: 600, color: "#666" }}>Month</span>
          <select
            value={preview.month}
            onChange={(e) => onChange({ ...preview, month: parseInt(e.target.value, 10) })}
            style={{ ...inputStyle, width: 140 }}
            disabled={!!preview.sheetId}
          >
            {MONTH_NAMES.map((n, i) => (
              <option key={n} value={i + 1}>
                {n}
              </option>
            ))}
          </select>
          <select
            value={preview.year}
            onChange={(e) => onChange({ ...preview, year: parseInt(e.target.value, 10) })}
            style={{ ...inputStyle, width: 90 }}
            disabled={!!preview.sheetId}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {replacing && <span style={{ color: "#8a4b00", fontSize: 12 }}>This replaces the file already saved for this month.</span>}
        </div>

        {parsed.formulaChecked && parsed.formulaOk && (
          <div style={{ ...statusStyle, marginBottom: 8 }}>
            Formula in the file: Closing = Opening + Primary − Secondary ✓
          </div>
        )}
        {parsed.warnings.map((w, i) => (
          <div key={i} style={{ ...warnStyle, marginBottom: 8 }}>
            {w}
          </div>
        ))}

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, background: "#fff4e0", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
          <strong style={{ color: "#8a4b00" }}>Primary total (tons)</strong>
          <span>Ghee <strong>{f3(totals.ghee)}</strong></span>
          <span>Oil <strong>{f3(totals.oil)}</strong></span>
          <span>RSO <strong>{f3(totals.rso)}</strong></span>
        </div>

        <div style={{ maxHeight: 330, overflow: "auto", border: "1px solid #eee", borderRadius: 8, marginBottom: 10 }}>
          <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f5f6f8", textAlign: "left", position: "sticky", top: 0 }}>
                <th style={th}>#</th>
                <th style={th}>TO in the file</th>
                <th style={th}>Towns</th>
                <th style={{ ...th, textAlign: "right" }}>Ghee</th>
                <th style={{ ...th, textAlign: "right" }}>Oil</th>
                <th style={{ ...th, textAlign: "right" }}>RSO</th>
                <th style={th}>Matched TO</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.row_no}-${i}`} style={{ borderTop: "1px solid #eee", background: toIds[i] ? undefined : "#fdecec" }}>
                  <td style={{ ...td, color: "#888" }}>{r.row_no}</td>
                  <td style={{ ...td, fontWeight: 600, color: NAVY }}>{r.to_name}</td>
                  <td style={{ ...td, color: "#666" }}>{r.towns}</td>
                  <td style={{ ...td, textAlign: "right" }}>{f3(r.primary.ghee)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{f3(r.primary.oil)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{f3(r.primary.rso)}</td>
                  <td style={td}>
                    <select
                      value={toIds[i]}
                      onChange={(e) => {
                        const next = toIds.slice();
                        next[i] = e.target.value;
                        onChange({ ...preview, toIds: next });
                      }}
                      style={{ ...inputStyle, width: "100%", minWidth: 150, padding: "4px 6px", fontSize: 12 }}
                    >
                      <option value="">— not matched —</option>
                      {tos.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 12, color: "#444", lineHeight: 1.7, marginBottom: 12 }}>
          <div>
            <strong>{matched}</strong> of <strong>{rows.length}</strong> rows matched to a TO.
            {matched < rows.length && <span style={{ color: RED }}> Rows left unmatched are not compared.</span>}
          </div>
          {notInSheet.length > 0 && (
            <div style={{ color: "#8a4b00" }}>
              TO&apos;s with towns but no row in this file: {notInSheet.map((t) => t.name).join(", ")}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} disabled={saving} style={secondaryButtonStyle}>
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={saving} style={buttonStyle}>
            {saving ? "Saving..." : preview.sheetId ? "Save matching" : "Save"}
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
const cardTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: NAVY, margin: "0 0 8px" };
const errorStyle: React.CSSProperties = { color: RED, background: "#fdecec", border: "1px solid #f6c9c9", borderRadius: 6, padding: "6px 10px", marginBottom: 10, fontSize: 13 };
const statusStyle: React.CSSProperties = { color: NAVY, background: "#eef3fb", border: "1px solid #cddaf0", borderRadius: 6, padding: "6px 10px", marginBottom: 10, fontSize: 13 };
const warnStyle: React.CSSProperties = { color: "#8a4b00", background: "#fff4e0", border: "1px solid #f3dcae", borderRadius: 6, padding: "6px 10px", fontSize: 12 };
const inputStyle: React.CSSProperties = { boxSizing: "border-box", padding: "7px 9px", border: "1px solid #d9dde6", borderRadius: 6, fontSize: 13, background: "#fff" };
const buttonStyle: React.CSSProperties = { padding: "8px 16px", background: NAVY, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 };
const secondaryButtonStyle: React.CSSProperties = { padding: "8px 16px", background: "#fff", color: NAVY, border: `1px solid ${NAVY}`, borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 };
const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 700 };
const td: React.CSSProperties = { padding: "5px 8px" };
const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 16 };
const boxStyle: React.CSSProperties = { background: "#fff", borderRadius: 12, padding: 22, width: "100%", maxWidth: 820, maxHeight: "92vh", overflow: "auto", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" };
