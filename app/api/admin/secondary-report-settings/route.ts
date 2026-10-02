// Destination: app/api/admin/secondary-report-settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { loadSecondaryReportSettings } from "@/lib/secondaryReportServer";

// Never cache: the admin must always see (and the booking page must always
// act on) what is really saved in the database.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// GET /api/admin/secondary-report-settings — current ON/OFF + month + periods
export async function GET() {
  try {
    const settings = await loadSecondaryReportSettings({ strict: true });
    return NextResponse.json({ settings }, { headers: NO_STORE });
  } catch (err: any) {
    return NextResponse.json(
      { error: `${err.message} — did you run migration_v8_tos_settings.sql?` },
      { status: 500, headers: NO_STORE }
    );
  }
}

// PATCH /api/admin/secondary-report-settings
// Body: { enabled?: boolean, selected_month?: number (1-12) }
// Saves, then returns the settings exactly as stored.
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const patch: Record<string, unknown> = { id: 1 };

  if (body.enabled !== undefined) {
    patch.enabled = body.enabled === true || body.enabled === "1" || body.enabled === 1;
  }
  if (body.selected_month !== undefined) {
    const m = parseInt(String(body.selected_month), 10);
    if (!(m >= 1 && m <= 12)) {
      return NextResponse.json({ error: "selected_month must be 1-12" }, { status: 400, headers: NO_STORE });
    }
    patch.selected_month = m;
  }
  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400, headers: NO_STORE });
  }

  const { error } = await supabaseServer
    .from("secondary_report_settings")
    .upsert(patch, { onConflict: "id" });

  if (error) {
    return NextResponse.json(
      { error: `${error.message} — did you run migration_v8_tos_settings.sql?` },
      { status: 500, headers: NO_STORE }
    );
  }

  try {
    const settings = await loadSecondaryReportSettings({ strict: true });
    return NextResponse.json({ settings }, { headers: NO_STORE });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: NO_STORE });
  }
}
