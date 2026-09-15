// Destination: app/api/admin/orders/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { buildSoftCopyWorkbook, fetchWorkbookLookups } from "@/lib/ordersWorkbook";
import { buildOrderBookPdf } from "@/lib/ordersPdf";

// POST /api/admin/orders/export
// Returns both files as separate base64 payloads in one JSON response —
// NOT zipped together — so the client can trigger two independent
// downloads (Order Book.pdf and Soft copy.xlsx).
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

    const { catalogItems, townInfoByTownId } = await fetchWorkbookLookups(supabaseServer, orders);
    const itemNumberById = new Map<string, string | null>(
      catalogItems.map((it: any) => [it.id, it.item_number ?? null] as [string, string | null])
    );

    const pdfBuffer = await buildOrderBookPdf(orders, catalogItems, townInfoByTownId);
    const workbook = buildSoftCopyWorkbook(orders, itemNumberById);
    const xlsxBuffer = await workbook.xlsx.writeBuffer();

    const suffix = orders.length === 1 ? orders[0].order_number : `${orders.length}-orders`;

    return NextResponse.json({
      pdf: {
        filename: `Order Book - ${suffix}.pdf`,
        base64: Buffer.from(pdfBuffer).toString("base64"),
      },
      xlsx: {
        filename: `Soft copy - ${suffix}.xlsx`,
        base64: Buffer.from(xlsxBuffer).toString("base64"),
      },
    });
  } catch (err: any) {
    console.error("orders export failed:", err);
    return NextResponse.json({ error: err?.message ?? "Export failed unexpectedly" }, { status: 500 });
  }
}