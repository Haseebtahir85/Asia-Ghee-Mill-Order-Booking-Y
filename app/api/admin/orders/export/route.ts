// Destination: app/api/admin/orders/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { supabaseServer } from "@/lib/supabase";

const NAVY = "FF0B2B5B";
const YELLOW = "FFF6C90E";

// Same RSO/Soap name-based fallback used everywhere else in the app —
// OrderItem only stores item_type (ghee/oil/other), not an icon, so RSO
// and Soap have to be told apart from "other" by name, same as the
// booking page and the order-edit page do.
function weightCategory(name: string, type: string): "ghee" | "oil" | "rso" | "soap" | "other" {
  const n = name.toLowerCase();
  if (n.includes("rso")) return "rso";
  if (n.includes("soap")) return "soap";
  if (type === "ghee") return "ghee";
  if (type === "oil") return "oil";
  return "other";
}

function sanitizeSheetName(name: string): string {
  // Excel sheet names: max 31 chars, no [ ] : * ? / \
  return name.replace(/[\[\]:*?/\\]/g, "-").slice(0, 31);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "No orders selected" }, { status: 400 });
  }

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

  // Full catalog defines the fixed row list every sheet shares — sorted
  // the same way the booking page shows them, so every bill looks the
  // same regardless of which items a particular order actually used.
  const { data: catalogItems, error: itemsError } = await supabaseServer
    .from("items")
    .select("id, name, weight_kg, type")
    .order("sort_order", { ascending: true });

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  // Town discounts — the sample sheet looked this up externally by
  // parsing the town name; you now have a real discount column, so pull
  // it directly instead of guessing from text.
  const townIds = Array.from(new Set(orders.map((o) => o.town_id).filter(Boolean)));
  const { data: towns } = await supabaseServer.from("towns").select("id, discount").in("id", townIds as string[]);
  const discountByTownId = new Map((towns ?? []).map((t) => [t.id, t.discount ?? 0]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ASIA GHEE MILLS (Pvt.) Ltd.";
  workbook.created = new Date();

  const usedNames = new Set<string>();

  for (const order of orders) {
    let sheetName = sanitizeSheetName(order.order_number || order.id);
    let suffix = 2;
    while (usedNames.has(sheetName)) {
      sheetName = sanitizeSheetName(`${order.order_number}-${suffix}`);
      suffix++;
    }
    usedNames.add(sheetName);

    const sheet = workbook.addWorksheet(sheetName, {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    });

    // Column widths — narrow enough that the whole bill fits one printed
    // page width, same intent as the original sheet's compact layout.
    sheet.columns = [
      { width: 20 }, // A Item
      { width: 9 },  // B Weight
      { width: 9 },  // C Net Rate
      { width: 7 },  // D Qty
      { width: 9 },  // E Rate
      { width: 11 }, // F Amount
      { width: 8 },  // G Type
      { width: 11 }, // H Weight (Ton)
      { width: 11 }, // I Weight (Kg)
      { width: 2 },  // J spacer
      { width: 20 }, // K Item (dispatch copy)
      { width: 9 },  // L
      { width: 8 },  // M Qty
      { width: 11 }, // N Dispatched
    ];

    const discount = discountByTownId.get(order.town_id ?? "") ?? 0;

    // --- Header: company name + Order # (must be visible on every sheet) ---
    sheet.mergeCells("A1:I1");
    sheet.getCell("A1").value = "ASIA GHEE MILLS (Pvt.) Ltd.";
    sheet.getCell("A1").font = { bold: true, size: 13 };
    sheet.getCell("A1").alignment = { horizontal: "center" };

    sheet.mergeCells("K1:N1");
    sheet.getCell("K1").value = `Order #: ${order.order_number}`;
    sheet.getCell("K1").font = { bold: true, size: 13, color: { argb: NAVY } };
    sheet.getCell("K1").alignment = { horizontal: "center" };

    sheet.getCell("A2").value = "Town:";
    sheet.getCell("A2").font = { bold: true };
    sheet.mergeCells("B2:C2");
    sheet.getCell("B2").value = order.town ?? "";
    sheet.getCell("B2").font = { bold: true };

    sheet.getCell("E2").value = "Date:";
    sheet.getCell("E2").font = { bold: true };
    sheet.getCell("F2").value = order.order_date;
    sheet.getCell("F2").font = { bold: true };
    sheet.getCell("F2").numFmt = "mm-dd-yy";

    sheet.getCell("H2").value = "Status:";
    sheet.getCell("H2").font = { bold: true };
    sheet.getCell("I2").value = order.status;
    sheet.getCell("I2").font = { bold: true };

    sheet.getCell("K2").value = "Order #:";
    sheet.getCell("K2").font = { bold: true };
    sheet.mergeCells("L2:N2");
    sheet.getCell("L2").value = order.order_number;
    sheet.getCell("L2").font = { bold: true, color: { argb: NAVY } };
    sheet.getCell("L2").alignment = { horizontal: "center" };

    sheet.getCell("K3").value = "Town:";
    sheet.mergeCells("L3:N3");
    sheet.getCell("L3").value = order.town ?? "";

    // --- Table headers (row 5) ---
    const leftHeaders = ["Item", "Weight", "Net Rate", "Qty", "Rate", "Amount", "Type", "Weight (Ton)", "Weight (Kg)"];
    leftHeaders.forEach((h, i) => {
      const cell = sheet.getCell(5, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      cell.alignment = { horizontal: "center" };
    });
    const rightHeaders = ["Item", "Type", "Qty", "Dispatched"];
    rightHeaders.forEach((h, i) => {
      const cell = sheet.getCell(5, 11 + i);
      cell.value = h;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      cell.alignment = { horizontal: "center" };
    });

    // --- Item rows: one row per catalog item, filled in only where this
    // order actually has a line for it ---
    const lineByItemId = new Map(order.order_items.map((l: any) => [l.item_id, l]));
    const lineByName = new Map(order.order_items.map((l: any) => [l.item_name.trim().toLowerCase(), l]));

    const firstRow = 6;
    (catalogItems ?? []).forEach((item, idx) => {
      const rowNum = firstRow + idx;
      const line = lineByItemId.get(item.id) ?? lineByName.get(item.name.trim().toLowerCase());
      const qty = line ? line.qty : 0;
      const rate = line ? line.rate : item.weight_kg ? undefined : undefined; // rate only known if ordered

      const row = sheet.getRow(rowNum);
      row.getCell(1).value = item.name; // A Item
      row.getCell(2).value = item.weight_kg; // B Weight (per unit)
      row.getCell(4).value = qty || null; // D Qty
      row.getCell(5).value = line ? line.rate : null; // E Rate (snapshot from order, if ordered)
      // C Net Rate = Rate - discount%, self-contained formula
      row.getCell(3).value = { formula: `IF(E${rowNum}="","",E${rowNum}-((E${rowNum}*${discount})/100))` };
      row.getCell(3).numFmt = "0.000";
      // F Amount = Qty * Net Rate
      row.getCell(6).value = { formula: `IF(D${rowNum}="","",D${rowNum}*C${rowNum})` };
      row.getCell(6).numFmt = "#,##0";
      // I Weight (Kg) = Qty * per-unit weight ; H Weight (Ton) = I/1000
      row.getCell(9).value = { formula: `IF(D${rowNum}="","",D${rowNum}*B${rowNum})` };
      row.getCell(8).value = { formula: `IF(I${rowNum}="","",I${rowNum}/1000)` };
      row.getCell(8).numFmt = "0.000";
      // Hidden helper: weight category, used by the summary SUMIFs below
      row.getCell(16).value = weightCategory(item.name, item.type); // column P

      row.getCell(11).value = item.name; // K Item (dispatch copy)
      row.getCell(12).value = item.type; // L Type
      row.getCell(13).value = qty || null; // M Qty
      // N Dispatched intentionally left blank — filled in by hand once loaded

      for (let c = 1; c <= 9; c++) row.getCell(c).alignment = { horizontal: "center" };
      for (let c = 11; c <= 14; c++) row.getCell(c).alignment = { horizontal: "center" };
    });
    sheet.getColumn(16).hidden = true;

    const lastRow = firstRow + (catalogItems?.length ?? 0) - 1;

    // --- Summary block ---
    const sumRow1 = lastRow + 2;
    sheet.getCell(sumRow1, 1).value = "Total Amount";
    sheet.getCell(sumRow1, 1).font = { bold: true };
    sheet.getCell(sumRow1, 4).value = { formula: `SUM(F${firstRow}:F${lastRow})` };
    sheet.getCell(sumRow1, 4).numFmt = "#,##0";
    sheet.getCell(sumRow1, 4).font = { bold: true };

    const gheeRow = sumRow1 + 1;
    const oilRow = sumRow1 + 2;
    const totalTonRow = sumRow1 + 3;
    const rsoRow = sumRow1 + 4;
    const soapRow = sumRow1 + 5;
    const grandTotalRow = sumRow1 + 6;

    const summaryLabel = (row: number, label: string) => {
      sheet.getCell(row, 1).value = label;
      sheet.getCell(row, 1).font = { bold: true };
    };
    summaryLabel(gheeRow, "Weight (Ghee)");
    sheet.getCell(gheeRow, 6).value = { formula: `SUMIF(P${firstRow}:P${lastRow},"ghee",H${firstRow}:H${lastRow})` };
    summaryLabel(oilRow, "Weight (Oil)");
    sheet.getCell(oilRow, 6).value = { formula: `SUMIF(P${firstRow}:P${lastRow},"oil",H${firstRow}:H${lastRow})` };
    summaryLabel(totalTonRow, "Total Weight (Ton)");
    sheet.getCell(totalTonRow, 6).value = { formula: `F${gheeRow}+F${oilRow}` };
    summaryLabel(rsoRow, "Weight (RSO)");
    sheet.getCell(rsoRow, 6).value = { formula: `SUMIF(P${firstRow}:P${lastRow},"rso",H${firstRow}:H${lastRow})` };
    summaryLabel(soapRow, "Weight (SOAP)");
    sheet.getCell(soapRow, 6).value = { formula: `SUMIF(P${firstRow}:P${lastRow},"soap",H${firstRow}:H${lastRow})` };
    summaryLabel(grandTotalRow, "G.Total Weight (Ton)");
    sheet.getCell(grandTotalRow, 6).value = { formula: `F${totalTonRow}+F${rsoRow}+F${soapRow}` };

    for (const r of [gheeRow, oilRow, totalTonRow, rsoRow, soapRow, grandTotalRow]) {
      sheet.getCell(r, 6).numFmt = "0.000";
      if (r === totalTonRow || r === grandTotalRow) sheet.getCell(r, 6).font = { bold: true };
    }

    // Mirror the weight summary on the dispatch-note (right) side too,
    // same two-panel intent as the original sheet.
    sheet.getCell(gheeRow, 11).value = "Weight (Ghee)";
    sheet.getCell(gheeRow, 13).value = { formula: `F${gheeRow}` };
    sheet.getCell(oilRow, 11).value = "Weight (Oil)";
    sheet.getCell(oilRow, 13).value = { formula: `F${oilRow}` };
    sheet.getCell(rsoRow, 11).value = "Weight (RSO)";
    sheet.getCell(rsoRow, 13).value = { formula: `F${rsoRow}` };
    sheet.getCell(soapRow, 11).value = "Weight (SOAP)";
    sheet.getCell(soapRow, 13).value = { formula: `F${soapRow}` };
    for (const r of [gheeRow, oilRow, rsoRow, soapRow]) {
      sheet.getCell(r, 11).font = { bold: true };
      sheet.getCell(r, 13).numFmt = "0.000";
    }

    if (order.notes) {
      const notesRow = grandTotalRow + 2;
      sheet.getCell(notesRow, 1).value = `Notes: ${order.notes}`;
      sheet.getCell(notesRow, 1).font = { italic: true, color: { argb: "FF666666" } };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = orders.length === 1 ? `order-${orders[0].order_number}.xlsx` : `orders-export-${orders.length}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}