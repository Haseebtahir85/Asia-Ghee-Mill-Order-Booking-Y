// Destination: lib/ordersWorkbook.ts
import ExcelJS from "exceljs";

const NAVY = "FF0B2B5B";

type CatalogItem = { id: string; name: string; weight_kg: number; type: string; item_number?: string | null };

function sanitizeSheetName(name: string): string {
  // Excel sheet names: max 31 chars, no [ ] : * ? / \
  return name.replace(/[\[\]:*?/\\]/g, "-").slice(0, 31);
}

// Builds one workbook with one sheet per order — shared by the full
// export and the "New Order" incremental export, so both produce
// identical bill/dispatch layouts.
//
// Per the latest spec:
// - No "Weight (Kg)" column — Weight (Ton) is computed straight from
//   Qty x per-unit weight, so the intermediate kg figure isn't shown.
// - No "Status:" field in the header block.
// - The summary block (Total Amount, Weight (Ghee/Oil/RSO/SOAP), Total
//   Weight (Ton), G.Total Weight (Ton)) — on both the left bill panel
//   and the right dispatch panel — shows LABELS only. The value cells
//   are left blank on purpose, for manual fill-in, the same way
//   "Dispatched" already was.
export function buildOrdersWorkbook(orders: any[], catalogItems: CatalogItem[], discountByTownId: Map<string, number>): ExcelJS.Workbook {
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

    sheet.columns = [
      { width: 20 }, // A Item
      { width: 9 },  // B Weight
      { width: 9 },  // C Net Rate
      { width: 7 },  // D Qty
      { width: 9 },  // E Rate
      { width: 11 }, // F Amount
      { width: 8 },  // G Type
      { width: 11 }, // H Weight (Ton)
      { width: 2 },  // I spacer (was Weight (Kg) — now hidden/unused)
      { width: 2 },  // J spacer
      { width: 20 }, // K Item (dispatch copy) / summary labels
      { width: 9 },  // L Type
      { width: 8 },  // M Qty / summary values (left blank)
      { width: 11 }, // N Dispatched
    ];
    sheet.getColumn(9).hidden = true;

    const discount = discountByTownId.get(order.town_id ?? "") ?? 0;

    // --- Header ---
    sheet.mergeCells("A1:H1");
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
    // "Status:" field intentionally removed.

    sheet.getCell("K2").value = "Order #:";
    sheet.getCell("K2").font = { bold: true };
    sheet.mergeCells("L2:N2");
    sheet.getCell("L2").value = order.order_number;
    sheet.getCell("L2").font = { bold: true, color: { argb: NAVY } };
    sheet.getCell("L2").alignment = { horizontal: "center" };

    sheet.getCell("K3").value = "Town:";
    sheet.mergeCells("L3:N3");
    sheet.getCell("L3").value = order.town ?? "";

    // --- Table headers (row 5) — Weight (Kg) column removed ---
    const leftHeaders = ["Item", "Weight", "Net Rate", "Qty", "Rate", "Amount", "Type", "Weight (Ton)"];
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

    const lineByItemId = new Map<string, any>((order.order_items as any[]).map((l: any) => [l.item_id, l] as [string, any]));
    const lineByName = new Map<string, any>((order.order_items as any[]).map((l: any) => [l.item_name.trim().toLowerCase(), l] as [string, any]));

    const firstRow = 6;
    catalogItems.forEach((item, idx) => {
      const rowNum = firstRow + idx;
      const line = lineByItemId.get(item.id) ?? lineByName.get(item.name.trim().toLowerCase());
      const qty = line ? line.qty : 0;

      const row = sheet.getRow(rowNum);
      row.getCell(1).value = item.name; // A Item
      row.getCell(2).value = item.weight_kg; // B Weight (per unit)
      row.getCell(4).value = qty || null; // D Qty
      row.getCell(5).value = line ? line.rate : null; // E Rate (snapshot from order, if ordered)
      // C Net Rate = Rate - discount%
      row.getCell(3).value = { formula: `IF(E${rowNum}="","",E${rowNum}-((E${rowNum}*${discount})/100))` };
      row.getCell(3).numFmt = "0.000";
      // F Amount = Qty * Net Rate
      row.getCell(6).value = { formula: `IF(D${rowNum}="","",D${rowNum}*C${rowNum})` };
      row.getCell(6).numFmt = "#,##0";
      // H Weight (Ton) computed directly from Qty x per-unit weight — no
      // visible intermediate Weight (Kg) column anymore.
      row.getCell(8).value = { formula: `IF(D${rowNum}="","",(D${rowNum}*B${rowNum})/1000)` };
      row.getCell(8).numFmt = "0.000";

      row.getCell(11).value = item.name; // K Item (dispatch copy)
      row.getCell(12).value = item.type; // L Type
      row.getCell(13).value = qty || null; // M Qty
      // N Dispatched intentionally left blank — filled in by hand once loaded

      for (let c = 1; c <= 8; c++) row.getCell(c).alignment = { horizontal: "center" };
      for (let c = 11; c <= 14; c++) row.getCell(c).alignment = { horizontal: "center" };
    });

    const lastRow = firstRow + catalogItems.length - 1;

    // --- Summary block: LABELS ONLY, values left blank for manual fill-in ---
    const sumRow1 = lastRow + 2;
    sheet.getCell(sumRow1, 1).value = "Total Amount";
    sheet.getCell(sumRow1, 1).font = { bold: true };
    sheet.getCell(sumRow1, 4).numFmt = "#,##0";
    sheet.getCell(sumRow1, 4).font = { bold: true };
    sheet.getCell(sumRow1, 4).border = { bottom: { style: "thin" } };

    const gheeRow = sumRow1 + 1;
    const oilRow = sumRow1 + 2;
    const totalTonRow = sumRow1 + 3;
    const rsoRow = sumRow1 + 4;
    const soapRow = sumRow1 + 5;
    const grandTotalRow = sumRow1 + 6;

    const summaryLabel = (row: number, label: string) => {
      sheet.getCell(row, 1).value = label;
      sheet.getCell(row, 1).font = { bold: true };
      sheet.getCell(row, 6).numFmt = "0.000";
      sheet.getCell(row, 6).border = { bottom: { style: "thin" } };
    };
    summaryLabel(gheeRow, "Weight (Ghee)");
    summaryLabel(oilRow, "Weight (Oil)");
    summaryLabel(totalTonRow, "Total Weight (Ton)");
    sheet.getCell(totalTonRow, 1).font = { bold: true };
    summaryLabel(rsoRow, "Weight (RSO)");
    summaryLabel(soapRow, "Weight (SOAP)");
    summaryLabel(grandTotalRow, "G.Total Weight (Ton)");

    // Mirror the same labels (no values) on the dispatch-note side.
    sheet.getCell(gheeRow, 11).value = "Weight (Ghee)";
    sheet.getCell(oilRow, 11).value = "Weight (Oil)";
    sheet.getCell(rsoRow, 11).value = "Weight (RSO)";
    sheet.getCell(soapRow, 11).value = "Weight (SOAP)";
    for (const r of [gheeRow, oilRow, rsoRow, soapRow]) {
      sheet.getCell(r, 11).font = { bold: true };
      sheet.getCell(r, 13).numFmt = "0.000";
      sheet.getCell(r, 13).border = { bottom: { style: "thin" } };
    }

    if (order.notes) {
      const notesRow = grandTotalRow + 2;
      sheet.getCell(notesRow, 1).value = `Notes: ${order.notes}`;
      sheet.getCell(notesRow, 1).font = { italic: true, color: { argb: "FF666666" } };
    }
  }

  return workbook;
}

// Shared fetch of the two lookups every export needs alongside the
// orders themselves — catalog rows and per-town discounts.
export async function fetchWorkbookLookups(supabaseServer: any, orders: any[]) {
  const { data: catalogItems, error: itemsError } = await supabaseServer
    .from("items")
    .select("id, name, weight_kg, type, item_number")
    .order("sort_order", { ascending: true });

  if (itemsError) throw new Error(itemsError.message);

  const townIds = Array.from(new Set(orders.map((o) => o.town_id).filter(Boolean)));
  const { data: towns } = await supabaseServer.from("towns").select("id, discount").in("id", townIds as string[]);
  const discountByTownId = new Map<string, number>(
    ((towns ?? []) as any[]).map((t: any) => [t.id, t.discount ?? 0] as [string, number])
  );

  return { catalogItems: (catalogItems ?? []) as CatalogItem[], discountByTownId };
}
