// Destination: lib/secondaryReport.ts
// Pure helpers (no server imports) — safe to use from both client and
// server code for the TO's Secondary Ach. Report.

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Pakistan calendar month/year for a UTC timestamp (PKT is a fixed UTC+5).
export function getPktMonthYear(ms: number): { month: number; year: number } {
  const d = new Date(ms + 5 * 60 * 60 * 1000);
  return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}

export interface ReportPeriod {
  month: number; // pages 2 + 3
  year: number;
  prev_month: number; // page 1 — always the month before `month`
  prev_year: number;
}

// The admin only picks a month. The year is automatic: the current
// (Pakistan) year — except a month that is still ahead of the current
// month can only mean last year's (e.g. in January, selecting December
// means December of the previous year). Page 1 is always the month
// before the selected one (January -> previous December, year - 1).
export function resolveReportPeriod(selectedMonth: number, nowMs: number): ReportPeriod {
  const { month: curMonth, year: curYear } = getPktMonthYear(nowMs);
  const month = Math.min(12, Math.max(1, Math.round(selectedMonth) || curMonth));
  const year = month > curMonth ? curYear - 1 : curYear;
  const prev_month = month === 1 ? 12 : month - 1;
  const prev_year = month === 1 ? year - 1 : year;
  return { month, year, prev_month, prev_year };
}

export function monthLabel(month: number, year: number): string {
  return `${MONTH_NAMES[(month - 1 + 12) % 12]} ${year}`;
}

// Urdu messages shown on the public /book page.
export const REPORT_ALREADY_FILED_MESSAGE =
  "منتخب کردہ ٹاؤن کی رپورٹ پہلے ہی جمع کروائی جا چکی ہے۔ کسی بھی مسئلے کی صورت میں سیلز ٹیم سے رابطہ کریں۔";
// Shown in the popup when the admin has switched the report page OFF.
export const REPORT_DISABLED_MESSAGE =
  "یہ رپورٹ فی الحال دستیاب نہیں ہے۔ براہ کرم کچھ دیر بعد کوشش کریں یا سیلز ٹیم آفس سے رابطہ کریں۔";
export const REPORT_NO_TO_MESSAGE =
  "اس ٹاؤن کے لیے کوئی ٹی او مقرر نہیں ہے۔ براہ کرم سیلز ٹیم سے رابطہ کریں۔";
export const REPORT_SELECT_TO_MESSAGE = "براہ کرم ٹی او منتخب کریں۔";

// The TO's that can file for a town. A town has at most one TO, so this is
// either empty or a single entry.
export function tosForTown<T extends { town_id: string }>(tos: T[], townId: string): T[] {
  return tos.filter((t) => t.town_id === townId);
}
