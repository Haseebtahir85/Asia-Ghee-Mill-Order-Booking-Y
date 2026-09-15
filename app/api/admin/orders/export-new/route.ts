// Destination: app/api/admin/orders/export-new/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { buildSoftCopyWorkbook, fetchWorkbookLookups } from "@/lib/ordersWorkbook";
import { buildOrderBookPdf } from "@/lib/ordersPdf";

// POST /api/admin/orders/export-new — exports every order created since
// the last time this endpoint ran, then advances the marker to the
// newest order just exported. The marker lives in admin_settings (a
// single row), not in the browser, so it's consistent across devices
// and admins rather than per-browser/localStorage.
//
// Returns both files as separate base64 payloads in one JSON response —
// NOT zipped together — so the client can trigger two independent
// downloads (Order Book.pdf and Soft copy.xlsx).
export async function POST() {
  try {
    const { data: settings, error: settingsError } = await supabaseServer
      .from("admin_settings")
      .select("last_order_export_at")
      .eq("id", 1)
      .maybeSingle();

    if (settingsError) {
      return NextResponse.json({ error: settingsError.message }, { status: 500 });
    }

    const since = settings?.last_order_export_at ?? null;

    let query = supabaseServer
      .from("orders")
      .select("*, order_items(*)")
      .order("created_at", { ascending: true });

    if (since) {
      query = query.gt("created_at", since);
    }

    const { data: orders, error: ordersError } = await query;

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }
    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: "No new orders since the last export" }, { status: 404 });
    }

    const { catalogItems, townInfoByTownId } = await fetchWorkbookLookups(supabaseServer, orders);
    const itemNumberById = new Map<string, string | null>(
      catalogItems.map((it: any) => [it.id, it.item_number ?? null] as [string, string | null])
    );

    const pdfBuffer = await buildOrderBookPdf(orders, catalogItems, townInfoByTownId);
    const workbook = buildSoftCopyWorkbook(orders, itemNumberById);
    const xlsxBuffer = await workbook.xlsx.writeBuffer();

    // Advance the marker to the newest order's created_at (not "now") so a
    // slow request can't accidentally skip an order created mid-export.
    const newestCreatedAt = orders.reduce((max, o) => (o.created_at > max ? o.created_at : max), orders[0].created_at);

    const { error: updateError } = await supabaseServer
      .from("admin_settings")
      .update({ last_order_export_at: newestCreatedAt })
      .eq("id", 1);

    return NextResponse.json({
      pdf: {
        filename: `Order Book - new-${orders.length}.pdf`,
        base64: Buffer.from(pdfBuffer).toString("base64"),
      },
      xlsx: {
        filename: `Soft copy - new-${orders.length}.xlsx`,
        base64: Buffer.from(xlsxBuffer).toString("base64"),
      },
      markerWarning: updateError ? "Failed to update last export marker — next export may repeat these orders" : undefined,
    });
  } catch (err: any) {
    console.error("new orders export failed:", err);
    return NextResponse.json({ error: err?.message ?? "Export failed unexpectedly" }, { status: 500 });
  }
}