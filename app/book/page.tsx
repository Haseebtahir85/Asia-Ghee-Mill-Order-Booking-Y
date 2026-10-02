"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Item, SecondaryReportConfig, Town } from "@/lib/types";
import {
  REPORT_ALREADY_FILED_MESSAGE,
  REPORT_DISABLED_MESSAGE,
  REPORT_NO_TO_MESSAGE,
  REPORT_SELECT_TO_MESSAGE,
  monthLabel,
  tosForTown,
} from "@/lib/secondaryReport";
import styles from "./book.module.css";

// Jameel Noori Nastaleeq loads via next/font/local (see lib/fonts.ts) and is
// exposed as the --font-jameel-noori CSS variable on <html> in the root
// layout. Noto Nastaliq Urdu (also loaded via next/font) is the fallback if
// that font file is ever missing, before finally falling back to any
// Nastaliq-capable font already on the device, then generic serif.
const urduFont: React.CSSProperties = {
  fontFamily: "var(--font-jameel-noori), var(--font-noto-nastaliq), 'Noto Nastaliq Urdu', serif",
};

// Hard cap on the order's grand total weight (Ton). No order — regardless of
// how many items or which pack family — may be booked past this limit.
// The backend enforces 10.4 exactly; the user-facing message rounds down to
// "10 Ton" and must always read this way, not "10.4".
const MAX_GRAND_TOTAL_TON = 10.05;
const WEIGHT_LIMIT_MESSAGE =
  "کل وزن 10 ٹن سے زیادہ نہیں ہو سکتا۔ براہ کرم اپنے وزن کو کم کریں اور دوبارہ کوشش کریں۔";

// Shown under the Town field while an existing order is open for editing:
// the town is fixed to whatever the order was booked with, and only the
// item quantities can be changed.
const TOWN_LOCKED_MESSAGE = "ترمیم کے دوران ٹاؤن تبدیل نہیں کیا جا سکتا۔";

// Shared with every device-time-tampering guard (town search, every input
// field, the Book/Update button, the Edit Order search) as well as the
// full-screen DeviceTimeWarningOverlay, so the wording is identical
// everywhere it appears. "ڈیوائس" is grammatically feminine in Urdu, hence
// "بلیک لسٹ ہو جائے گی" (not "... کر دیا جائے گا").
const DEVICE_TIME_WARNING_MESSAGE =
  "براہ کرم سروس استعمال کرنے کے لیے اپنی ڈیوائس  کا وقت درست کریں، ورنہ آپ کی ڈیوائس بلیک لسٹ ہو جائے گی۔";

// True if the string contains Urdu/Arabic-script characters, so we only
// apply the Urdu font to messages that are actually in Urdu.
function isUrduText(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function townLabel(t: Town): string {
  return t.name;
}

function townMatches(t: Town, query: string): boolean {
  const q = query.toLowerCase();
  if (t.name.toLowerCase().includes(q)) return true;
  if (t.upc && t.upc.toLowerCase().includes(q)) return true;
  if (t.group_no != null && String(t.group_no).toLowerCase().includes(q)) return true;
  return false;
}

function getPakistanTimeString() {
  // Always computed against Asia/Karachi, regardless of the device's own timezone/clock settings.
  const now = new Date();
  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  const datePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(now);
  return `${timePart}, ${datePart}`;
}

// Booking is only open 09:00–18:00 Pakistan Standard Time (a fixed UTC+5
// offset — Pakistan does not observe DST). This is checked against time
// fetched from this app's own /api/server-time route (see the fetch effect
// below), not the device's own clock, so changing the device's date/time
// can't be used to open the form outside these hours. This is a same-origin
// endpoint rather than a third-party time API (worldtimeapi.org and similar
// public time APIs are known to go down for long stretches with no SLA) —
// it's on the same Vercel deployment as the rest of the app, so it has no
// separate uptime risk: if it's unreachable, the booking page itself is down.
const OPEN_HOUR_PKT = 9;
const CLOSE_HOUR_PKT = 18;
const SERVER_TIME_API_URL = "/api/server-time";

// The online time is re-verified this often, continuously, for as long as
// the page stays open — 24/7, not just once on load — so the device clock
// is checked against the real online clock on a rolling basis, and a clock
// changed mid-session is caught within seconds rather than needing a
// page reload.
const ONLINE_TIME_RECHECK_INTERVAL_MS = 20 * 1000;

// How far the device's own clock (local time) is allowed to disagree with
// the verified online time before it's treated as a deliberately changed
// clock — see deviceTimeTampered below.
const DEVICE_TIME_TAMPER_THRESHOLD_MS = 10 * 60 * 1000;

// Breaks a UTC timestamp (ms) into its Pakistan-local calendar/clock parts.
function getPakistanParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    // hour12:false can render midnight as "24" in some environments
    hour: parseInt(map.hour, 10) % 24,
    minute: parseInt(map.minute, 10),
  };
}

function isWithinBookingHours(ms: number): boolean {
  const { hour } = getPakistanParts(ms);
  return hour >= OPEN_HOUR_PKT && hour < CLOSE_HOUR_PKT;
}

// The next 09:00 PKT instant at/after `ms`, as a UTC timestamp (ms).
function getNextOpenTimeMs(ms: number): number {
  const { year, month, day, hour } = getPakistanParts(ms);
  const targetDay = hour < OPEN_HOUR_PKT ? day : day + 1;
  // 09:00 PKT == 04:00 UTC (PKT is always UTC+5). Date.UTC normalizes a
  // day value that overflows past the end of the month automatically.
  return Date.UTC(year, month - 1, targetDay, OPEN_HOUR_PKT - 5, 0, 0);
}

// Splits a remaining-ms countdown into whole hours + minutes, rounded up
// so it doesn't read "0 گھنٹے 0 منٹ" while there's still time left.
function getRemainingHoursMinutes(ms: number): { hours: number; minutes: number } {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

// Icon is the admin's explicit choice (item.icon) when one is set.
// Otherwise it's guessed from what the item is called — a plain
// substring check, so it doesn't matter what comes before the
// container word — "6 Kg Tin", "16 Kg Tin (B)", "1 Kg 12 Pack",
// "16 Kg Bucket" all resolve correctly off the word tin/pack/bucket.
// RSO and Soap are checked first since those are specific products,
// not containers. Category is the last-resort fallback.
type IconKind = "tin" | "pack" | "bucket" | "bottle" | "soap";

function getIconKind(item: Item): IconKind {
  if (item.icon) return item.icon;

  const n = item.name.toLowerCase();
  if (n.includes("rso")) return "bottle";
  if (n.includes("soap")) return "soap";
  if (n.includes("tin")) return "tin";
  if (n.includes("pack")) return "pack";
  if (n.includes("bucket") || n.includes("balti")) return "bucket";
  // Fallback for names that don't carry a container word
  if (item.type === "ghee") return "tin";
  if (item.type === "oil") return "pack";
  return "bucket";
}

// "10 Pack" and "12 Pack" are two rival packaging lines that scale together
// across weights — "1 Kg 10 Pack", "1/2 Kg 20 Pack", "1/4 Kg 40 Pack" and
// "1 Ltr. 10 Pack" are all the "10" family (pack count × weight ≈ 10);
// "1 Kg 12 Pack", "1/2 Kg 24 Pack", "1/4 Kg 48 Pack" are the "12" family
// (pack count × weight ≈ 12). The two families can never be ordered
// together anywhere in the same bill. "5 Pack" items (pack count × weight
// ≈ 5) fall outside both families and are never restricted.
function parseWeightValue(numStr: string): number {
  if (numStr.includes("/")) {
    const [a, b] = numStr.split("/").map(Number);
    return b ? a / b : NaN;
  }
  return Number(numStr);
}

function getPackFamily(item: Item): 10 | 12 | null {
  const name = item.name.toLowerCase();
  if (!name.includes("pack")) return null;

  const weightMatch = name.match(/(\d+(?:\/\d+)?)\s*(kg|ltr\.?|l\b)/i);
  const countMatch = name.match(/(\d+)\s*pack/i);
  if (!weightMatch || !countMatch) return null;

  const weightVal = parseWeightValue(weightMatch[1]);
  const packCount = parseInt(countMatch[1], 10);
  if (!weightVal || !packCount) return null;

  const baseCount = Math.round(packCount * weightVal * 1000) / 1000;
  if (Math.abs(baseCount - 10) < 0.01) return 10;
  if (Math.abs(baseCount - 12) < 0.01) return 12;
  return null;
}

const QTY_OPTIONS = [1, 2, 3, 4];

export default function BookPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [towns, setTowns] = useState<Town[]>([]);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [townId, setTownId] = useState("");
  const [townQuery, setTownQuery] = useState("");
  const [townSuggestions, setTownSuggestions] = useState<Town[]>([]);
  const [showTownDropdown, setShowTownDropdown] = useState(false);
  const townBoxRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOrderNumbers, setConfirmedOrderNumbers] = useState<string[] | null>(null);
  // Tracks which order number's "copy" button most recently succeeded, so
  // that one button can briefly show a "Copied" confirmation. Cleared after
  // a short delay so it doesn't get stuck if the user copies several.
  const [copiedOrder, setCopiedOrder] = useState<string | null>(null);
  const [showQtyModal, setShowQtyModal] = useState(false);
  const [conflictModalNames, setConflictModalNames] = useState<string[] | null>(null);
  const conflictSignatureRef = useRef<string>("");
  const [showWeightLimitModal, setShowWeightLimitModal] = useState(false);

  // "Edit Order" — a customer can look up an order they already placed by
  // Town + Order ID (acting as a lightweight shared credential) and edit
  // its quantities. editingOrder holds the town/order_number pair
  // that was used to find it, since the update endpoint re-checks both
  // again server-side before allowing any change — the order's own id is
  // never treated as sufficient authorization by itself.
  //
  // While editingOrder is set, the Town field is locked: the order stays
  // on the town it was booked with, and only quantities can change.
  const [showEditSearch, setShowEditSearch] = useState(false);
  const [editSearchTown, setEditSearchTown] = useState("");
  const [editSearchOrderNumber, setEditSearchOrderNumber] = useState("");
  const [editSearchError, setEditSearchError] = useState<string | null>(null);
  const [editSearchLoading, setEditSearchLoading] = useState(false);
  const [editingOrder, setEditingOrder] = useState<{ id: string; order_number: string; town: string } | null>(null);
  const [wasEdit, setWasEdit] = useState(false);
  const [editTownSuggestions, setEditTownSuggestions] = useState<Town[]>([]);
  const [showEditTownDropdown, setShowEditTownDropdown] = useState(false);
  const editTownBoxRef = useRef<HTMLDivElement>(null);

  // "TO's Secondary Ach. Report" — a 3-step flow that reuses the same
  // Town search + item table as the booking form:
  //   step 0 -> Closing/Opening Report [month BEFORE the admin's month]
  //   step 1 -> Secondary Sale [admin's month]
  //   step 2 -> Closing Stock [admin's month]
  // then a results screen (reportReview) with Confirm / Cancel.
  //
  // The months, the ON/OFF switch and the list of TO's all come from the
  // admin panel (reportConfig). The TO's Name is filled in automatically
  // from the selected town (one TO per town) and can't be typed. A town
  // that already filed for the current month is blocked with an Urdu message.
  // Each step keeps its own quantities in reportQtys[step]; Town + TO stay
  // locked for steps 1 and 2.
  const [reportMode, setReportMode] = useState(false);
  const [reportStep, setReportStep] = useState<0 | 1 | 2>(0);
  const [reportTownId, setReportTownId] = useState("");
  const [reportTownQuery, setReportTownQuery] = useState("");
  const [reportTownSuggestions, setReportTownSuggestions] = useState<Town[]>([]);
  const [showReportTownDropdown, setShowReportTownDropdown] = useState(false);
  const reportTownBoxRef = useRef<HTMLDivElement>(null);
  const [reportToId, setReportToId] = useState("");
  const [reportToName, setReportToName] = useState("");
  const [reportQtys, setReportQtys] = useState<Record<string, string>[]>([{}, {}, {}]);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [reportConfig, setReportConfig] = useState<SecondaryReportConfig | null>(null);
  const [reportTownFiled, setReportTownFiled] = useState(false);
  const [reportReview, setReportReview] = useState(false);
  const [showReportClosedModal, setShowReportClosedModal] = useState(false);
  // Latest town id whose "already filed?" check was started — lets a slow
  // response for a previously picked town be ignored.
  const reportCheckRef = useRef("");

  // Read-only Pakistan Standard Time clock (not derived from the device's local time zone)
  const [pkTime, setPkTime] = useState(getPakistanTimeString());

  const townLocked = !!editingOrder;

  useEffect(() => {
    const interval = setInterval(() => setPkTime(getPakistanTimeString()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Online-calibrated clock for the 9am–6pm booking-hours gate.
  // pkClockOffsetMs is (online server time − device time). Every "now" used
  // for the gate is Date.now() + offset, so the check tracks real time even
  // if the device's own clock is wrong. pkClockSource records whether that
  // offset actually came from the online source ("online") or is an
  // unverified fallback used only because the API was briefly unreachable
  // ("fallback") — the fallback never counts as evidence of tampering.
  const [pkClockOffsetMs, setPkClockOffsetMs] = useState(0);
  const [pkClockReady, setPkClockReady] = useState(false);
  const [pkClockSource, setPkClockSource] = useState<"pending" | "online" | "fallback">("pending");
  const [nowCorrectedMs, setNowCorrectedMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let hasSucceededOnce = false;

    async function fetchOnlineTime() {
      try {
        const res = await fetch(SERVER_TIME_API_URL, { cache: "no-store" });
        if (!res.ok) throw new Error("server time request failed");
        const json = await res.json();
        const serverMs = Number(json.nowMs);
        if (!Number.isFinite(serverMs)) throw new Error("bad server time response");
        if (cancelled) return;
        hasSucceededOnce = true;
        setPkClockOffsetMs(serverMs - Date.now());
        setPkClockSource("online");
        setPkClockReady(true);
      } catch {
        if (cancelled) return;
        // Only fall back to the (unverified) device clock the first time,
        // so the page isn't stuck forever if the API is briefly down. A
        // failed periodic recheck just keeps the last known-good offset
        // instead of resetting it to an unverified one.
        if (!hasSucceededOnce) {
          setPkClockOffsetMs(0);
          setPkClockSource("fallback");
          setPkClockReady(true);
        }
      }
    }

    fetchOnlineTime();
    const interval = setInterval(fetchOnlineTime, ONLINE_TIME_RECHECK_INTERVAL_MS);

    // Also re-verify the moment the tab regains focus — catches a clock
    // change made while the device was away/asleep without waiting for
    // the next interval tick.
    function handleVisibility() {
      if (document.visibilityState === "visible") fetchOnlineTime();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!pkClockReady) return;
    function tick() {
      setNowCorrectedMs(Date.now() + pkClockOffsetMs);
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [pkClockReady, pkClockOffsetMs]);

  // True only once a verified online reading shows the device's own clock
  // is off by more than the tamper threshold — i.e. someone changed their
  // phone/PC date or time, whether before opening the page or mid-session
  // (the periodic recheck above catches the latter). Never true off an
  // unverified fallback reading, so a down time-API can't trigger it.
  const deviceTimeTampered =
    pkClockSource === "online" && Math.abs(pkClockOffsetMs) > DEVICE_TIME_TAMPER_THRESHOLD_MS;

  const bookingClosedByTime = nowCorrectedMs !== null && !isWithinBookingHours(nowCorrectedMs);

  // Test hook: visiting the page with ?forceClosed=1&key=<TEST_OVERRIDE_KEY>
  // shows the popup on demand. This isn't gated behind NODE_ENV because
  // GitHub + Vercel builds always run in production mode (`next build`
  // sets NODE_ENV=production for both Preview and Production deployments),
  // so there's no separate "dev" environment to hide it behind. It's safe
  // to leave in: it can only force the CLOSED popup to appear — it can
  // never force the form open outside real booking hours — so guessing the
  // key at worst shows a visitor the same popup they'd see anyway once
  // hours actually change. Change TEST_OVERRIDE_KEY to your own private
  // value, or delete this block once you're done testing.
  const TEST_OVERRIDE_KEY = "asia2026test";
  const forceClosedForTesting =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("forceClosed") === "1" &&
    new URLSearchParams(window.location.search).get("key") === TEST_OVERRIDE_KEY;

  // Private bypass link — only opens the form outside 9am–6pm PKT when the
  // page is visited with BOTH ?bypassClosed=1 and the exact secret key
  // below. Anyone without that link sees the normal closed-hours popup as
  // usual; this never widens booking hours for regular visitors. Change
  // BYPASS_KEY to your own private value, and remove this block once
  // you're done testing — it stays purely client-side, so if any API
  // route also checks the hour window server-side, this bypass alone
  // won't let a booked order through on its own.
  const BYPASS_KEY = "asia-owner-bypass-2026";
  const bypassClosedForTesting =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("bypassClosed") === "1" &&
    new URLSearchParams(window.location.search).get("key") === BYPASS_KEY;

  const bookingClosed = (bookingClosedByTime && !bypassClosedForTesting) || forceClosedForTesting;
  const closedRemainingMs =
    nowCorrectedMs !== null ? Math.max(0, getNextOpenTimeMs(nowCorrectedMs) - nowCorrectedMs) : 0;

  useEffect(() => {
    async function load() {
      try {
        const [itemsRes, townsRes] = await Promise.all([fetch("/api/items"), fetch("/api/towns")]);
        const itemsJson = await itemsRes.json();
        const townsJson = await townsRes.json();
        if (!itemsRes.ok) throw new Error(itemsJson.error || `Items request failed (${itemsRes.status})`);
        if (!townsRes.ok) throw new Error(townsJson.error || `Towns request failed (${townsRes.status})`);
        setItems(itemsJson.items ?? []);
        setTowns(townsJson.towns ?? []);
      } catch (err: any) {
        setLoadError(err.message || "Failed to load booking page data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Report config (ON/OFF, months, TO's). Loaded quietly on mount so the
  // "TO,s Secondary Ach. Report" button can be hidden while the admin has the
  // page switched OFF; re-read every time the report is opened.
  useEffect(() => {
    fetchReportConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the town dropdown when clicking outside it
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (townBoxRef.current && !townBoxRef.current.contains(e.target as Node)) {
        setShowTownDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Same for the Edit Order popup's own town field — a separate ref
  // since it lives in a different part of the tree (inside the modal).
  useEffect(() => {
    function handleClickOutsideEditTown(e: MouseEvent) {
      if (editTownBoxRef.current && !editTownBoxRef.current.contains(e.target as Node)) {
        setShowEditTownDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutsideEditTown);
    return () => document.removeEventListener("mousedown", handleClickOutsideEditTown);
  }, []);

  // And the TO's Secondary Ach. Report's own town field (separate ref,
  // since it's a different part of the tree again).
  useEffect(() => {
    function handleClickOutsideReportTown(e: MouseEvent) {
      if (reportTownBoxRef.current && !reportTownBoxRef.current.contains(e.target as Node)) {
        setShowReportTownDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutsideReportTown);
    return () => document.removeEventListener("mousedown", handleClickOutsideReportTown);
  }, []);

  // Rate and per-unit weight are fetched but never rendered per-row anymore —
  // amount is still computed here (for the overall total) even though the
  // Amount column itself is hidden from the table. `kind` drives the icon,
  // the group-divider logic, and the RSO/Soap breakdown below.
  const rows = useMemo(() => {
    return items.map((item) => {
      const qty = parseFloat(qtys[item.id] || "0") || 0;
      const amount = qty * item.rate;
      const weight = qty * item.weight_kg;
      return { item, qty, amount, weight, kind: getIconKind(item) };
    });
  }, [items, qtys]);

  const totals = useMemo(() => {
    let amount = 0;
    let weight = 0;
    let gheeWeight = 0;
    let oilWeight = 0;
    let rsoWeight = 0;
    let soapWeight = 0;
    for (const r of rows) {
      amount += r.amount;
      weight += r.weight;
      if (r.item.type === "ghee") gheeWeight += r.weight;
      if (r.item.type === "oil") oilWeight += r.weight;
      if (r.kind === "bottle") rsoWeight += r.weight;
      if (r.kind === "soap") soapWeight += r.weight;
    }
    const totalTon = (gheeWeight + oilWeight) / 1000;
    const grandTotalTon = weight / 1000;
    return { amount, weight, gheeWeight, oilWeight, rsoWeight, soapWeight, totalTon, grandTotalTon };
  }, [rows]);

  const grandTotalExceedsLimit = totals.grandTotalTon > MAX_GRAND_TOTAL_TON;

  // Live inline message: shows the moment typed quantities push the grand
  // total past the cap, no submit click needed. Any other validation error
  // (town not picked, pack conflict, etc.) only shows once the user tries
  // to submit, so the weight message takes priority whenever it applies.
  const displayedError = grandTotalExceedsLimit ? WEIGHT_LIMIT_MESSAGE : error;

  // Global rule: the "10 Pack" family and "12 Pack" family can never both
  // be active in the same order, regardless of weight — flag every active
  // item from both families the moment both are present at once.
  const conflictItemIds = useMemo(() => {
    const tenActive = rows.filter((r) => getPackFamily(r.item) === 10 && r.qty > 0);
    const twelveActive = rows.filter((r) => getPackFamily(r.item) === 12 && r.qty > 0);
    if (tenActive.length > 0 && twelveActive.length > 0) {
      return new Set([...tenActive, ...twelveActive].map((r) => r.item.id));
    }
    return new Set<string>();
  }, [rows]);

  // Pop up the conflict warning the moment a new conflicting pair appears —
  // but only once per distinct conflict, not on every further keystroke
  // while the same conflict is still unresolved.
  useEffect(() => {
    const signature = Array.from(conflictItemIds).sort().join(",");
    if (signature && signature !== conflictSignatureRef.current) {
      const names = rows.filter((r) => conflictItemIds.has(r.item.id)).map((r) => r.item.name);
      setConflictModalNames(names);
    }
    conflictSignatureRef.current = signature;
  }, [conflictItemIds, rows]);

  function updateQty(itemId: string, value: string) {
    if (deviceTimeTampered) return;
    setQtys((prev) => ({ ...prev, [itemId]: value }));
  }

  function handleTownInputChange(value: string) {
    // Locked while editing an existing order — the town is fixed.
    if (townLocked) return;
    if (deviceTimeTampered) return;

    setTownQuery(value);
    setTownId("");
    if (!value.trim()) {
      setTownSuggestions([]);
      setShowTownDropdown(false);
      return;
    }
    const matches = towns.filter((t) => townMatches(t, value)).slice(0, 8);
    setTownSuggestions(matches);
    setShowTownDropdown(true);
  }

  function selectTown(t: Town) {
    if (townLocked) return;
    if (deviceTimeTampered) return;
    setTownQuery(townLabel(t));
    setTownId(t.id);
    setShowTownDropdown(false);
  }

  // Same search behavior as the main Town field, but for the Edit
  // Order popup — no town_id needed here, since the lookup matches
  // against the order's stored town name text, not an id.
  function handleEditSearchTownChange(value: string) {
    if (deviceTimeTampered) return;
    setEditSearchTown(value);
    if (!value.trim()) {
      setEditTownSuggestions([]);
      setShowEditTownDropdown(false);
      return;
    }
    const matches = towns.filter((t) => townMatches(t, value)).slice(0, 8);
    setEditTownSuggestions(matches);
    setShowEditTownDropdown(true);
  }

  function selectEditSearchTown(t: Town) {
    if (deviceTimeTampered) return;
    setEditSearchTown(townLabel(t));
    setShowEditTownDropdown(false);
  }

  // ---- TO's Secondary Ach. Report handlers --------------------------------

  // Active TO's from the admin's "TO's Names" list. A TO added to "all
  // towns" (town_id = null) can file for any town.
  const toList = reportConfig?.tos ?? [];

  // Towns that have at least one TO who can file for them.
  const reportTowns = useMemo(() => {
    const list = reportConfig?.tos ?? [];
    const anyTown = list.some((t) => t.town_id === null);
    return towns.filter((t) => anyTown || list.some((x) => x.town_id === t.id));
  }, [towns, reportConfig]);

  // The TO's the selected town can choose from (empty until a town is picked).
  const reportCandidates = reportTownId ? tosForTown(toList, reportTownId) : [];

  async function fetchReportConfig(): Promise<SecondaryReportConfig | null> {
    try {
      const res = await fetch("/api/secondary-report/config", { cache: "no-store" });
      if (!res.ok) return null;
      const json = (await res.json()) as SecondaryReportConfig;
      setReportConfig(json);
      return json;
    } catch {
      return null;
    }
  }

  async function openReport() {
    if (deviceTimeTampered) return;

    // Always re-read the admin's ON/OFF switch + month at the moment of opening.
    const cfg = await fetchReportConfig();
    if (!cfg) {
      setError("Couldn't load the report right now. Please check your connection and try again.");
      return;
    }
    if (!cfg.enabled) {
      setShowReportClosedModal(true);
      return;
    }

    resetReport();
    setError(null);
    setReportMode(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  function resetReport() {
    setReportStep(0);
    setReportTownId("");
    setReportTownQuery("");
    setReportTownSuggestions([]);
    setShowReportTownDropdown(false);
    setReportToId("");
    setReportToName("");
    setReportQtys([{}, {}, {}]);
    setReportError(null);
    setReportSubmitting(false);
    setReportDone(false);
    setReportTownFiled(false);
    setReportReview(false);
    reportCheckRef.current = "";
  }

  function exitReport() {
    resetReport();
    setReportMode(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  function handleReportTownChange(value: string) {
    // Town is only editable on step 1 — later steps reuse it.
    if (reportStep !== 0 || deviceTimeTampered) return;
    setReportTownQuery(value);
    setReportTownId("");
    setReportToId("");
    setReportToName("");
    setReportTownFiled(false);
    setReportError(null);
    reportCheckRef.current = "";
    if (!value.trim()) {
      setReportTownSuggestions([]);
      setShowReportTownDropdown(false);
      return;
    }
    const matches = reportTowns.filter((t) => townMatches(t, value.trim())).slice(0, 8);
    setReportTownSuggestions(matches);
    setShowReportTownDropdown(true);
  }

  // Picking a town fills in its TO's Name and checks right away whether this
  // town has already filed for the month the admin has open.
  async function selectReportTown(t: Town) {
    if (reportStep !== 0 || deviceTimeTampered) return;
    setReportTownQuery(townLabel(t));
    setReportTownId(t.id);
    // exactly one TO can file for this town -> fill it in; several -> the user picks
    const options = tosForTown(toList, t.id);
    setReportToId(options.length === 1 ? options[0].id : "");
    setReportToName(options.length === 1 ? options[0].name : "");
    setShowReportTownDropdown(false);
    setReportTownFiled(false);
    setReportError(null);
    reportCheckRef.current = t.id;

    try {
      const res = await fetch(`/api/secondary-report/check?town_id=${encodeURIComponent(t.id)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (reportCheckRef.current !== t.id) return; // a different town was picked meanwhile
      if (res.ok && json.filed) {
        setReportTownFiled(true);
        setReportError(REPORT_ALREADY_FILED_MESSAGE);
      } else if (res.ok && json.enabled === false) {
        setReportError(REPORT_DISABLED_MESSAGE);
      }
    } catch {
      // The server re-checks on submit, so a failed pre-check is harmless.
    }
  }

  function selectReportTo(id: string) {
    if (reportStep !== 0 || deviceTimeTampered) return;
    const to = reportCandidates.find((t) => t.id === id);
    setReportToId(to?.id ?? "");
    setReportToName(to?.name ?? "");
    setReportError(null);
  }

  function updateReportQty(step: number, itemId: string, value: string) {
    if (deviceTimeTampered) return;
    setReportQtys((prev) => {
      const next = prev.slice();
      next[step] = { ...next[step], [itemId]: value };
      return next;
    });
  }

  function reportLinesForStep(step: number) {
    const map = reportQtys[step] ?? {};
    return items
      .map((item) => ({ item_id: item.id, qty: parseFloat(map[item.id] || "0") || 0 }))
      .filter((l) => l.qty > 0);
  }

  // Validates the current step; returns true if it's OK to move on.
  function validateReportStep(step: number): boolean {
    if (deviceTimeTampered) {
      setReportError(DEVICE_TIME_WARNING_MESSAGE);
      return false;
    }
    if (step === 0) {
      if (!reportTownId) {
        setReportError("براہ کرم ٹاؤن منتخب کریں۔");
        return false;
      }
      if (reportCandidates.length === 0) {
        setReportError(REPORT_NO_TO_MESSAGE);
        return false;
      }
      if (!reportToId) {
        setReportError(REPORT_SELECT_TO_MESSAGE);
        return false;
      }
      if (reportTownFiled) {
        setReportError(REPORT_ALREADY_FILED_MESSAGE);
        return false;
      }
    }
    if (reportLinesForStep(step).length === 0) {
      setReportError("کم از کم ایک آئٹم کی مقدار درج کریں۔");
      return false;
    }
    return true;
  }

  function reportNext() {
    setReportError(null);
    if (!validateReportStep(reportStep)) return;
    if (reportStep < 2) {
      setReportStep((reportStep + 1) as 0 | 1 | 2);
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    }
  }

  function reportBack() {
    setReportError(null);
    if (reportStep > 0) {
      setReportStep((reportStep - 1) as 0 | 1 | 2);
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    }
  }

  // "Submit" on the last page doesn't file anything yet — it opens the
  // results screen, where the user chooses Confirm or Cancel.
  function openReportReview() {
    setReportError(null);
    if (!validateReportStep(2)) return;
    setReportReview(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  // Cancel on the results screen: back to the last page with everything kept.
  function cancelReportReview() {
    setReportError(null);
    setReportReview(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  // Confirm on the results screen: this is the actual filing.
  async function confirmReport() {
    if (deviceTimeTampered) {
      setReportError(DEVICE_TIME_WARNING_MESSAGE);
      return;
    }
    setReportError(null);
    setReportSubmitting(true);
    try {
      const res = await fetch("/api/secondary-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          town_id: reportTownId,
          to_id: reportToId,
          closing_opening: reportLinesForStep(0),
          secondary_sale: reportLinesForStep(1),
          closing_stock: reportLinesForStep(2),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        if (json.code === "ALREADY_FILED") {
          setReportTownFiled(true);
          setReportReview(false);
          setReportStep(0);
          setReportError(REPORT_ALREADY_FILED_MESSAGE);
          return;
        }
        if (json.code === "DISABLED") {
          // Admin switched the page OFF while this was open: back to the
          // booking page with the "not available right now" popup.
          exitReport();
          setShowReportClosedModal(true);
          return;
        }
        if (json.code === "NO_TO") {
          setReportReview(false);
          setReportStep(0);
          setReportError(REPORT_NO_TO_MESSAGE);
          return;
        }
        throw new Error(json.error ?? "Failed to submit report");
      }
      setReportReview(false);
      setReportDone(true);
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    } catch (err: any) {
      setReportError(err.message || "Failed to submit report");
    } finally {
      setReportSubmitting(false);
    }
  }

  // Shared validation for both the "create new order" and "edit existing
  // order" paths — same town/conflict/weight-limit checks either way.
  function handleFormSubmit(e: React.FormEvent | React.MouseEvent) {
    e.preventDefault();
    setError(null);

    // Belt-and-braces: the full-screen DeviceTimeWarningOverlay already
    // blocks the whole page while the clock is tampered, but a <form>
    // still fires its onSubmit on Enter-key inside an input even when the
    // submit button itself is disabled — so this is checked here too.
    if (deviceTimeTampered) {
      setError(DEVICE_TIME_WARNING_MESSAGE);
      return;
    }

    if (!townId) {
      setError("براہ کرم ٹاؤن منتخب کریں۔");
      return;
    }

    if (conflictItemIds.size > 0) {
      setError("آپ 10 پیک اور 12 پیک ایک ساتھ نہیں لے سکتے — صرف ایک قسم منتخب کریں۔");
      return;
    }

    if (grandTotalExceedsLimit) {
      setShowWeightLimitModal(true);
      return;
    }

    const lines = rows.filter((r) => r.qty > 0).map((r) => ({ item_id: r.item.id, qty: r.qty }));
    if (lines.length === 0) {
      setError("Enter a quantity for at least one item.");
      return;
    }

    if (editingOrder) {
      submitEditOrder(lines);
    } else {
      setShowQtyModal(true);
    }
  }

  async function bookOrders(copies: number) {
    // Belt-and-braces: same device-time check as handleFormSubmit, in case
    // the clock was tampered with after the qty modal was already open.
    if (deviceTimeTampered) {
      setShowQtyModal(false);
      setError(DEVICE_TIME_WARNING_MESSAGE);
      return;
    }

    // Belt-and-braces: re-check the cap right before hitting the API too,
    // in case totals changed between opening the modal and confirming it.
    if (grandTotalExceedsLimit) {
      setShowQtyModal(false);
      setShowWeightLimitModal(true);
      return;
    }

    setShowQtyModal(false);
    setError(null);
    setSubmitting(true);

    const lines = rows.filter((r) => r.qty > 0).map((r) => ({ item_id: r.item.id, qty: r.qty }));
    const orderNumbers: string[] = [];

    try {
      // Same town, same items — booked as `copies` separate bills, each
      // getting its own order number from the backend.
      for (let i = 0; i < copies; i++) {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ town_id: townId, lines }),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({ error: "Failed to submit order" }));
          throw new Error(json.error ?? "Failed to submit order");
        }

        const json = await res.json();
        orderNumbers.push(json.order.order_number);
      }
      setWasEdit(false);
      setConfirmedOrderNumbers(orderNumbers);
    } catch (err: any) {
      setError(err.message || "Failed to submit order");
    } finally {
      setSubmitting(false);
    }
  }

  // Updating an existing order — re-sends the same order_number + town
  // pair used to find it in the first place, since the server treats
  // that pair as the actual authorization, not the order's id alone.
  // town_id is sent unchanged (the field is locked in edit mode), so
  // only the quantities can differ from what was originally booked.
  async function submitEditOrder(lines: { item_id: string; qty: number }[]) {
    if (!editingOrder) return;
    if (deviceTimeTampered) {
      setError(DEVICE_TIME_WARNING_MESSAGE);
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/orders/${editingOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_number: editingOrder.order_number,
          town: editingOrder.town,
          town_id: townId,
          lines,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "Failed to update order" }));
        throw new Error(json.error ?? "Failed to update order");
      }

      const json = await res.json();
      setWasEdit(true);
      setConfirmedOrderNumbers([json.order.order_number]);
    } catch (err: any) {
      setError(err.message || "Failed to update order");
    } finally {
      setSubmitting(false);
    }
  }

  // Looks an order up by Town + Order ID and, if found, loads it into
  // the booking form for editing. The town comes back locked; only the
  // item quantities stay editable.
  async function searchOrderToEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditSearchError(null);

    if (deviceTimeTampered) {
      setEditSearchError(DEVICE_TIME_WARNING_MESSAGE);
      return;
    }

    if (!editSearchTown.trim() || !editSearchOrderNumber.trim()) {
      setEditSearchError("براہ کرم ٹاؤن اور آرڈر آئی ڈی دونوں درج کریں۔");
      return;
    }

    setEditSearchLoading(true);
    try {
      const res = await fetch("/api/orders/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_number: editSearchOrderNumber.trim(),
          town: editSearchTown.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setEditSearchError("دیا گیا ٹاؤن اور آرڈر آئی ڈی سے کوئی آرڈر نہیں ملا۔ براہ کرم دوبارہ چیک کریں۔");
        return;
      }

      const order = json.order;
      setEditingOrder({ id: order.id, order_number: order.order_number, town: order.town });

      // If the lookup response carries no town_id, fall back to matching the
      // order's stored town name against the loaded towns list — otherwise
      // townId stays empty and submitting would fail the "pick a town" check
      // on a field the user can no longer edit.
      const matchedTown =
        towns.find((t) => t.id === order.town_id) ??
        towns.find(
          (t) => t.name.trim().toLowerCase() === String(order.town ?? "").trim().toLowerCase()
        );

      setTownId(order.town_id ?? matchedTown?.id ?? "");
      setTownQuery(matchedTown ? townLabel(matchedTown) : order.town ?? "");
      setTownSuggestions([]);
      setShowTownDropdown(false);

      const newQtys: Record<string, string> = {};
      for (const line of order.order_items ?? []) {
        if (line.item_id) newQtys[line.item_id] = String(line.qty);
      }
      setQtys(newQtys);

      setShowEditSearch(false);
      setEditSearchTown("");
      setEditSearchOrderNumber("");
      setEditTownSuggestions([]);
      setShowEditTownDropdown(false);
    } catch (err: any) {
      setEditSearchError("کچھ غلط ہو گیا۔ براہ کرم دوبارہ کوشش کریں۔");
    } finally {
      setEditSearchLoading(false);
    }
  }

  function cancelEditing() {
    setEditingOrder(null);
    setQtys({});
    setTownId("");
    setTownQuery("");
    setTownSuggestions([]);
    setShowTownDropdown(false);
    setError(null);
  }

  // Copies "Town Name : ..." / "Order ID   : ..." to the clipboard for one
  // order number, using the town the order was actually booked under
  // (still held in townQuery at this point, since it's only cleared when
  // the confirmation screen is dismissed).
  async function copyOrderDetails(orderNumber: string) {
    const town = townQuery.trim() || "-";
    const text = `Town Name : ${town}\nOrder ID   : ${orderNumber}`;

    async function markCopied() {
      setCopiedOrder(orderNumber);
      setTimeout(() => {
        setCopiedOrder((prev) => (prev === orderNumber ? null : prev));
      }, 1500);
    }

    try {
      await navigator.clipboard.writeText(text);
      markCopied();
    } catch {
      // Clipboard API can be unavailable (older browsers, non-HTTPS, no
      // permission) — fall back to a hidden textarea + execCommand.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      ta.style.pointerEvents = "none";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand("copy");
        markCopied();
      } catch {
        // Nothing more we can do — leave state as-is, no confirmation shown.
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  // ---- TO's Secondary Ach. Report screen ----------------------------------
  // Deliberately NOT gated by the 9am–6pm booking-hours overlay (it's a
  // month-end report, not a booking) — only the device-time-tamper guard
  // applies here.
  if (reportMode) {
    const cfg = reportConfig;

    // Shell shared by the small status screens (loading / closed / done)
    const statusScreen = (content: React.ReactNode) => (
      <div className={styles.page} style={{ overflowX: "hidden" }}>
        <main className={styles.wrapper} style={{ maxWidth: 480, width: "100%", margin: "0 auto" }}>
          <Header />
          {content}
        </main>
        {deviceTimeTampered && <DeviceTimeWarningOverlay />}
      </div>
    );

    if (!cfg) {
      return statusScreen(
        <div className={styles.stateCard}>
          <div className={styles.spinner} />
          Loading...
        </div>
      );
    }

    if (!cfg.enabled) {
      return statusScreen(
        <div className={styles.confirmCard}>
          <p style={{ ...urduFont, fontSize: 15, color: "#d62828", textAlign: "center", lineHeight: 2, margin: "0 0 14px" }}>
            {REPORT_DISABLED_MESSAGE}
          </p>
          <button className={styles.secondaryBtn} onClick={exitReport}>
            Back to booking
          </button>
        </div>
      );
    }

    const prevLabel = monthLabel(cfg.prev_month, cfg.prev_year);
    const curLabel = monthLabel(cfg.month, cfg.year);
    const stepTitles = [
      `Closing/Opening Report [${prevLabel}]`,
      `Secondary Sale [${curLabel}]`,
      `Closing Stock [${curLabel}]`,
    ];
    const fieldsLocked = reportStep > 0 || deviceTimeTampered;
    const lockedFieldStyle: React.CSSProperties = { background: "#f1f3f7", color: "#555", cursor: "not-allowed" };

    if (reportDone) {
      return statusScreen(
        <div className={styles.confirmCard}>
          <div className={styles.confirmIcon}>
            <CheckIcon />
          </div>
          <h1 style={{ fontSize: 21, margin: "0 0 8px", color: "#0b2b5b" }}>Report submitted</h1>
          <p style={{ fontSize: 15, color: "#555", margin: 0 }}>
            {reportToName.trim()} — {reportTownQuery.trim()}
          </p>
          <button className={styles.secondaryBtn} onClick={exitReport}>
            Back to booking
          </button>
        </div>
      );
    }

    // ---- Results screen: Confirm / Cancel before anything is filed ----
    if (reportReview) {
      return statusScreen(
        <>
          <div
            style={{
              background: "#eef3fb",
              border: "1px solid #cddaf0",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 10,
              fontSize: 15,
              fontWeight: 700,
              color: "#0b2b5b",
              textAlign: "center",
            }}
          >
            Report Summary
          </div>

          <div style={{ ...summaryCardStyle, marginTop: 0 }}>
            <div style={reviewInfoRowStyle}>
              <span style={reviewInfoLabelStyle}>Town</span>
              <strong style={{ ...urduFont, color: "#0b2b5b" }}>{reportTownQuery.trim()}</strong>
            </div>
            <div style={reviewInfoRowStyle}>
              <span style={reviewInfoLabelStyle}>TO&apos;s Name</span>
              <strong style={{ ...urduFont, color: "#0b2b5b" }}>{reportToName.trim()}</strong>
            </div>
          </div>

          {[0, 1, 2].map((step) => (
            <ReportReviewSection key={step} title={stepTitles[step]} items={items} qtys={reportQtys[step] ?? {}} />
          ))}

          {reportError && (
            <div
              className={styles.errorBanner}
              style={isUrduText(reportError) ? { ...urduFont, textAlign: "right", marginTop: 12 } : { marginTop: 12 }}
            >
              {reportError}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
            <button
              type="button"
              onClick={confirmReport}
              disabled={reportSubmitting || deviceTimeTampered}
              className={styles.submitBtn}
              style={{ width: "100%", display: "block", ...urduFont }}
            >
              {reportSubmitting ? "جمع ہو رہا ہے..." : "تصدیق کریں"}
            </button>
            <button
              type="button"
              onClick={cancelReportReview}
              disabled={reportSubmitting}
              style={{
                width: "100%",
                padding: "10px 0",
                background: "none",
                border: "1px solid #ccc",
                borderRadius: 8,
                cursor: "pointer",
                color: "#666",
                fontSize: 14,
                ...urduFont,
              }}
            >
              منسوخ کریں
            </button>
          </div>

          <BrandFooter />
        </>
      );
    }

    return (
      <div className={styles.page} style={{ overflowX: "hidden" }}>
        <main className={styles.wrapper} style={{ maxWidth: 480, width: "100%", margin: "0 auto" }}>
          <Header />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <button
              type="button"
              onClick={exitReport}
              style={editOrderButtonStyle}
            >
              ← Back to Booking
            </button>
            <span style={{ fontSize: 12, color: "#666", fontWeight: 600 }}>Step {reportStep + 1} of 3</span>
          </div>

          <div
            style={{
              background: "#eef3fb",
              border: "1px solid #cddaf0",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 10,
              fontSize: 15,
              fontWeight: 700,
              color: "#0b2b5b",
              textAlign: "center",
            }}
          >
            {stepTitles[reportStep]}
          </div>

          <div className={styles.card} style={{ overflow: "visible", position: "relative", zIndex: 10 }}>
            <div className={styles.fieldGrid}>
              <div style={{ gridColumn: "1 / -1", position: "relative", zIndex: 50 }} ref={reportTownBoxRef}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <label className={styles.fieldLabel}>Town</label>
                  <span style={{ fontSize: 12, color: "#666", fontVariantNumeric: "tabular-nums" }}>
                    Current Time / Date: {pkTime}
                  </span>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    className={styles.select}
                    style={{
                      width: "100%",
                      ...urduFont,
                      ...(fieldsLocked ? lockedFieldStyle : null),
                      ...(reportTownFiled ? { borderColor: "#d62828" } : null),
                    }}
                    placeholder="ٹاؤن تلاش کرنے کے لیے ٹائپ کریں..."
                    value={reportTownQuery}
                    onChange={(e) => handleReportTownChange(e.target.value)}
                    onFocus={() => {
                      if (fieldsLocked) return;
                      if (reportTownSuggestions.length > 0) setShowReportTownDropdown(true);
                    }}
                    readOnly={fieldsLocked}
                    aria-readonly={fieldsLocked}
                    autoComplete="off"
                  />
                  {!fieldsLocked && showReportTownDropdown && reportTownSuggestions.length > 0 && (
                    <ul style={dropdownStyle}>
                      {reportTownSuggestions.map((t) => (
                        <li key={t.id} onClick={() => selectReportTown(t)} style={dropdownItemStyle}>
                          {townLabel(t)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!fieldsLocked && showReportTownDropdown && reportTownSuggestions.length === 0 && reportTownQuery.trim() && (
                    <ul style={dropdownStyle}>
                      <li style={{ ...dropdownItemStyle, ...urduFont, color: "#888", cursor: "default" }}>
                        کوئی ٹاؤن نہیں ملا۔
                      </li>
                    </ul>
                  )}
                </div>
                {reportTownFiled && (
                  <div style={{ fontSize: 12, color: "#d62828", marginTop: 4, lineHeight: 1.8, ...urduFont, textAlign: "right" }}>
                    {REPORT_ALREADY_FILED_MESSAGE}
                  </div>
                )}
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label className={styles.fieldLabel}>TO&apos;s Name</label>
                {reportStep === 0 && !deviceTimeTampered && reportCandidates.length > 1 ? (
                  <select
                    className={styles.select}
                    style={{ width: "100%", ...urduFont }}
                    value={reportToId}
                    onChange={(e) => selectReportTo(e.target.value)}
                  >
                    <option value="">ٹی او منتخب کریں</option>
                    {reportCandidates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={styles.select}
                    style={{ width: "100%", ...urduFont, ...lockedFieldStyle }}
                    value={reportToName}
                    readOnly
                    aria-readonly
                    autoComplete="off"
                  />
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className={styles.stateCard}>
              <div className={styles.spinner} />
              Loading catalog...
            </div>
          ) : loadError ? (
            <div className={`${styles.stateCard} ${styles.errorState}`}>
              Couldn&apos;t load the page: {loadError}. Try refreshing — if this keeps happening, the catalog may not
              be set up yet.
            </div>
          ) : items.length === 0 ? (
            <div className={`${styles.stateCard} ${styles.errorState}`}>
              No items found in the catalog. Add items in the admin panel first.
            </div>
          ) : (
            // key={reportStep} so each step gets a fresh table (and the row fade-in replays)
            <ReportItemsTable
              key={reportStep}
              items={items}
              qtys={reportQtys[reportStep] ?? {}}
              onChange={(itemId, value) => updateReportQty(reportStep, itemId, value)}
              disabled={deviceTimeTampered}
            />
          )}

          {reportError && (
            <div
              className={styles.errorBanner}
              style={isUrduText(reportError) ? { ...urduFont, textAlign: "right" } : undefined}
            >
              {reportError}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {reportStep < 2 ? (
              <button
                type="button"
                onClick={reportNext}
                disabled={
                  loading ||
                  !!loadError ||
                  items.length === 0 ||
                  deviceTimeTampered ||
                  (reportStep === 0 && reportTownFiled)
                }
                className={styles.submitBtn}
                style={{ width: "100%", display: "block", ...urduFont }}
              >
                اگلا مرحلہ
              </button>
            ) : (
              <button
                type="button"
                onClick={openReportReview}
                disabled={loading || !!loadError || items.length === 0 || deviceTimeTampered}
                className={styles.submitBtn}
                style={{ width: "100%", display: "block", ...urduFont }}
              >
                رپورٹ جمع کریں
              </button>
            )}

            {reportStep > 0 && (
              <button
                type="button"
                onClick={reportBack}
                style={{
                  width: "100%",
                  padding: "10px 0",
                  background: "none",
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: "#666",
                  fontSize: 14,
                  ...urduFont,
                }}
              >
                پیچھے
              </button>
            )}
          </div>

          <BrandFooter />
        </main>
        {deviceTimeTampered && <DeviceTimeWarningOverlay />}
      </div>
    );
  }

  if (confirmedOrderNumbers) {
    return (
      <div className={styles.page} style={{ overflowX: "hidden" }}>
      <main className={styles.wrapper} style={{ maxWidth: 480, width: "100%", margin: "0 auto" }}>
        <Header />
        <div className={styles.confirmCard}>
          <div className={styles.confirmIcon}>
            <CheckIcon />
          </div>
          <h1 style={{ fontSize: 21, margin: "0 0 8px", color: "#0b2b5b" }}>
            {wasEdit ? "Order updated" : "Order booked"}
          </h1>
          <p style={{ fontSize: 15, color: "#555", margin: 0 }}>
            {wasEdit
              ? "Your order has been updated."
              : confirmedOrderNumbers.length === 1
              ? "Your order number is:"
              : "Your order numbers are:"}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", margin: "10px 0 4px" }}>
            {confirmedOrderNumbers.map((num) => (
              <div key={num} style={orderRowStyle}>
                <span style={{ fontWeight: 700, color: "#0b2b5b", fontSize: 15, fontVariantNumeric: "tabular-nums" }}>
                  {num}
                </span>
                <button
                  type="button"
                  onClick={() => copyOrderDetails(num)}
                  style={copyBtnStyle}
                  title="Copy town & order ID"
                  aria-label={`Copy town and order ID for ${num}`}
                >
                  {copiedOrder === num ? <SmallCheckIcon /> : <CopyIcon />}
                  <span>{copiedOrder === num ? "Copied" : "Copy"}</span>
                </button>
              </div>
            ))}
          </div>

          <button
            className={styles.secondaryBtn}
            onClick={() => {
              setConfirmedOrderNumbers(null);
              setCopiedOrder(null);
              setWasEdit(false);
              setEditingOrder(null);
              setQtys({});
              setTownId("");
              setTownQuery("");
              setTownSuggestions([]);
              setShowTownDropdown(false);
            }}
          >
            Book another order
          </button>
        </div>
      </main>
      {deviceTimeTampered ? (
        <DeviceTimeWarningOverlay />
      ) : (
        bookingClosed && <BookingClosedOverlay remainingMs={closedRemainingMs} />
      )}
      </div>
    );
  }

  return (
    <div className={styles.page} style={{ overflowX: "hidden" }}>
    <main className={styles.wrapper} style={{ maxWidth: 480, width: "100%", margin: "0 auto" }}>
      <Header />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <button
          type="button"
          onClick={openReport}
          disabled={deviceTimeTampered}
          style={{ ...editOrderButtonStyle, ...(deviceTimeTampered ? { opacity: 0.5, cursor: "not-allowed" } : null) }}
        >
          TO,s Secondary Ach. Report
        </button>
        <button
          type="button"
          onClick={() => !deviceTimeTampered && setShowEditSearch(true)}
          disabled={deviceTimeTampered}
          style={{ ...editOrderButtonStyle, ...urduFont, ...(deviceTimeTampered ? { opacity: 0.5, cursor: "not-allowed" } : null) }}
        >
          آرڈر میں تبدیلی
        </button>
      </div>

      {editingOrder && (
        <div
          style={{
            background: "#eef3fb",
            border: "1px solid #cddaf0",
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 10,
            fontSize: 13,
            color: "#0b2b5b",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            ...urduFont,
            direction: "rtl",
          }}
        >
          <span>
            آرڈر میں ترمیم ہو رہی ہے: <strong>{editingOrder.order_number}</strong> ({editingOrder.town})
          </span>
          <button
            type="button"
            onClick={cancelEditing}
            style={{ background: "none", border: "none", color: "#0b2b5b", textDecoration: "underline", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap", ...urduFont }}
          >
            منسوخ کریں
          </button>
        </div>
      )}

      <form onSubmit={handleFormSubmit}>
        <div className={styles.card} style={{ overflow: "visible", position: "relative", zIndex: 10 }}>
          <div className={styles.fieldGrid}>
            <div style={{ gridColumn: "1 / -1", position: "relative", zIndex: 50 }} ref={townBoxRef}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <label className={styles.fieldLabel}>Town</label>
                <span style={{ fontSize: 12, color: "#666", fontVariantNumeric: "tabular-nums" }}>
                  Current Time / Date: {pkTime}
                </span>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  className={styles.select}
                  style={{
                    width: "100%",
                    ...urduFont,
                    ...(townLocked || deviceTimeTampered
                      ? { background: "#f1f3f7", color: "#555", cursor: "not-allowed" }
                      : null),
                  }}
                  placeholder="ٹاؤن تلاش کرنے کے لیے ٹائپ کریں..."
                  value={townQuery}
                  onChange={(e) => handleTownInputChange(e.target.value)}
                  onFocus={() => {
                    if (townLocked || deviceTimeTampered) return;
                    if (townSuggestions.length > 0) setShowTownDropdown(true);
                  }}
                  readOnly={townLocked || deviceTimeTampered}
                  aria-readonly={townLocked || deviceTimeTampered}
                  autoComplete="off"
                />
                {!townLocked && !deviceTimeTampered && showTownDropdown && townSuggestions.length > 0 && (
                  <ul style={dropdownStyle}>
                    {townSuggestions.map((t) => (
                      <li key={t.id} onClick={() => selectTown(t)} style={dropdownItemStyle}>
                        {townLabel(t)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {townLocked && (
                <div style={{ fontSize: 11, color: "#888", marginTop: 4, ...urduFont, textAlign: "right" }}>
                  {TOWN_LOCKED_MESSAGE}
                </div>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className={styles.stateCard}>
            <div className={styles.spinner} />
            Loading catalog...
          </div>
        ) : loadError ? (
          <div className={`${styles.stateCard} ${styles.errorState}`}>
            Couldn&apos;t load the booking page: {loadError}. Try refreshing — if this keeps happening,
            the catalog may not be set up yet.
          </div>
        ) : items.length === 0 ? (
          <div className={`${styles.stateCard} ${styles.errorState}`}>
            No items found in the catalog. Add items in the admin panel before orders can be booked.
          </div>
        ) : (
          <div className={styles.tableOuter} style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 480, margin: "0 auto" }}>
          <div className={styles.tableWrap} style={{ overflowX: "hidden", width: "100%" }}>
            <table className={styles.table} style={{ tableLayout: "fixed", width: "100%", maxWidth: "100%", minWidth: 0, borderCollapse: "collapse" }}>
              <colgroup>
                <col style={{ width: "54%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "26%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Item</th>
                  <th className={styles.center} style={{ textAlign: "center", padding: "6px 8px" }}>Qty</th>
                  <th className={styles.right} style={{ textAlign: "right", padding: "6px 8px" }}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ item, weight, kind }, i) => {
                  const isGroupEnd = i === rows.length - 1 || rows[i + 1].kind !== kind;
                  const hasConflict = conflictItemIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={isGroupEnd ? styles.groupEnd : undefined}
                      style={{
                        animation: "fadeUp 0.35s ease both",
                        animationDelay: `${Math.min(i * 0.02, 0.4)}s`,
                        borderBottom: isGroupEnd ? "3px solid #FFD400" : undefined,
                      }}
                    >
                      <td style={{ textAlign: "left", verticalAlign: "middle", padding: "6px 8px", whiteSpace: "normal", wordBreak: "break-word" }}>
                        <div className={styles.itemCell} style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
                          <span className={styles.itemIcon}>
                            <ProductIcon kind={kind} />
                          </span>
                          {item.name}
                        </div>
                      </td>
                      <td className={styles.center} style={{ textAlign: "center", verticalAlign: "middle", padding: "6px 8px" }}>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={qtys[item.id] ?? ""}
                          onChange={(e) => updateQty(item.id, e.target.value)}
                          disabled={deviceTimeTampered}
                          className={styles.qtyInput}
                          style={{
                            boxSizing: "border-box",
                            width: "100%",
                            maxWidth: 60,
                            minWidth: 0,
                            display: "block",
                            margin: "0 auto",
                            textAlign: "center",
                            borderColor: hasConflict ? "#d62828" : undefined,
                            ...(deviceTimeTampered ? { background: "#f1f3f7", cursor: "not-allowed" } : null),
                          }}
                        />
                      </td>
                      <td className={styles.right} style={{ textAlign: "right", verticalAlign: "middle", padding: "6px 8px" }}>
                        {weight ? weight.toFixed(2) : 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={summaryCardStyle}>
            <div style={statsRowStyle}>
              {[
                { label: "Weight (Ghee)", value: `${totals.gheeWeight.toFixed(2)} kg` },
                { label: "Weight (Oil)", value: `${totals.oilWeight.toFixed(2)} kg` },
                { label: "Weight (RSO)", value: `${totals.rsoWeight.toFixed(2)} kg` },
                { label: "Weight (SOAP)", value: `${totals.soapWeight.toFixed(2)} kg` },
              ].map((stat, idx) => (
                <div key={stat.label} style={{ ...statCellStyle, borderLeft: idx === 0 ? "none" : "1px solid #d8dde6" }}>
                  <div style={statLabelStyle}>{stat.label}</div>
                  <div style={statDividerStyle} />
                  <div style={statValueStyle}>{stat.value}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                ...summaryGrandTotalBarStyle,
                ...(grandTotalExceedsLimit
                  ? { background: "#fdeaea", color: "#d62828" }
                  : null),
              }}
            >
              <span>G.Total Weight (Ton)</span>
              <strong>{totals.grandTotalTon.toFixed(3)}</strong>
            </div>

            <div style={summaryAmountBarStyle}>
              <span>Total Amount in Pkr</span>
              <strong>Rs {Math.round(totals.amount).toLocaleString()}</strong>
            </div>
          </div>
          </div>
        )}

        {displayedError && (
          <div
            className={styles.errorBanner}
            style={isUrduText(displayedError) ? { ...urduFont, textAlign: "right" } : undefined}
          >
            {displayedError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || loading || !!loadError || items.length === 0 || deviceTimeTampered}
          className={styles.submitBtn}
          style={{ width: "100%", display: "block", ...urduFont }}
        >
          {submitting
            ? editingOrder
              ? "تبدیل ہو رہا ہے..."
              : "بک ہو رہا ہے..."
            : editingOrder
            ? "تبدیل کریں"
            : "ابھی بک کریں"}
        </button>
      </form>

      <BrandFooter />

      {showEditSearch && (
        <div style={modalOverlayStyle} onClick={() => setShowEditSearch(false)}>
          <div style={modalBoxStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 17, margin: "0 0 4px", color: "#0b2b5b", ...urduFont, textAlign: "right" }}>آرڈر میں تبدیلی</h2>
            <p style={{ fontSize: 13, color: "#666", margin: "0 0 14px", ...urduFont, textAlign: "right" }}>
              وہی ٹاؤن اور آرڈر آئی ڈی درج کریں جو بکنگ کے وقت استعمال کی گئی تھی۔
            </p>
            <form onSubmit={searchOrderToEdit}>
              <label style={{ display: "block", fontSize: 12, color: "#666", fontWeight: 600, marginBottom: 4, ...urduFont, textAlign: "right" }}>ٹاؤن</label>
              <div ref={editTownBoxRef} style={{ position: "relative", marginBottom: 12 }}>
                <input
                  value={editSearchTown}
                  onChange={(e) => handleEditSearchTownChange(e.target.value)}
                  onFocus={() => !deviceTimeTampered && editTownSuggestions.length > 0 && setShowEditTownDropdown(true)}
                  placeholder="ٹاؤن تلاش کرنے کے لیے ٹائپ کریں..."
                  autoComplete="off"
                  disabled={deviceTimeTampered}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: "1px solid #d9dde6",
                    borderRadius: 6,
                    boxSizing: "border-box",
                    fontSize: 14,
                    ...urduFont,
                    ...(deviceTimeTampered ? { background: "#f1f3f7", cursor: "not-allowed" } : null),
                  }}
                />
                {!deviceTimeTampered && showEditTownDropdown && editTownSuggestions.length > 0 && (
                  <ul style={dropdownStyle}>
                    {editTownSuggestions.map((t) => (
                      <li key={t.id} onClick={() => selectEditSearchTown(t)} style={dropdownItemStyle}>
                        {townLabel(t)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <label style={{ display: "block", fontSize: 12, color: "#666", fontWeight: 600, marginBottom: 4, ...urduFont, textAlign: "right" }}>آرڈر آئی ڈی</label>
              <input
                value={editSearchOrderNumber}
                onChange={(e) => !deviceTimeTampered && setEditSearchOrderNumber(e.target.value)}
                placeholder="مثال کے طور پر: 26090001"
                disabled={deviceTimeTampered}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  marginBottom: 14,
                  border: "1px solid #d9dde6",
                  borderRadius: 6,
                  boxSizing: "border-box",
                  fontSize: 14,
                  ...urduFont,
                  ...(deviceTimeTampered ? { background: "#f1f3f7", cursor: "not-allowed" } : null),
                }}
              />
              {editSearchError && (
                <div style={{ color: "#d62828", fontSize: 13, marginBottom: 12, ...urduFont, textAlign: "right" }}>{editSearchError}</div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditSearch(false);
                    setEditTownSuggestions([]);
                    setShowEditTownDropdown(false);
                  }}
                  style={{ flex: 1, padding: "10px 0", background: "none", border: "1px solid #ccc", borderRadius: 8, cursor: "pointer", color: "#666", fontSize: 14, ...urduFont }}
                >
                  منسوخ کریں
                </button>
                <button
                  type="submit"
                  disabled={editSearchLoading || deviceTimeTampered}
                  style={{ ...qtyOptionButtonStyle, flex: 1, ...urduFont }}
                >
                  {editSearchLoading ? "تلاش ہو رہی ہے..." : "تلاش کریں"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showQtyModal && (
        <div style={modalOverlayStyle} onClick={() => setShowQtyModal(false)}>
          <div style={modalBoxStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 17, margin: "0 0 4px", color: "#0b2b5b" }}>Order Quantity</h2>
            <p style={{ fontSize: 14, color: "#666", margin: "0 0 16px", ...urduFont, textAlign: "right" }}>
              اس ایک ہی آرڈر کے لیے کتنے بل بک کیے جائیں؟
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {QTY_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => bookOrders(n)}
                  style={qtyOptionButtonStyle}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowQtyModal(false)}
              style={{ marginTop: 16, background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 13 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {conflictModalNames && (
        <div style={modalOverlayStyle} onClick={() => setConflictModalNames(null)}>
          <div style={modalBoxStyle} onClick={(e) => e.stopPropagation()}>
            <p style={{ ...urduFont, fontSize: 15, color: "#d62828", margin: "0 0 12px", textAlign: "right", lineHeight: 1.7 }}>
              آپ 10 پیک اور 12 پیک ایک ساتھ نہیں لے سکتے — صرف ایک قسم منتخب کریں۔
            </p>
            <ul style={{ margin: "0 0 16px", paddingLeft: 18, fontSize: 13, color: "#444" }}>
              {conflictModalNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setConflictModalNames(null)}
              style={qtyOptionButtonStyle}
            >
              OK
            </button>
          </div>
        </div>
      )}
      {showReportClosedModal && (
        <div style={modalOverlayStyle} onClick={() => setShowReportClosedModal(false)}>
          <div style={modalBoxStyle} onClick={(e) => e.stopPropagation()}>
            <p style={{ ...urduFont, fontSize: 15, color: "#d62828", margin: "0 0 16px", textAlign: "right", lineHeight: 1.7 }}>
              {REPORT_DISABLED_MESSAGE}
            </p>
            <button type="button" onClick={() => setShowReportClosedModal(false)} style={qtyOptionButtonStyle}>
              OK
            </button>
          </div>
        </div>
      )}
      {showWeightLimitModal && (
        <div style={modalOverlayStyle} onClick={() => setShowWeightLimitModal(false)}>
          <div style={modalBoxStyle} onClick={(e) => e.stopPropagation()}>
            <p style={{ ...urduFont, fontSize: 15, color: "#d62828", margin: "0 0 16px", textAlign: "right", lineHeight: 1.7 }}>
              {WEIGHT_LIMIT_MESSAGE}
            </p>
            <button
              type="button"
              onClick={() => setShowWeightLimitModal(false)}
              style={qtyOptionButtonStyle}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </main>
    {deviceTimeTampered ? (
        <DeviceTimeWarningOverlay />
      ) : (
        bookingClosed && <BookingClosedOverlay remainingMs={closedRemainingMs} />
      )}
    </div>
  );
}

// Item table + weight summary used by every step of the TO's Secondary Ach.
// Report. Same look and weight working as the booking form's table (Item /
// Qty / Weight, group dividers, Ghee/Oil/RSO/SOAP stats, G.Total Weight),
// minus the amount bar and the 10-ton / pack-family booking rules, which
// don't apply to a report. Defined at module level (not inside BookPage) so
// typing in a qty box doesn't remount the inputs and drop focus.
function ReportItemsTable({
  items,
  qtys,
  onChange,
  disabled,
}: {
  items: Item[];
  qtys: Record<string, string>;
  onChange: (itemId: string, value: string) => void;
  disabled: boolean;
}) {
  const rows = items.map((item) => {
    const qty = parseFloat(qtys[item.id] || "0") || 0;
    const weight = qty * item.weight_kg;
    return { item, qty, weight, kind: getIconKind(item) };
  });

  let totalWeight = 0;
  let gheeWeight = 0;
  let oilWeight = 0;
  let rsoWeight = 0;
  let soapWeight = 0;
  for (const r of rows) {
    totalWeight += r.weight;
    if (r.item.type === "ghee") gheeWeight += r.weight;
    if (r.item.type === "oil") oilWeight += r.weight;
    if (r.kind === "bottle") rsoWeight += r.weight;
    if (r.kind === "soap") soapWeight += r.weight;
  }
  const grandTotalTon = totalWeight / 1000;

  return (
    <div className={styles.tableOuter} style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 480, margin: "0 auto" }}>
      <div className={styles.tableWrap} style={{ overflowX: "hidden", width: "100%" }}>
        <table className={styles.table} style={{ tableLayout: "fixed", width: "100%", maxWidth: "100%", minWidth: 0, borderCollapse: "collapse" }}>
          <colgroup>
            <col style={{ width: "54%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "26%" }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Item</th>
              <th className={styles.center} style={{ textAlign: "center", padding: "6px 8px" }}>Qty</th>
              <th className={styles.right} style={{ textAlign: "right", padding: "6px 8px" }}>Weight</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, weight, kind }, i) => {
              const isGroupEnd = i === rows.length - 1 || rows[i + 1].kind !== kind;
              return (
                <tr
                  key={item.id}
                  className={isGroupEnd ? styles.groupEnd : undefined}
                  style={{
                    animation: "fadeUp 0.35s ease both",
                    animationDelay: `${Math.min(i * 0.02, 0.4)}s`,
                    borderBottom: isGroupEnd ? "3px solid #FFD400" : undefined,
                  }}
                >
                  <td style={{ textAlign: "left", verticalAlign: "middle", padding: "6px 8px", whiteSpace: "normal", wordBreak: "break-word" }}>
                    <div className={styles.itemCell} style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
                      <span className={styles.itemIcon}>
                        <ProductIcon kind={kind} />
                      </span>
                      {item.name}
                    </div>
                  </td>
                  <td className={styles.center} style={{ textAlign: "center", verticalAlign: "middle", padding: "6px 8px" }}>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={qtys[item.id] ?? ""}
                      onChange={(e) => onChange(item.id, e.target.value)}
                      disabled={disabled}
                      className={styles.qtyInput}
                      style={{
                        boxSizing: "border-box",
                        width: "100%",
                        maxWidth: 60,
                        minWidth: 0,
                        display: "block",
                        margin: "0 auto",
                        textAlign: "center",
                        ...(disabled ? { background: "#f1f3f7", cursor: "not-allowed" } : null),
                      }}
                    />
                  </td>
                  <td className={styles.right} style={{ textAlign: "right", verticalAlign: "middle", padding: "6px 8px" }}>
                    {weight ? weight.toFixed(2) : 0}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={summaryCardStyle}>
        <div style={statsRowStyle}>
          {[
            { label: "Weight (Ghee)", value: `${gheeWeight.toFixed(2)} kg` },
            { label: "Weight (Oil)", value: `${oilWeight.toFixed(2)} kg` },
            { label: "Weight (RSO)", value: `${rsoWeight.toFixed(2)} kg` },
            { label: "Weight (SOAP)", value: `${soapWeight.toFixed(2)} kg` },
          ].map((stat, idx) => (
            <div key={stat.label} style={{ ...statCellStyle, borderLeft: idx === 0 ? "none" : "1px solid #d8dde6" }}>
              <div style={statLabelStyle}>{stat.label}</div>
              <div style={statDividerStyle} />
              <div style={statValueStyle}>{stat.value}</div>
            </div>
          ))}
        </div>

        <div style={summaryGrandTotalBarStyle}>
          <span>G.Total Weight (Ton)</span>
          <strong>{grandTotalTon.toFixed(3)}</strong>
        </div>
      </div>
    </div>
  );
}

// One page of the report on the results screen: only the items that have a
// quantity, with their weights and the page's total — read-only.
function ReportReviewSection({
  title,
  items,
  qtys,
}: {
  title: string;
  items: Item[];
  qtys: Record<string, string>;
}) {
  const rows = items
    .map((item) => {
      const qty = parseFloat(qtys[item.id] || "0") || 0;
      return { item, qty, weight: qty * item.weight_kg, kind: getIconKind(item) };
    })
    .filter((r) => r.qty > 0);
  const totalKg = rows.reduce((sum, r) => sum + r.weight, 0);

  return (
    <div style={{ ...summaryCardStyle, marginTop: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#0b2b5b", marginBottom: 6 }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "56%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "28%" }} />
        </colgroup>
        <thead>
          <tr style={{ color: "#666", fontSize: 11, textAlign: "left" }}>
            <th style={{ padding: "4px 4px", fontWeight: 600 }}>Item</th>
            <th style={{ padding: "4px 4px", fontWeight: 600, textAlign: "center" }}>Qty</th>
            <th style={{ padding: "4px 4px", fontWeight: 600, textAlign: "right" }}>Weight</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ item, qty, weight, kind }) => (
            <tr key={item.id} style={{ borderTop: "1px solid #e6e9ef" }}>
              <td style={{ padding: "5px 4px", wordBreak: "break-word" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <ProductIcon kind={kind} />
                  {item.name}
                </span>
              </td>
              <td style={{ padding: "5px 4px", textAlign: "center", fontWeight: 700, color: "#0b2b5b" }}>{qty}</td>
              <td style={{ padding: "5px 4px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {weight.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ ...summaryGrandTotalBarStyle, marginTop: 8 }}>
        <span>Total Weight (Ton)</span>
        <strong>{(totalKg / 1000).toFixed(3)}</strong>
      </div>
    </div>
  );
}

// Branding footer (logo + contact), shared by the booking form and the
// TO's Secondary Ach. Report screens.
function BrandFooter() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 20, padding: "14px 0", fontSize: 12, color: "#888", lineHeight: 1.7 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/sh-automate-logo.png"
        alt="SH Automate"
        style={{ width: 70, height: "auto", flexShrink: 0, opacity: 0.85 }}
      />
      <div style={{ textAlign: "left" }}>
        <div>All Rights Reserved</div>
        <div style={{ fontWeight: 600, color: "#555" }}>SH Automation</div>
        <div>
          Mail:{" "}
          <a href="mailto:Haseebchaudhary8558@gmail.com" style={{ color: "#888" }}>
            Haseebchaudhary8558@gmail.com
          </a>
        </div>
        <div>
          Contact:{" "}
          <a href="tel:+923049657700" style={{ color: "#888" }}>
            +92 304 9657700
          </a>
        </div>
      </div>
    </div>
  );
}

// Full-screen red warning shown instead of (never alongside) the normal
// closed-hours popup once deviceTimeTampered is true. No dismiss handler —
// it only goes away once a verified online reading shows the device's
// clock is back within the tamper threshold. Note: this only shows the
// warning text the user asked for; it doesn't implement an actual device
// blacklist.
function DeviceTimeWarningOverlay() {
  return (
    <div style={closedOverlayStyle}>
      <div style={{ ...closedModalStyle, border: "2px solid #d62828" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <AlertTriangleIcon />
        </div>
        <p style={{ ...urduFont, fontSize: 16, color: "#d62828", fontWeight: 700, textAlign: "center", lineHeight: 2, margin: 0 }}>
          {DEVICE_TIME_WARNING_MESSAGE}
          <br />
          شکریہ
        </p>
      </div>
    </div>
  );
}

function AlertTriangleIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#d62828" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

// Full-screen popup shown outside 9am–6pm PKT. backdropFilter blurs the
// booking form behind it (no need to touch the form's own styles), and it
// has no dismiss handler — it can only go away once booking hours resume.
function BookingClosedOverlay({ remainingMs }: { remainingMs: number }) {
  const { hours, minutes } = getRemainingHoursMinutes(remainingMs);
  return (
    <div style={closedOverlayStyle}>
      <div style={closedModalStyle}>
        <p style={{ ...urduFont, fontSize: 16, color: "#0b2b5b", textAlign: "center", lineHeight: 2, margin: "0 0 20px" }}>
          بکنگ کرنے کا وقت صبح 9 بجے سے شام 6 بجے تک ہے۔
          <br />
          براہ مہربانی بکنگ کرنے کے لیے{" "}
          <span style={{ color: "#d62828", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {hours} گھنٹے {minutes} منٹ
          </span>{" "}
          بعد کوشش کریں۔
          <br />
          شکریہ
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 16, borderTop: "1px solid #e6e9ef" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/sh-automate-logo.png"
            alt="SH Automate"
            style={{ width: 56, height: "auto", flexShrink: 0, opacity: 0.9 }}
          />
          <div style={{ textAlign: "left", fontSize: 11, color: "#888", lineHeight: 1.6 }}>
            <div>All Rights Reserved</div>
            <div style={{ fontWeight: 600, color: "#555" }}>SH Automation</div>
            <div>
              Mail:{" "}
              <a href="mailto:Haseebchaudhary8558@gmail.com" style={{ color: "#888" }}>
                Haseebchaudhary8558@gmail.com
              </a>
            </div>
            <div>
              Contact:{" "}
              <a href="tel:+923049657700" style={{ color: "#888" }}>
                +92 304 9657700
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className={styles.hero}>
      <div className={styles.logoRow}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="ASIA GHEE MILLS (Pvt.) Ltd." className={styles.logo} />
        <div>
          <h1 className={styles.brandTitle}>ASIA GHEE MILLS (Pvt.) Ltd.</h1>
          <p className={styles.brandSub}>Order Booking</p>
        </div>
      </div>

      <Link href="/admin" title="Admin panel" aria-label="Open admin panel" className={styles.gearBtn}>
        <SettingsIcon />
      </Link>
    </div>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// Two-rectangle "copy" glyph used on the order-confirmation copy button.
function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

// Small checkmark shown briefly in place of CopyIcon once a copy succeeds.
function SmallCheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// Five distinct container glyphs — each has its own silhouette so
// tin/pack/bucket never read as the same shape at a glance:
//   tin    -> straight cylinder, flat rim + flat base
//   pack   -> square carton with a folded top flap
//   bucket -> wide-to-narrow trapezoid with a handle arc
//   bottle -> tapered oil bottle (RSO)
//   soap   -> rounded bar
function ProductIcon({ kind }: { kind: IconKind }) {
  if (kind === "tin") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="6.5" y="8" width="11" height="11.5" rx="0.6" fill="#F6C90E" stroke="#0B2B5B" strokeWidth="1.4" />
        <ellipse cx="12" cy="8" rx="5.5" ry="1.8" fill="#FDE58A" stroke="#0B2B5B" strokeWidth="1.4" />
        <ellipse cx="12" cy="19.5" rx="5.5" ry="1.2" fill="none" stroke="#0B2B5B" strokeWidth="1" opacity="0.5" />
        <rect x="9.5" y="4.6" width="5" height="1.7" rx="0.4" fill="#0B2B5B" />
      </svg>
    );
  }
  if (kind === "pack") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="9" width="14" height="11" rx="0.5" fill="#FDE9A8" stroke="#D62828" strokeWidth="1.4" />
        <path d="M5 9 9 5h6l4 4" fill="#FBE0B0" stroke="#D62828" strokeWidth="1.3" />
        <path d="M9 5v4M15 5v4" stroke="#D62828" strokeWidth="1" opacity="0.6" />
        <path d="M5 13.5h14" stroke="#0B2B5B" strokeWidth="1" opacity="0.4" />
      </svg>
    );
  }
  if (kind === "bottle") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M10 2.5h4v3.1l1.6 2.4c.4.6.6 1.3.6 2V19a2.5 2.5 0 0 1-2.5 2.5h-3.4A2.5 2.5 0 0 1 7.8 19v-9c0-.7.2-1.4.6-2L10 5.6V2.5z" fill="#CFE8E0" stroke="#0B2B5B" strokeWidth="1.4" />
        <rect x="9.6" y="1.4" width="4.8" height="1.6" rx="0.4" fill="#0B2B5B" />
        <rect x="8.2" y="11.5" width="7.6" height="5" fill="#1B8A6B" opacity="0.75" />
      </svg>
    );
  }
  if (kind === "soap") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="8.5" width="17" height="9" rx="4" fill="#F7D9E6" stroke="#0B2B5B" strokeWidth="1.4" />
        <path d="M7 10.8c3.5 1.6 6.5 1.6 10 0" stroke="#0B2B5B" strokeWidth="1" opacity="0.45" fill="none" />
      </svg>
    );
  }
  // bucket
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M5 7.5h14l-2 11.2a1.6 1.6 0 0 1-1.58 1.3H8.58A1.6 1.6 0 0 1 7 18.7L5 7.5z" fill="#DCE1E8" stroke="#0B2B5B" strokeWidth="1.4" />
      <path d="M4 7.5h16" stroke="#0B2B5B" strokeWidth="1.4" />
      <path d="M7.5 7.5c0-2.6 2-4 4.5-4s4.5 1.4 4.5 4" stroke="#0B2B5B" strokeWidth="1.3" fill="none" />
    </svg>
  );
}

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  maxHeight: 240,
  overflowY: "auto",
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: 8,
  boxShadow: "0 4px 14px rgba(0,0,0,0.1)",
  listStyle: "none",
  margin: 0,
  padding: 4,
  zIndex: 1000,
};

const dropdownItemStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 14,
  cursor: "pointer",
  borderRadius: 6,
};

const editOrderButtonStyle: React.CSSProperties = {
  padding: "5px 14px",
  fontSize: 12,
  fontWeight: 600,
  border: "1px solid #0b2b5b",
  color: "#0b2b5b",
  background: "#fff",
  borderRadius: 20,
  cursor: "pointer",
};

const closedOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(11, 43, 91, 0.28)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
  padding: 16,
};

const closedModalStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: "28px 22px",
  width: "100%",
  maxWidth: 380,
  boxShadow: "0 14px 36px rgba(0,0,0,0.28)",
};

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
  padding: 24,
  width: "100%",
  maxWidth: 360,
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};

const qtyOptionButtonStyle: React.CSSProperties = {
  flex: "1 1 60px",
  padding: "10px 0",
  fontSize: 16,
  fontWeight: 600,
  border: "1px solid #0b2b5b",
  color: "#0b2b5b",
  background: "#fff",
  borderRadius: 8,
  cursor: "pointer",
};

const summaryCardStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "12px 14px",
  background: "#fafbfd",
  border: "1px solid #e6e9ef",
  borderRadius: 10,
};

const statsRowStyle: React.CSSProperties = {
  display: "flex",
  background: "#fff",
  border: "1px solid #e6e9ef",
  borderRadius: 8,
  overflow: "hidden",
  marginBottom: 10,
};

const statCellStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "8px 4px",
  minWidth: 0,
};

const statLabelStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: "#666",
  textAlign: "center",
  lineHeight: 1.2,
};

const statDividerStyle: React.CSSProperties = {
  width: "60%",
  height: 1,
  background: "#d8dde6",
  margin: "5px 0",
};

const statValueStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: "#0b2b5b",
};

const summaryGrandTotalBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 14,
  fontWeight: 700,
  color: "#8a4b00",
  background: "#fff4e0",
  borderRadius: 6,
  padding: "7px 8px",
};

const orderRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "8px 12px",
  background: "#f7f9fc",
  border: "1px solid #e6e9ef",
  borderRadius: 8,
};

const copyBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 600,
  border: "1px solid #0b2b5b",
  color: "#0b2b5b",
  background: "#fff",
  borderRadius: 20,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const summaryAmountBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 14,
  fontWeight: 700,
  color: "#0b5394",
  background: "#e8f2fc",
  borderRadius: 6,
  padding: "7px 8px",
  marginTop: 8,
};

const reviewInfoRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 10,
  padding: "4px 0",
  fontSize: 14,
};

const reviewInfoLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#666",
};
