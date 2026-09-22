"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Item, Town } from "@/lib/types";
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

// ---------------------------------------------------------------------------
// Canola / cooking-oil themed animation styles.
//
// Kept as one injected <style> block (rather than in book.module.css, which
// isn't available to edit here) so every animation used below — the one-time
// page-load intro, the header's swaying flower texture, and the Book button's
// oil-drip / ripple / petal-drift hover effects — lives in one place. Move
// these rules into book.module.css any time; the class/keyframe names won't
// collide with anything already in that file since they're all prefixed
// `oilAnim-`.
// ---------------------------------------------------------------------------
function OilCanolaAnimationStyles() {
  return (
    <style>{`
      @keyframes oilAnim-pageFadeSlideUp {
        from { opacity: 0; transform: translateY(18px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes oilAnim-introPour {
        0%   { stroke-dashoffset: 340; opacity: 1; }
        70%  { stroke-dashoffset: 0; opacity: 1; }
        100% { stroke-dashoffset: 0; opacity: 0; }
      }
      @keyframes oilAnim-introDrop {
        0%   { transform: translateY(-40px); opacity: 0; }
        35%  { opacity: 1; }
        60%  { transform: translateY(0); opacity: 1; }
        100% { transform: translateY(6px); opacity: 0; }
      }
      @keyframes oilAnim-introRipple {
        0%   { transform: scale(0.2); opacity: 0; }
        45%  { opacity: 0.55; }
        100% { transform: scale(2.6); opacity: 0; }
      }
      @keyframes oilAnim-introBloom {
        0%   { transform: scale(0) rotate(-25deg); opacity: 0; }
        60%  { transform: scale(1.15) rotate(6deg); opacity: 1; }
        100% { transform: scale(1) rotate(0deg); opacity: 1; }
      }
      @keyframes oilAnim-introFadeOut {
        0%   { opacity: 1; }
        80%  { opacity: 1; }
        100% { opacity: 0; visibility: hidden; }
      }
      @keyframes oilAnim-flowerSway {
        0%, 100% { transform: rotate(-6deg) translateY(0); }
        50%      { transform: rotate(6deg) translateY(-1.5px); }
      }
      @keyframes oilAnim-petalDrift {
        0%   { transform: translate(0, 0) rotate(0deg); opacity: 0; }
        15%  { opacity: 0.9; }
        100% { transform: translate(58px, -10px) rotate(140deg); opacity: 0; }
      }
      @keyframes oilAnim-dripFall {
        0%   { transform: translateY(-6px) scaleY(0.7); opacity: 0; }
        30%  { opacity: 1; }
        75%  { transform: translateY(20px) scaleY(1); opacity: 1; }
        100% { transform: translateY(26px) scaleY(1); opacity: 0; }
      }
      @keyframes oilAnim-btnRipple {
        0%   { transform: scale(0); opacity: 0.45; }
        100% { transform: scale(1); opacity: 0; }
      }

      /* Book button "turns to oil and flows down" when pressed */
      @keyframes oilAnim-oilOverlayFlow {
        0%   { clip-path: polygon(0 0,100% 0,100% 0,0 0); opacity: 0; }
        10%  { clip-path: polygon(0 0,100% 0,100% 32%,0 32%); opacity: 1; }
        38%  { clip-path: polygon(0 0,100% 0,100% 100%,88% 92%,80% 116%,72% 92%,64% 108%,56% 92%,48% 118%,40% 92%,32% 106%,24% 92%,16% 112%,8% 92%,0 100%); opacity: 1; }
        72%  { clip-path: polygon(0 0,100% 0,100% 230%,88% 195%,80% 265%,72% 195%,64% 245%,56% 195%,48% 270%,40% 195%,32% 235%,24% 195%,16% 255%,8% 195%,0 225%); opacity: 1; }
        100% { clip-path: polygon(0 0,100% 0,100% 380%,0 380%); opacity: 0; }
      }
      @keyframes oilAnim-btnLabelFade {
        0%   { opacity: 1; transform: translateY(0); }
        40%  { opacity: 0; transform: translateY(6px); }
        100% { opacity: 0; transform: translateY(6px); }
      }
      .oilAnim-btnOilOverlay {
        position: absolute;
        inset: 0;
        border-radius: 8px;
        background: linear-gradient(180deg, #F6C90E 0%, #D8A400 100%);
        clip-path: polygon(0 0,100% 0,100% 0,0 0);
        opacity: 0;
        pointer-events: none;
        z-index: 2;
      }
      .oilAnim-bookBtnWrap.oilAnim-melting .oilAnim-btnOilOverlay {
        animation: oilAnim-oilOverlayFlow 0.9s cubic-bezier(0.6, 0, 0.85, 0.35) forwards;
      }
      .oilAnim-btnRealLabel {
        display: inline-block;
      }
      .oilAnim-bookBtnWrap.oilAnim-melting .oilAnim-btnRealLabel {
        animation: oilAnim-btnLabelFade 0.5s ease forwards;
      }

      /* Qty-repeat sheet: slides up from the bottom edge, boundary looks
         dipped in oil (wavy amber band + hanging drip tails). */
      @keyframes oilAnim-sheetSlideUp {
        from { transform: translateY(100%); }
        to   { transform: translateY(0); }
      }
      @keyframes oilAnim-dripGrow {
        0%   { transform: scaleY(0); opacity: 0; }
        55%  { opacity: 1; }
        100% { transform: scaleY(1); opacity: 1; }
      }
      .oilAnim-sheetOverlay {
        position: fixed;
        inset: 0;
        background: rgba(11, 43, 91, 0.35);
        display: flex;
        align-items: flex-end;
        justify-content: center;
        z-index: 2000;
        padding: 0;
      }
      .oilAnim-qtySheet {
        position: relative;
        width: 100%;
        max-width: 420px;
        background: #fff;
        padding: 30px 22px 22px;
        box-shadow: 0 -12px 32px rgba(0,0,0,0.28);
        animation: oilAnim-sheetSlideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .oilAnim-dripEdgeSvg {
        position: absolute;
        top: -22px;
        left: 0;
        width: 100%;
        height: 34px;
        display: block;
        overflow: visible;
      }
      .oilAnim-dripTail {
        transform-origin: top center;
        animation: oilAnim-dripGrow 0.4s ease-out both;
      }

      .oilAnim-pageIn {
        animation: oilAnim-pageFadeSlideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      .oilAnim-headerTexture {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        border-radius: inherit;
        z-index: 0;
      }
      .oilAnim-headerFlower {
        position: absolute;
        bottom: -6px;
        transform-origin: bottom center;
        animation: oilAnim-flowerSway 4.5s ease-in-out infinite;
        opacity: 0.85;
      }

      .oilAnim-bookBtnWrap {
        position: relative;
        isolation: isolate;
      }
      .oilAnim-bookBtnDecor {
        position: absolute;
        inset: 0;
        overflow: visible;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.25s ease;
      }
      .oilAnim-bookBtnWrap:hover .oilAnim-bookBtnDecor {
        opacity: 1;
      }
      .oilAnim-bookBtnWrap:hover .oilAnim-dripDrop {
        animation: oilAnim-dripFall 1.1s ease-in infinite;
      }
      .oilAnim-bookBtnWrap:hover .oilAnim-driftPetal {
        animation: oilAnim-petalDrift 1.6s ease-out infinite;
      }
      .oilAnim-bookBtnWrap:active .oilAnim-clickRipple {
        animation: oilAnim-btnRipple 0.55s ease-out;
      }

      @media (prefers-reduced-motion: reduce) {
        .oilAnim-pageIn,
        .oilAnim-headerFlower,
        .oilAnim-bookBtnWrap:hover .oilAnim-dripDrop,
        .oilAnim-bookBtnWrap:hover .oilAnim-driftPetal,
        .oilAnim-bookBtnWrap:active .oilAnim-clickRipple,
        .oilAnim-bookBtnWrap.oilAnim-melting .oilAnim-btnOilOverlay,
        .oilAnim-bookBtnWrap.oilAnim-melting .oilAnim-btnRealLabel,
        .oilAnim-qtySheet,
        .oilAnim-dripTail {
          animation: none !important;
        }
      }
    `}</style>
  );
}

// One-time intro shown over the page on first mount: an oil stream "pours"
// in, lands as a droplet with a ripple, and a canola flower blooms beside
// it — then the whole thing fades out and stops blocking clicks. Purely
// decorative; it never gates or delays the real booking form underneath.
function PageLoadIntro({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        pointerEvents: "none",
        animation: "oilAnim-introFadeOut 1.5s ease forwards",
      }}
    >
      <svg width="180" height="160" viewBox="0 0 180 160" fill="none">
        {/* pouring oil stream */}
        <path
          d="M60 6 C 66 40, 92 55, 96 78"
          stroke="#D8A400"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
          strokeDasharray="340"
          strokeDashoffset="340"
          style={{ animation: "oilAnim-introPour 0.9s ease-in forwards" }}
        />
        {/* ripple where the oil lands */}
        <circle
          cx="96"
          cy="86"
          r="16"
          stroke="#D8A400"
          strokeWidth="2.5"
          fill="none"
          style={{ animation: "oilAnim-introRipple 0.9s ease-out 0.75s both" }}
        />
        {/* landed droplet */}
        <path
          d="M96 70 C 102 80, 106 86, 96 92 C 86 86, 90 80, 96 70Z"
          fill="#F0B90B"
          style={{ animation: "oilAnim-introDrop 0.7s ease-out 0.55s both", transformOrigin: "96px 80px" }}
        />
        {/* blooming canola flower */}
        <g style={{ animation: "oilAnim-introBloom 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.9s both", transformOrigin: "40px 120px" }}>
          <CanolaFlowerIcon cx={40} cy={120} scale={1.4} />
        </g>
      </svg>
    </div>
  );
}

// A single small four-petal canola flower — bright yellow petals, thin green
// stem/leaf — used both for the header texture strip and the intro bloom.
function CanolaFlowerIcon({ cx = 0, cy = 0, scale = 1 }: { cx?: number; cy?: number; scale?: number }) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale})`}>
      <line x1="0" y1="0" x2="0" y2="16" stroke="#3F7D3A" strokeWidth="2" strokeLinecap="round" />
      <path d="M0 10 Q -8 8 -9 14" stroke="#3F7D3A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <g>
        <ellipse cx="0" cy="-7" rx="3.4" ry="5.6" fill="#F6C90E" />
        <ellipse cx="6.5" cy="-2.5" rx="3.4" ry="5.6" fill="#F6C90E" transform="rotate(72 6.5 -2.5)" />
        <ellipse cx="4" cy="5.5" rx="3.4" ry="5.6" fill="#F6C90E" transform="rotate(144 4 5.5)" />
        <ellipse cx="-4" cy="5.5" rx="3.4" ry="5.6" fill="#F6C90E" transform="rotate(216 -4 5.5)" />
        <ellipse cx="-6.5" cy="-2.5" rx="3.4" ry="5.6" fill="#F6C90E" transform="rotate(288 -6.5 -2.5)" />
        <circle cx="0" cy="0" r="2.2" fill="#8A4B00" />
      </g>
    </g>
  );
}

// A thin decorative strip of swaying canola flowers, meant to sit along the
// bottom edge of the blue header as a subtle "texture" rather than a loud
// illustration — low opacity, staggered animation delays so the flowers
// don't all sway in lockstep.
function HeaderCanolaTexture() {
  const positions = [8, 15, 24, 33, 42, 52, 62, 71, 80, 89, 96];
  return (
    <div className="oilAnim-headerTexture" aria-hidden="true">
      {positions.map((leftPct, i) => (
        <svg
          key={leftPct}
          className="oilAnim-headerFlower"
          style={{
            left: `${leftPct}%`,
            animationDelay: `${(i % 5) * 0.35}s`,
          }}
          width="20"
          height="26"
          viewBox="-10 -13 20 26"
        >
          <CanolaFlowerIcon scale={i % 3 === 0 ? 0.9 : 0.7} />
        </svg>
      ))}
    </div>
  );
}

// A tiny oil-drop glyph used in the Book button's hover decoration.
function MiniOilDropIcon() {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
      <path d="M5 0 C 7 4, 10 6.5, 5 12 C 0 6.5, 3 4, 5 0Z" fill="#F0B90B" />
    </svg>
  );
}

// Decorative overlay rendered on top of the Book/Update button: an oil
// droplet drips from the top on hover, a canola petal drifts across, and a
// ripple pulses outward on click. Purely visual — pointer-events: none, so
// it never intercepts the actual submit click.
function BookButtonDecor() {
  return (
    <div className="oilAnim-bookBtnDecor" aria-hidden="true">
      <div className="oilAnim-dripDrop" style={{ position: "absolute", top: 2, left: "38%" }}>
        <MiniOilDropIcon />
      </div>
      <div className="oilAnim-dripDrop" style={{ position: "absolute", top: 2, left: "63%", animationDelay: "0.5s" }}>
        <MiniOilDropIcon />
      </div>
      <div className="oilAnim-driftPetal" style={{ position: "absolute", top: "50%", left: 6 }}>
        <svg width="12" height="12" viewBox="-6 -6 12 12">
          <ellipse cx="0" cy="0" rx="3" ry="5" fill="#FDE58A" />
        </svg>
      </div>
      <span
        className="oilAnim-clickRipple"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 8,
          background: "radial-gradient(circle, rgba(240,185,11,0.55) 0%, rgba(240,185,11,0) 70%)",
        }}
      />
    </div>
  );
}

// Rendered on top of the Book/Update button only while `melting` is true:
// a golden overlay grows from the top of the button into a dripping,
// flowing shape that pours downward and off the bottom of the button
// before fading — the "button turns to oil and flows down" effect.
// Purely visual (pointer-events: none); it plays for a fixed ~0.9s while
// the real submit is deferred, then the qty-repeat sheet takes over.
function BookButtonMeltOverlay() {
  return <div className="oilAnim-btnOilOverlay" aria-hidden="true" />;
}

// The "dipped in oil" boundary used along the top edge of the qty-repeat
// sheet: a wavy amber band with several hanging drip tails that grow in
// just after the sheet slides up, so the sheet's edge reads as if it
// emerged from a pool of oil rather than a plain straight border.
function OilDripEdge() {
  const dripX = [30, 92, 150, 210, 270, 330];
  return (
    <svg className="oilAnim-dripEdgeSvg" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M0 20 C 20 4, 40 4, 55 20 C 68 34, 80 34, 92 18 C 104 4, 118 4, 132 20 C 146 36, 158 34, 170 16 C 182 2, 196 2, 210 18 C 224 34, 236 32, 248 16 C 260 2, 274 2, 288 18 C 300 32, 312 32, 324 16 C 336 2, 350 2, 362 18 C 374 32, 388 30, 400 18 L 400 40 L 0 40 Z"
        fill="#D8A400"
      />
      {dripX.map((x, i) => (
        <path
          key={x}
          className="oilAnim-dripTail"
          style={{ animationDelay: `${0.35 + i * 0.09}s` }}
          d={`M${x - 4} 16 Q ${x} 32, ${x} 40 Q ${x + 4} 32, ${x + 4} 16 Z`}
          fill="#F0B90B"
        />
      ))}
    </svg>
  );
}

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
  // True for the ~0.9s "turns to oil and flows down" animation played on
  // the Book/Update button right after a valid submit is confirmed, before
  // the qty-repeat sheet (new order) or the actual update request (editing
  // order) proceeds. Reset back to false as soon as that next step starts.
  const [bookBtnMelting, setBookBtnMelting] = useState(false);
  const [conflictModalNames, setConflictModalNames] = useState<string[] | null>(null);
  const conflictSignatureRef = useRef<string>("");
  const [showWeightLimitModal, setShowWeightLimitModal] = useState(false);

  // One-time decorative intro (oil pour + canola bloom) shown on first
  // mount only, then dismissed for the rest of the session.
  const [showIntro, setShowIntro] = useState(true);

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

    // Play the "button turns to oil and flows down" animation first, then
    // move to the next step once it's had time to finish (~0.9s). The
    // button itself is disabled while bookBtnMelting is true (see the
    // submit button's disabled prop below) so this can't be triggered twice.
    setBookBtnMelting(true);
    window.setTimeout(() => {
      if (editingOrder) {
        submitEditOrder(lines);
      } else {
        setShowQtyModal(true);
      }
    }, 900);
  }

  async function bookOrders(copies: number) {
    setBookBtnMelting(false);
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
    setBookBtnMelting(false);
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

  if (confirmedOrderNumbers) {
    return (
      <div className={styles.page} style={{ overflowX: "hidden" }}>
      <OilCanolaAnimationStyles />
      {showIntro && <PageLoadIntro onDone={() => setShowIntro(false)} />}
      <main className={`${styles.wrapper} oilAnim-pageIn`} style={{ maxWidth: 480, width: "100%", margin: "0 auto" }}>
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
    <OilCanolaAnimationStyles />
    {showIntro && <PageLoadIntro onDone={() => setShowIntro(false)} />}
    <main className={`${styles.wrapper} oilAnim-pageIn`} style={{ maxWidth: 480, width: "100%", margin: "0 auto" }}>
      <Header />

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
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

        <div className={`oilAnim-bookBtnWrap${bookBtnMelting ? " oilAnim-melting" : ""}`}>
          <button
            type="submit"
            disabled={submitting || loading || !!loadError || items.length === 0 || deviceTimeTampered || bookBtnMelting}
            className={styles.submitBtn}
            style={{ width: "100%", display: "block", position: "relative", overflow: "hidden", ...urduFont }}
          >
            <span className="oilAnim-btnRealLabel">
              {submitting
                ? editingOrder
                  ? "تبدیل ہو رہا ہے..."
                  : "بک ہو رہا ہے..."
                : editingOrder
                ? "تبدیل کریں"
                : "ابھی بک کریں"}
            </span>
            {bookBtnMelting && <BookButtonMeltOverlay />}
          </button>
          <BookButtonDecor />
        </div>
      </form>

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
        <div
          className="oilAnim-sheetOverlay"
          onClick={() => {
            setShowQtyModal(false);
            setBookBtnMelting(false);
          }}
        >
          <div className="oilAnim-qtySheet" onClick={(e) => e.stopPropagation()}>
            <OilDripEdge />
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
              onClick={() => {
                setShowQtyModal(false);
                setBookBtnMelting(false);
              }}
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
    <div className={styles.hero} style={{ position: "relative", overflow: "hidden" }}>
      <HeaderCanolaTexture />
      <div className={styles.logoRow} style={{ position: "relative", zIndex: 1 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="ASIA GHEE MILLS (Pvt.) Ltd." className={styles.logo} />
        <div>
          <h1 className={styles.brandTitle}>ASIA GHEE MILLS (Pvt.) Ltd.</h1>
          <p className={styles.brandSub}>Order Booking</p>
        </div>
      </div>

      <Link href="/admin" title="Admin panel" aria-label="Open admin panel" className={styles.gearBtn} style={{ position: "relative", zIndex: 1 }}>
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