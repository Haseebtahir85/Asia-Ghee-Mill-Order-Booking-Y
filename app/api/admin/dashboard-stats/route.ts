// Destination: app/api/admin/dashboard-stats/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// GET /api/admin/dashboard-stats — total orders, orders since the last
// "New Order" export button press (same marker that button reads/
// advances), and a town-wise breakdown of both counts.
export async function GET() {
  const { data: settings, error: settingsError } = await supabaseServer
    .from("admin_settings")
    .select("last_order_export_at")
    .eq("id", 1)
    .maybeSingle();

  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 500 });
  }

  const since = settings?.last_order_export_at ?? null;

  const { data: orders, error: ordersError } = await supabaseServer
    .from("orders")
    .select("town, created_at");

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  const byTownMap = new Map<string, { total: number; new: number }>();
  let totalOrders = 0;
  let newOrdersCount = 0;

  for (const o of orders ?? []) {
    const town = o.town || "Unknown";
    const isNew = since ? o.created_at > since : true;

    totalOrders++;
    if (isNew) newOrdersCount++;

    const entry = byTownMap.get(town) ?? { total: 0, new: 0 };
    entry.total++;
    if (isNew) entry.new++;
    byTownMap.set(town, entry);
  }

  const byTown = Array.from(byTownMap.entries())
    .map(([town, counts]) => ({ town, ...counts }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({ totalOrders, newOrdersCount, lastExportAt: since, byTown });
}