// Destination: lib/secondaryReportServer.ts
// Server-only: reads the report ON/OFF + month settings and works out the
// active period. Import only from API routes.
import { supabaseServer } from "@/lib/supabase";
import { getPktMonthYear, resolveReportPeriod } from "@/lib/secondaryReport";
import { SecondaryReportSettingsInfo } from "@/lib/types";

// Reads the single settings row (secondary_report_settings, id = 1).
// If the row/table is missing it falls back to: page ON, month = current
// Pakistan month. Pass `strict: true` (admin routes) to surface a missing
// table as an error instead of silently using the defaults.
export async function loadSecondaryReportSettings(
  opts: { strict?: boolean } = {}
): Promise<SecondaryReportSettingsInfo> {
  const { data, error } = await supabaseServer
    .from("secondary_report_settings")
    .select("enabled, selected_month")
    .eq("id", 1)
    .maybeSingle();

  if (error && opts.strict) {
    throw new Error(error.message);
  }

  const nowMs = Date.now();
  const enabled = data ? data.enabled !== false : true;
  const m = Number(data?.selected_month);
  const selected_month = m >= 1 && m <= 12 ? m : getPktMonthYear(nowMs).month;

  return { enabled, selected_month, ...resolveReportPeriod(selected_month, nowMs) };
}
