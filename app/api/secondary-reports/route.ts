// Destination: app/api/secondary-reports/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { loadSecondaryReportSettings } from "@/lib/secondaryReportServer";
import { ReportStage } from "@/lib/types";

const STAGES: ReportStage[] = ["closing_opening", "secondary_sale", "closing_stock"];

type IncomingLine = { item_id: string; qty: number };

// POST /api/secondary-reports — public. File one TO's report (all 3 pages).
// Everything that matters is decided HERE, not trusted from the browser:
//   - the page must be switched ON in the admin settings
//   - the TO's name comes from the town's TO record
//   - the month/year come from the admin's saved settings
//   - a town can only file once per period
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const settings = await loadSecondaryReportSettings();
  if (!settings.enabled) {
    return NextResponse.json({ error: "This report is currently closed.", code: "DISABLED" }, { status: 403 });
  }

  const townId = String(body.town_id ?? "");
  if (!townId) {
    return NextResponse.json({ error: "town_id is required" }, { status: 400 });
  }

  // The town's TO (active only)
  const { data: to } = await supabaseServer
    .from("tos")
    .select("id, name, town_id, towns(name)")
    .eq("town_id", townId)
    .eq("is_active", true)
    .maybeSingle();

  if (!to) {
    return NextResponse.json({ error: "No TO is assigned to this town.", code: "NO_TO" }, { status: 400 });
  }
  const townName = (to as any).towns?.name ?? String(body.town ?? "");

  // Already filed for this period?
  const { data: already } = await supabaseServer
    .from("secondary_reports")
    .select("id")
    .eq("town_id", townId)
    .eq("report_month", settings.month)
    .eq("report_year", settings.year)
    .maybeSingle();
  if (already) {
    return NextResponse.json(
      { error: "A report for this town has already been filed.", code: "ALREADY_FILED" },
      { status: 409 }
    );
  }

  // Validate the three line lists
  const stageLines = {} as Record<ReportStage, IncomingLine[]>;
  const itemIds = new Set<string>();
  for (const stage of STAGES) {
    const raw = body[stage];
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: `${stage} must be an array` }, { status: 400 });
    }
    // merge duplicate item ids, drop zero/negative/non-numeric quantities
    const merged = new Map<string, number>();
    for (const l of raw) {
      const id = String(l?.item_id ?? "");
      const qty = Number(l?.qty);
      if (!id || !Number.isFinite(qty) || qty <= 0) continue;
      merged.set(id, (merged.get(id) ?? 0) + qty);
      itemIds.add(id);
    }
    if (merged.size === 0) {
      return NextResponse.json({ error: `Enter a quantity for at least one item on every page.` }, { status: 400 });
    }
    stageLines[stage] = Array.from(merged, ([item_id, qty]) => ({ item_id, qty }));
  }

  const { data: items, error: itemsErr } = await supabaseServer
    .from("items")
    .select("id, name, type, weight_kg, sort_order")
    .in("id", Array.from(itemIds));
  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }
  const itemMap = new Map((items ?? []).map((i: any) => [i.id, i]));
  for (const id of Array.from(itemIds)) {
    if (!itemMap.has(id)) {
      return NextResponse.json({ error: "One of the items no longer exists. Please reload the page." }, { status: 400 });
    }
  }

  // Create the report
  const { data: report, error: reportErr } = await supabaseServer
    .from("secondary_reports")
    .insert({
      report_month: settings.month,
      report_year: settings.year,
      town_id: townId,
      town_name: townName,
      to_id: to.id,
      to_name: to.name,
    })
    .select()
    .single();

  if (reportErr) {
    if (reportErr.code === "23505") {
      return NextResponse.json(
        { error: "A report for this town has already been filed.", code: "ALREADY_FILED" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: reportErr.message }, { status: 500 });
  }

  const rows = STAGES.flatMap((stage) =>
    stageLines[stage].map((l) => {
      const item: any = itemMap.get(l.item_id);
      return {
        report_id: report.id,
        stage,
        item_id: item.id,
        item_name: item.name,
        item_type: item.type,
        item_sort: item.sort_order ?? 0,
        weight_kg: item.weight_kg,
        qty: l.qty,
      };
    })
  );

  const { error: linesErr } = await supabaseServer.from("secondary_report_lines").insert(rows);
  if (linesErr) {
    // don't leave a half-filed report behind (it would block a retry)
    await supabaseServer.from("secondary_reports").delete().eq("id", report.id);
    return NextResponse.json({ error: linesErr.message }, { status: 500 });
  }

  return NextResponse.json({ report }, { status: 201 });
}
