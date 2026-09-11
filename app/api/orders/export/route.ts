import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseServer } from "@/lib/supabase";
import { Order } from "@/lib/types";

// POST /api/orders/export
// Body: { ids?: string[]; status?: string; from?: string; to?: string }
// - Pass `ids` to export an exact selection of orders (checkbox selection in the UI).
// - Or pass filters (status/from/to) to export everything matching the filter.
// - Pass neither to export all orders.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { ids, status, from, to } = body as {
    ids?: string[];
    status?: string;
    from?: string;
    to?: string;
  };

  let query = supabaseServer
    .from("orders")
    .select("*")
    .order("order_date", { ascending: false });

  if (ids && ids.length > 0) {
    query = query.in("id", ids);
  } else {
    if (status) query = query.eq("status", status);
    if (from) query = query.gte("order_date", from);
    if (to) query = query.lte("order_date", to);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = (data ?? []) as Order[];

  if (orders.length === 0) {
    return NextResponse.json({ error: "No orders matched — nothing to export" }, { status: 404 });
  }

  // Shape rows for the spreadsheet with friendly headers
  const rows = orders.map((o) => ({
    "Order #": o.order_number,
    "Date": o.order_date,
    "Customer": o.customer_name,
    "Contact": o.customer_contact ?? "",
    "Origin": o.origin,
    "Destination": o.destination,
    "Weight (kg)": o.weight_kg,
    "Rate / kg": o.rate_per_kg,
    "Extra Charges": o.extra_charges,
    "Total Amount": o.total_amount,
    "Status": o.status,
    "Notes": o.notes ?? "",
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Reasonable column widths
  worksheet["!cols"] = [
    { wch: 12 }, // Order #
    { wch: 12 }, // Date
    { wch: 22 }, // Customer
    { wch: 15 }, // Contact
    { wch: 16 }, // Origin
    { wch: 16 }, // Destination
    { wch: 12 }, // Weight
    { wch: 10 }, // Rate/kg
    { wch: 14 }, // Extra
    { wch: 14 }, // Total
    { wch: 12 }, // Status
    { wch: 30 }, // Notes
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");

  // Add a totals summary sheet
  const totalWeight = orders.reduce((sum, o) => sum + Number(o.weight_kg), 0);
  const totalAmount = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const summarySheet = XLSX.utils.json_to_sheet([
    { Metric: "Order Count", Value: orders.length },
    { Metric: "Total Weight (kg)", Value: totalWeight },
    { Metric: "Total Amount", Value: totalAmount },
    { Metric: "Exported At", Value: new Date().toISOString() },
  ]);
  summarySheet["!cols"] = [{ wch: 20 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

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
