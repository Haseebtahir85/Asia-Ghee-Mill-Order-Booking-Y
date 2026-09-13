// Destination: app/api/admin/orders/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { supabaseServer } from "@/lib/supabase";
import { buildOrdersWorkbook, fetchWorkbookLookups } from "@/lib/ordersWorkbook";
import { buildOrdersPdf } from "@/lib/ordersPdf";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "No orders selected" }, { status: 400 });
  }

  try {
    const { data: orders, error: ordersError } = await supabaseServer
      .from("orders")
      .select("*, order_items(*)")
      .in("id", ids);

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }
    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: "No matching orders found" }, { status: 404 });
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

    const zipName = orders.length === 1 ? `order-${orders[0].order_number}.zip` : `orders-export-${orders.length}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
      },
    });
  } catch (err: any) {
    // Surface the real failure instead of an opaque 500 — e.g. this is
    // where a pdfkit font-loading issue on the server would show up.
    console.error("orders export failed:", err);
    return NextResponse.json({ error: err?.message ?? "Export failed unexpectedly" }, { status: 500 });
  }
}
