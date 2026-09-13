// Destination: app/api/admin/orders/export-new/route.ts
import { NextResponse } from "next/server";
import JSZip from "jszip";
import { supabaseServer } from "@/lib/supabase";
import { buildOrdersWorkbook, fetchWorkbookLookups } from "@/lib/ordersWorkbook";
import { buildOrdersPdf } from "@/lib/ordersPdf";

// POST /api/admin/orders/export-new — exports every order created since
// the last time this endpoint ran, then advances the marker to the
// newest order just exported. The marker lives in admin_settings (a
// single row), not in the browser, so it's consistent across devices
// and admins rather than per-browser/localStorage.
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

    const { catalogItems, discountByTownId } = await fetchWorkbookLookups(supabaseServer, orders);
    const itemNumberById = new Map(catalogItems.map((it: any) => [it.id, it.item_number ?? null]));

    const workbook = buildOrdersWorkbook(orders, catalogItems, discountByTownId);
    const xlsxBuffer = await workbook.xlsx.writeBuffer();
    const pdfBuffer = await buildOrdersPdf(orders, itemNumberById);

    const zip = new JSZip();
    zip.file("Order Book.xlsx", xlsxBuffer);
    zip.file("Soft copy.pdf", pdfBuffer);
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    // Advance the marker to the newest order's created_at (not "now") so a
    // slow request can't accidentally skip an order created mid-export.
    const newestCreatedAt = orders.reduce((max, o) => (o.created_at > max ? o.created_at : max), orders[0].created_at);

    const { error: updateError } = await supabaseServer
      .from("admin_settings")
      .update({ last_order_export_at: newestCreatedAt })
      .eq("id", 1);

    const zipName = `new-orders-${orders.length}.zip`;
    const headers: Record<string, string> = {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
    };
    if (updateError) {
      headers["X-Export-Marker-Warning"] = "Failed to update last export marker — next export may repeat these orders";
    }

    return new NextResponse(new Uint8Array(zipBuffer), { status: 200, headers });
  } catch (err: any) {
    // Surface the real failure instead of an opaque 500 — e.g. this is
    // where a pdfkit font-loading issue on the server would show up.
    console.error("new orders export failed:", err);
    return NextResponse.json({ error: err?.message ?? "Export failed unexpectedly" }, { status: 500 });
  }
}
