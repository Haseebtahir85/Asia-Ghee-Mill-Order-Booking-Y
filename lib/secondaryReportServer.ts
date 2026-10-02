// Destination: lib/secondaryReportServer.ts
// Server-only: reads the report ON/OFF + month settings and works out the
// active period. Import only from API routes.
import { supabaseServer } from "@/lib/supabase";
import { SR_ENABLED_KEY, SR_MONTH_KEY, getPktMonthYear, resolveReportPeriod, ReportPeriod } from "@/lib/secondaryReport";

export interface SecondaryReportSettings extends ReportPeriod {
  enabled: boolean;
  selected_month: number;
}

export async function loadSecondaryReportSettings(): Promise<SecondaryReportSettings> {
  const { data } = await supabaseServer
    .from("settings")
    .select("key, value")
    .in("key", [SR_ENABLED_KEY, SR_MONTH_KEY]);

  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value;

  const nowMs = Date.now();
  // Defaults: page ON, month = the current Pakistan month.
  const enabled = map[SR_ENABLED_KEY] === undefined ? true : map[SR_ENABLED_KEY] === "1";
  const parsed = parseInt(map[SR_MONTH_KEY] ?? "", 10);
  const selected_month = parsed >= 1 && parsed <= 12 ? parsed : getPktMonthYear(nowMs).month;

  return { enabled, selected_month, ...resolveReportPeriod(selected_month, nowMs) };
}
