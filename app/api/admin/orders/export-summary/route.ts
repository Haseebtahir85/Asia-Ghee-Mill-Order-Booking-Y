// Destination: app/api/admin/orders/export-summary/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { fetchWorkbookLookups } from "@/lib/ordersWorkbook";
import { buildOrderSummaryWorkbook } from "@/lib/orderSummaryWorkbook";

// POST /api/admin/orders/export-summary — takes the ids of whatever is
// currently filtered on the admin Orders page (Summary button) and
// returns just the category-pivot xlsx (no PDF) built from the live
// items catalog. See buildOrderCategoryPivotWorkbook in ordersWorkbook.ts
// for the grouping/weight rules.
export async function POST(req: Request) {
  try {
    const { ids } = await req.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No orders to summarize" }, { status: 400 });
    }

    const { data: orders, error: ordersError } = await supabaseServer
      .from("orders")
      .select("*, order_items(*)")
      .in("id", ids)
      .order("created_at", { ascending: true });

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }
    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: "No matching orders found" }, { status: 404 });
    }

    const { catalogItems } = await fetchWorkbookLookups(supabaseServer, orders);

    const workbook = buildOrderSummaryWorkbook(orders, catalogItems);
    const xlsxBuffer = await workbook.xlsx.writeBuffer();

    return NextResponse.json({
      xlsx: {
        filename: `Summary - ${orders.length} orders.xlsx`,
        base64: Buffer.from(xlsxBuffer).toString("base64"),
      },
    });
  } catch (err: any) {
    console.error("summary export failed:", err);
    return NextResponse.json({ error: err?.message ?? "Summary export failed unexpectedly" }, { status: 500 });
  }
}