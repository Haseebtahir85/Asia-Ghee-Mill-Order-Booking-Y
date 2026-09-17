"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Order, OrderStatus } from "@/lib/types";

const NAVY = "#0b2b5b";
const YELLOW = "#F6C90E";
const RED = "#D62828";

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "issue", label: "Issue" },
  { value: "done", label: "Done" },
];

const STATUS_STYLES: Record<OrderStatus, { color: string; background: string }> = {
  pending: { color: "#8a6608", background: "#fff4d6" },
  issue: { color: RED, background: "#fdecec" },
  done: { color: "#1b8a3d", background: "#e6f4ea" },
};

type OrdersTab = "new" | "all";

// order_date is a plain date (no time); created_at is the full
// timestamp — this formats that in Pakistan time, matching the clock
// convention used elsewhere in the app.
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const datePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${datePart}, ${timePart}`;
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Returns a plain YYYY-MM-DD string for "today" in Pakistan time, so
// presets line up with the same calendar day the rest of the app uses.
function todayInKarachi(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfWeek(dateStr: string): string {
  // Monday as the first day of the week
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1;
  return addDays(dateStr, -diff);
}

function startOfMonth(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function endOfLastMonth(dateStr: string): string {
  return addDays(startOfMonth(dateStr), -1);
}

function startOfLastMonth(dateStr: string): string {
  return startOfMonth(endOfLastMonth(dateStr));
}

type PresetKey = "today" | "yesterday" | "last3" | "lastWeek" | "lastMonth";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last3", label: "Last 3 Days" },
  { key: "lastWeek", label: "Last Week" },
  { key: "lastMonth", label: "Last Month" },
];

function getPresetRange(key: PresetKey): { from: string; to: string } {
  const today = todayInKarachi();
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "last3":
      return { from: addDays(today, -2), to: today };
    case "lastWeek": {
      const thisWeekStart = startOfWeek(today);
      const lastWeekStart = addDays(thisWeekStart, -7);
      const lastWeekEnd = addDays(thisWeekStart, -1);
      return { from: lastWeekStart, to: lastWeekEnd };
    }
    case "lastMonth":
      return { from: startOfLastMonth(today), to: endOfLastMonth(today) };
    default:
      return { from: "", to: "" };
  }
}

// Builds a Monday-first month grid: an array of weeks, each with 7
// entries that are either a "YYYY-MM-DD" string or null for the
// leading/trailing blanks outside the month.
function getMonthMatrix(year: number, monthIdx: number): (string | null)[][] {
  const firstOfMonth = new Date(year, monthIdx, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// A single control that opens a popover with quick presets (Today,
// Yesterday, Last 3 Days, Last Week, Last Month) alongside a real
// calendar grid. Selection is click-click: the first click sets the
// start day (shown selected, popover stays open), the second click on
// the same calendar sets the end day and closes the popover — it never
// closes after just one date.
function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const base = from || to || todayInKarachi();
    const d = new Date(base + "T00:00:00");
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setPendingStart(null);
    setHoverDate(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const activePreset = useMemo<PresetKey | null>(() => {
    for (const p of PRESETS) {
      const r = getPresetRange(p.key);
      if (r.from === from && r.to === to) return p.key;
    }
    return null;
  }, [from, to]);

  const label =
    from && to
      ? from === to
        ? formatDateLabel(from)
        : `${formatDateLabel(from)} – ${formatDateLabel(to)}`
      : from
      ? `From ${formatDateLabel(from)}`
      : to
      ? `Until ${formatDateLabel(to)}`
      : "All dates";

  function applyPreset(key: PresetKey) {
    const r = getPresetRange(key);
    onChange(r.from, r.to);
    setOpen(false);
  }

  function clearAll() {
    onChange("", "");
    setPendingStart(null);
    setHoverDate(null);
    setOpen(false);
  }

  function goPrevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function goNextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  // First click on a day: just marks it as the pending start — the
  // popover stays open. Second click: whichever day you click becomes
  // the other end of the range (ordered chronologically regardless of
  // which one you clicked first), and only THEN does it close.
  function handleDayClick(dateStr: string) {
    if (!pendingStart) {
      setPendingStart(dateStr);
      setHoverDate(null);
      return;
    }
    const a = pendingStart;
    const b = dateStr;
    onChange(a < b ? a : b, a < b ? b : a);
    setPendingStart(null);
    setHoverDate(null);
    setOpen(false);
  }

  // While only the start has been clicked, hovering previews the
  // range that would result from clicking the hovered day next.
  const displayFrom = pendingStart
    ? hoverDate
      ? (pendingStart < hoverDate ? pendingStart : hoverDate)
      : pendingStart
    : from;
  const displayTo = pendingStart
    ? hoverDate
      ? (pendingStart < hoverDate ? hoverDate : pendingStart)
      : pendingStart
    : to;

  const weeks = getMonthMatrix(viewYear, viewMonth);
  const today = todayInKarachi();

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <label style={labelStyle}>Date range</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ ...filterInputStyle, textAlign: "left", cursor: "pointer", minWidth: 190 }}
      >
        {label}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 30,
            background: "#fff",
            border: `1px solid ${YELLOW}`,
            borderRadius: 8,
            boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
            padding: 12,
            display: "flex",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 120, borderRight: "1px solid #f0e6bf", paddingRight: 12 }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  fontSize: 13,
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: activePreset === p.key ? NAVY : "transparent",
                  color: activePreset === p.key ? "#fff" : "#333",
                  fontWeight: activePreset === p.key ? 600 : 500,
                }}
              >
                {p.label}
              </button>
            ))}
            <div style={{ marginTop: "auto", paddingTop: 8 }}>
              <button
                type="button"
                onClick={clearAll}
                style={{ background: "none", border: "none", color: "#888", fontSize: 12, cursor: "pointer", padding: 0 }}
              >
                Clear
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 230 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button type="button" onClick={goPrevMonth} style={navButtonStyle} aria-label="Previous month">‹</button>
              <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>
                {MONTH_LABELS[viewMonth]} {viewYear}
              </div>
              <button type="button" onClick={goNextMonth} style={navButtonStyle} aria-label="Next month">›</button>
            </div>

            <div style={{ fontSize: 11, color: "#888", textAlign: "center" }}>
              {pendingStart ? "Now click the end day" : "Click the start day"}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
              {WEEKDAY_LABELS.map((wd) => (
                <div key={wd} style={{ fontSize: 10, color: "#999", textAlign: "center", fontWeight: 600, padding: "2px 0" }}>
                  {wd}
                </div>
              ))}
              {weeks.flatMap((week, wi) =>
                week.map((dateStr, di) => {
                  if (!dateStr) return <div key={`${wi}-${di}`} />;

                  const inPreview = displayFrom && displayTo && dateStr >= displayFrom && dateStr <= displayTo;
                  const isEndpoint = dateStr === displayFrom || dateStr === displayTo;
                  const isToday = dateStr === today;

                  return (
                    <div
                      key={dateStr}
                      onClick={() => handleDayClick(dateStr)}
                      onMouseEnter={() => {
                        if (pendingStart) setHoverDate(dateStr);
                      }}
                      style={{
                        textAlign: "center",
                        padding: "5px 0",
                        fontSize: 12,
                        borderRadius: isEndpoint ? 6 : 0,
                        cursor: "pointer",
                        background: isEndpoint ? NAVY : inPreview ? "#eef3fb" : "transparent",
                        color: isEndpoint ? "#fff" : "#333",
                        fontWeight: isEndpoint ? 700 : isToday ? 700 : 400,
                        border: isToday && !isEndpoint ? `1px solid ${NAVY}` : "1px solid transparent",
                      }}
                    >
                      {parseInt(dateStr.slice(8, 10), 10)}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminOrdersPage() {
  const [activeTab, setActiveTab] = useState<OrdersTab>("new");
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [lastExportAt, setLastExportAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "">("");
  const [townFilter, setTownFilter] = useState("");
  // Date range defaults to today (Karachi time) so the page opens already
  // scoped to today's orders — the user can widen or clear it from there.
  const [dateFrom, setDateFrom] = useState<string>(() => todayInKarachi());
  const [dateTo, setDateTo] = useState<string>(() => todayInKarachi());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportingNew, setExportingNew] = useState(false);
  const [exportingSummary, setExportingSummary] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refetches just the orders list — used after actions that change it
  // (status update, export-new, delete) — without touching the marker
  // or the page-level loading flag, so it never re-shows the loading
  // skeleton for a routine refresh.
  async function loadOrders() {
    const res = await fetch("/api/admin/orders");
    const json = await res.json();
    setAllOrders(json.orders ?? []);
  }

  // Reads the "New Order" marker (admin_settings.last_order_export_at)
  // without touching it — this is what draws the line between the New
  // Orders tab and the All Orders tab. Read-only GET on the same route
  // the New Order button POSTs to.
  async function loadMarker() {
    try {
      const res = await fetch("/api/admin/orders/export-new");
      const json = await res.json();
      setLastExportAt(json.lastExportAt ?? null);
    } catch {
      // If this fails we just fall back to treating everything as new,
      // which is the safe direction (nothing gets hidden).
    }
  }

  // Initial load fetches orders AND the marker together and only then
  // clears the loading flag. Waiting on both before the first render
  // means the New Orders tab shows its correct, already-filtered list
  // right away — never a flash of every order before it narrows down.
  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([loadOrders(), loadMarker()]);
      setLoading(false);
    }
    init();
  }, []);

  // Town filter options come straight from the orders actually loaded —
  // never the full towns catalog, so it only ever lists towns that appear
  // in the order list, and never depends on a second network call.
  const townOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of allOrders) {
      if (o.town_id && o.town && !seen.has(o.town_id)) seen.set(o.town_id, o.town);
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allOrders]);

  // The New Orders tab's base list: orders created after the last time
  // the New Order button was pressed (server-tracked marker). Until the
  // marker exists (button never pressed), every order counts as new.
  const newOrders = useMemo(() => {
    if (!lastExportAt) return allOrders;
    return allOrders.filter((o) => o.created_at > lastExportAt);
  }, [allOrders, lastExportAt]);

  const tabOrders = activeTab === "new" ? newOrders : allOrders;

  const filteredOrders = useMemo(() => {
    return tabOrders.filter((o) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (townFilter && o.town_id !== townFilter) return false;
      if (dateFrom && o.order_date < dateFrom) return false;
      if (dateTo && o.order_date > dateTo) return false;
      return true;
    });
  }, [tabOrders, statusFilter, townFilter, dateFrom, dateTo]);

  useEffect(() => {
    setSelected(new Set());
  }, [activeTab, statusFilter, townFilter, dateFrom, dateTo]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(selected.size === filteredOrders.length ? new Set() : new Set(filteredOrders.map((o) => o.id)));
  }

  async function updateStatus(id: string, status: OrderStatus) {
    // Optimistic update — the row reflects the new status immediately,
    // no waiting on a refetch to feel responsive.
    setAllOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    await fetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  // Decodes a base64 payload into a Blob and triggers a browser download
  // for it. Called twice per export — once for the PDF, once for the
  // xlsx — since the two files are downloaded separately, not zipped.
  function downloadBase64(filename: string, base64: string, mimeType: string) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  async function exportOrders(ids: string[]) {
    if (ids.length === 0) return;
    setError(null);

    const res = await fetch("/api/admin/orders/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });

    const json = await res.json().catch(() => ({ error: "Export failed" }));

    if (!res.ok) {
      setError(json.error ?? "Export failed");
      return;
    }

    downloadBase64(json.pdf.filename, json.pdf.base64, "application/pdf");
    downloadBase64(json.xlsx.filename, json.xlsx.base64, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  // Bulk export now only ever acts on a checked selection, matching
  // deleteBulk — the button is only rendered once selected.size > 0
  // (see the button markup below).
  async function exportBulk() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setExporting(true);
    await exportOrders(ids);
    setExporting(false);
  }

  // Summary export — driven entirely by the current filters (Status,
  // Town, Date range), not by checkbox selection. Since the date range
  // defaults to today, pressing this fresh downloads today's orders;
  // whatever range the user picks afterward is what gets exported.
  // Only the xlsx is downloaded here (no PDF) — this is the quick
  // spreadsheet summary, not the full order-book export.
  async function exportSummary() {
    const ids = filteredOrders.map((o) => o.id);
    if (ids.length === 0) return;
    setExportingSummary(true);
    setError(null);

    const res = await fetch("/api/admin/orders/export-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });

    const json = await res.json().catch(() => ({ error: "Export failed" }));

    if (!res.ok) {
      setError(json.error ?? "Export failed");
      setExportingSummary(false);
      return;
    }

    downloadBase64(json.xlsx.filename, json.xlsx.base64, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    setExportingSummary(false);
  }

  async function exportOne(order: Order) {
    setExportingId(order.id);
    await exportOrders([order.id]);
    setExportingId(null);
  }

  async function exportNewOrders() {
    setExportingNew(true);
    setError(null);
    setNotice(null);

    const res = await fetch("/api/admin/orders/export-new", { method: "POST" });
    const json = await res.json().catch(() => ({ error: "Export failed" }));

    if (!res.ok) {
      if (res.status === 404) {
        setNotice(json.error ?? "No new orders since the last export.");
      } else {
        setError(json.error ?? "Export failed");
      }
      setExportingNew(false);
      return;
    }

    if (json.markerWarning) setError(json.markerWarning);

    downloadBase64(json.pdf.filename, json.pdf.base64, "application/pdf");
    downloadBase64(json.xlsx.filename, json.xlsx.base64, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    setExportingNew(false);
    // The marker just advanced server-side — reload it alongside the
    // orders so the New Orders tab immediately drops what was just
    // exported instead of showing it as new until the next refresh.
    loadOrders();
    loadMarker();
  }

  // Shared delete call for both the single-row Delete button and the
  // bulk Delete button — same endpoint either way, just a different
  // ids array. On success, removed orders drop out of both the loaded
  // list and the current selection immediately (no refetch needed).
  async function deleteOrders(ids: string[]) {
    if (ids.length === 0) return;
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/admin/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json.error ?? "Failed to delete order(s)");
        return;
      }

      const deletedIds: string[] = json.deletedCount != null ? json.deleted ?? ids : ids;
      const removed = new Set(deletedIds);
      setAllOrders((prev) => prev.filter((o) => !removed.has(o.id)));
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of deletedIds) next.delete(id);
        return next;
      });

      const notFoundCount: number = Array.isArray(json.notFound) ? json.notFound.length : 0;
      if (deletedIds.length === 0) {
        setError("No matching order(s) found to delete.");
      } else if (notFoundCount > 0) {
        setNotice(`${deletedIds.length} order(s) deleted. ${notFoundCount} were already gone.`);
      } else {
        setNotice(deletedIds.length === 1 ? "Order deleted." : `${deletedIds.length} orders deleted.`);
      }
    } catch {
      setError("Failed to delete order(s)");
    }
  }

  async function deleteOne(order: Order) {
    const ok = window.confirm(`Delete order ${order.order_number}? This cannot be undone.`);
    if (!ok) return;
    setDeletingId(order.id);
    await deleteOrders([order.id]);
    setDeletingId(null);
  }

  // Bulk delete now only ever acts on a checked selection — the button
  // itself is only rendered once selected.size > 0 (see the button
  // markup below), so there's no "delete everything filtered" fallback
  // to guard against here anymore.
  async function deleteBulk() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const ok = window.confirm(`Delete ${ids.length} selected order(s)? This cannot be undone.`);
    if (!ok) return;
    setDeleting(true);
    await deleteOrders(ids);
    setDeleting(false);
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fffdf5", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 6, height: 24, background: YELLOW, borderRadius: 3 }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: NAVY, margin: 0 }}>Orders</h1>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setActiveTab("new")}
          style={activeTab === "new" ? tabButtonActiveStyle : tabButtonStyle}
        >
          New Orders{newOrders.length > 0 ? ` (${newOrders.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          style={activeTab === "all" ? tabButtonActiveStyle : tabButtonStyle}
        >
          All Orders
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 16,
          background: "#fff",
          border: `1px solid ${YELLOW}`,
          borderRadius: 10,
          padding: 14,
        }}
      >
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div>
            <label style={labelStyle}>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "")} style={filterInputStyle}>
              <option value="">All</option>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Town</label>
            <select value={townFilter} onChange={(e) => setTownFilter(e.target.value)} style={filterInputStyle}>
              <option value="">All towns</option>
              {townOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={exportNewOrders} disabled={exportingNew} style={secondaryButtonStyle}>
            {exportingNew ? "Checking..." : "New Order"}
          </button>
          {activeTab === "all" && (
            <button type="button" onClick={exportSummary} disabled={exportingSummary || filteredOrders.length === 0} style={summaryButtonStyle}>
              {exportingSummary ? "Exporting..." : "Summary"}
            </button>
          )}
          {activeTab === "all" && selected.size > 0 && (
            <button onClick={exportBulk} disabled={exporting} style={buttonStyle}>
              {exporting ? "Exporting..." : `Export Selected (${selected.size})`}
            </button>
          )}
          {selected.size > 0 && (
            <button type="button" onClick={deleteBulk} disabled={deleting} style={deleteButtonStyle}>
              {deleting ? "Deleting..." : `Delete Selected (${selected.size})`}
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div style={{ color: NAVY, background: "#eef3fb", border: "1px solid #cddaf0", borderRadius: 6, padding: "6px 10px", marginBottom: 12, fontSize: 13 }}>
          {notice}
        </div>
      )}

      {error && (
        <div style={{ color: RED, background: "#fdecec", border: "1px solid #f6c9c9", borderRadius: 6, padding: "6px 10px", marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : filteredOrders.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "#888", background: "#fff", border: `1px solid ${YELLOW}`, borderRadius: 10 }}>
          {activeTab === "new" ? "No new orders since the last export." : "No orders match these filters."}
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${YELLOW}`, borderRadius: 10, background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", background: NAVY }}>
              <th style={thStyle}><input type="checkbox" checked={selected.size === filteredOrders.length && filteredOrders.length > 0} onChange={toggleSelectAll} /></th>
              <th style={thStyle}>Order #</th>
              <th style={thStyle}>Date &amp; Time</th>
              <th style={thStyle}>Town</th>
              <th style={thStyle}>Amount</th>
              <th style={thStyle}>Weight (Ton)</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((o) => {
              const statusStyle = STATUS_STYLES[o.status];
              return (
                <tr key={o.id} style={{ borderBottom: "1px solid #f3e6b0" }}>
                  <td style={tdStyle}><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: NAVY }}>{o.order_number}</td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatDateTime(o.created_at)}</td>
                  <td style={tdStyle}>{o.town ?? ""}</td>
                  <td style={tdStyle}>{o.total_amount.toLocaleString()}</td>
                  <td style={tdStyle}>{(o.total_weight_kg / 1000).toFixed(3)}</td>
                  <td style={tdStyle}>
                    <select
                      value={o.status}
                      onChange={(e) => updateStatus(o.id, e.target.value as OrderStatus)}
                      style={{
                        padding: "4px 8px",
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 12,
                        border: "none",
                        color: statusStyle.color,
                        background: statusStyle.background,
                        cursor: "pointer",
                      }}
                    >
                      {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Link href={`/admin/orders/${o.id}/edit`} style={editButtonStyle}>Edit</Link>
                      <button
                        onClick={() => exportOne(o)}
                        disabled={exportingId === o.id}
                        style={{ ...editButtonStyle, background: "none", cursor: "pointer" }}
                      >
                        {exportingId === o.id ? "..." : "Export"}
                      </button>
                      <button
                        onClick={() => deleteOne(o)}
                        disabled={deletingId === o.id}
                        style={deleteRowButtonStyle}
                      >
                        {deletingId === o.id ? "..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </main>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, color: "#888", marginBottom: 3, fontWeight: 600 };

const filterInputStyle: React.CSSProperties = {
  padding: "6px 8px",
  border: "1px solid #d9dde6",
  borderRadius: 6,
  fontSize: 13,
  background: "#fff",
};

const navButtonStyle: React.CSSProperties = {
  border: "none",
  background: "none",
  fontSize: 16,
  color: NAVY,
  cursor: "pointer",
  padding: "0 6px",
  lineHeight: 1,
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

// Solid yellow "Summary" button — the filter-driven quick xlsx export,
// visually distinct from the navy Export/Delete actions since it acts
// on the current filters rather than a checkbox selection.
const summaryButtonStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: YELLOW,
  color: NAVY,
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

// Red-filled bulk delete button, sitting next to the Export button so
// it reads as the destructive counterpart of "Export All (filtered)" /
// "Export Selected (n)" — same sizing, opposite weight.
const deleteButtonStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: RED,
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

const editButtonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 12px",
  fontSize: 12,
  fontWeight: 600,
  border: `1px solid ${NAVY}`,
  color: NAVY,
  borderRadius: 6,
  textDecoration: "none",
};

// Red-filled per-row delete button, matching editButtonStyle's sizing
// so it sits flush with the Edit / Export buttons in the row.
const deleteRowButtonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 12px",
  fontSize: 12,
  fontWeight: 600,
  border: `1px solid ${RED}`,
  color: "#fff",
  background: RED,
  borderRadius: 6,
  cursor: "pointer",
};

// Tab pill styles — inactive tab is an outlined navy pill on the page's
// cream background, active tab fills solid navy with a yellow accent
// underline so it reads as "current", matching the rest of the theme.
const tabButtonStyle: React.CSSProperties = {
  padding: "8px 18px",
  background: "#fff",
  color: NAVY,
  border: `1px solid ${NAVY}`,
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

const tabButtonActiveStyle: React.CSSProperties = {
  ...tabButtonStyle,
  background: NAVY,
  color: "#fff",
  boxShadow: `inset 0 -3px 0 ${YELLOW}`,
};

const thStyle: React.CSSProperties = { padding: "9px 6px", fontSize: 13, color: "#fff", fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: "8px 6px", fontSize: 13 };