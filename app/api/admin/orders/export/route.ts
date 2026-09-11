import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseServer } from "@/lib/supabase";
import { Order, OrderItem } from "@/lib/types";

// POST /api/admin/orders/export
// Body: { ids?: string[]; status?: string; from?: string; to?: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { ids, status, from, to } = body as {
    ids?: string[];
    status?: string;
    from?: string;
    to?: string;
  };

  let orderQuery = supabaseServer.from("orders").select("*").order("order_date", { ascending: false });

  if (ids && ids.length > 0) {
    orderQuery = orderQuery.in("id", ids);
  } else {
    if (status) orderQuery = orderQuery.eq("status", status);
    if (from) orderQuery = orderQuery.gte("order_date", from);
    if (to) orderQuery = orderQuery.lte("order_date", to);
  }

  const { data: orders, error: ordersError } = await orderQuery;
  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }
  if (!orders || orders.length === 0) {
    return NextResponse.json({ error: "No orders matched — nothing to export" }, { status: 404 });
  }

  const orderIds = (orders as Order[]).map((o) => o.id);
  const { data: lineItems, error: linesError } = await supabaseServer
    .from("order_items")
    .select("*")
    .in("order_id", orderIds);

  if (linesError) {
    return NextResponse.json({ error: linesError.message }, { status: 500 });
  }

  const workbook = XLSX.utils.book_new();

  // ---- Sheet 1: Orders summary ----
  const ordersRows = (orders as Order[]).map((o) => ({
    "Order #": o.order_number,
    "Date": o.order_date,
    "Customer": o.customer_name,
    "Town": o.town ?? "",
    "Status": o.status,
    "Amount": o.total_amount,
    "Weight (kg)": round(o.total_weight_kg),
    "Notes": o.notes ?? "",
  }));
  const ordersSheet = XLSX.utils.json_to_sheet(ordersRows);
  ordersSheet["!cols"] = [
    { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 15 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(workbook, ordersSheet, "Orders");

  // ---- Sheet 2: Item Totals (aggregated across the selected orders) ----
  const items = (lineItems as OrderItem[]) ?? [];
  const totalsByItem = new Map<
    string,
    { qty: number; rate: number; amount: number; type: string; weightKg: number }
  >();

  for (const li of items) {
    const key = li.item_name;
    const existing = totalsByItem.get(key);
    if (existing) {
      existing.qty += Number(li.qty);
      existing.amount += Number(li.amount);
      existing.weightKg += Number(li.weight_total_kg);
    } else {
      totalsByItem.set(key, {
        qty: Number(li.qty),
        rate: Number(li.rate),
        amount: Number(li.amount),
        type: li.item_type,
        weightKg: Number(li.weight_total_kg),
      });
    }
  }

  const itemRows = Array.from(totalsByItem.entries()).map(([name, t]) => ({
    "Item": name,
    "Qty": t.qty,
    "Rate": t.rate,
    "Amount": round(t.amount),
    "Weight (kg)": round(t.weightKg),
    "Type": t.type,
  }));
  const itemsSheet = XLSX.utils.json_to_sheet(itemRows);
  itemsSheet["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];

  const totalAmount = orders.reduce((s, o) => s + Number(o.total_amount), 0);
  const totalWeightKg = orders.reduce((s, o) => s + Number(o.total_weight_kg), 0);
  XLSX.utils.sheet_add_aoa(
    itemsSheet,
    [
      [],
      ["", "", "", "Total Amount", round(totalAmount)],
      ["", "", "", "Total Weight (kg)", round(totalWeightKg)],
      ["", "", "", "Total Weight (Ton)", round(totalWeightKg / 1000)],
    ],
    { origin: -1 }
  );
  XLSX.utils.book_append_sheet(workbook, itemsSheet, "Item Totals");

  // ---- Sheet 3: Line item detail (per order) ----
  const orderById = new Map((orders as Order[]).map((o) => [o.id, o]));
  const detailRows = items.map((li) => {
    const order = orderById.get(li.order_id);
    return {
      "Order #": order?.order_number ?? "",
      "Date": order?.order_date ?? "",
      "Customer": order?.customer_name ?? "",
      "Item": li.item_name,
      "Type": li.item_type,
      "Qty": li.qty,
      "Rate": li.rate,
      "Amount": li.amount,
      "Weight (kg)": round(Number(li.weight_total_kg)),
    };
  });
  const detailSheet = XLSX.utils.json_to_sheet(detailRows);
  detailSheet["!cols"] = [
    { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 20 }, { wch: 8 },
    { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Line Items");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const filename = `orders-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
