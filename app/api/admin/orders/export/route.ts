// Destination: app/api/admin/orders/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { supabaseServer } from "@/lib/supabase";
import { buildSoftCopyWorkbook, fetchWorkbookLookups } from "@/lib/ordersWorkbook";
import { buildOrderBookPdf } from "@/lib/ordersPdf";

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
    const itemNumberById = new Map<string, string | null>(catalogItems.map((it: any) => [it.id, it.item_number ?? null] as [string, string | null]));

    const pdfBuffer = await buildOrderBookPdf(orders, catalogItems, discountByTownId);
    const workbook = buildSoftCopyWorkbook(orders, itemNumberById);
    const xlsxBuffer = await workbook.xlsx.writeBuffer();

    const zip = new JSZip();
    zip.file("Order Book.pdf", pdfBuffer);
    zip.file("Soft copy.xlsx", xlsxBuffer);
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
    console.error("orders export failed:", err);
    return NextResponse.json({ error: err?.message ?? "Export failed unexpectedly" }, { status: 500 });
  }
}