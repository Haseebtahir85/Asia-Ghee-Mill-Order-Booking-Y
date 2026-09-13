// Destination: lib/ordersWorkbook.ts
import ExcelJS from "exceljs";

// Builds the "Soft copy" workbook — ONE sheet total, not one per order.
// Every order's block (an "Order ID" header, then its Item No. / Item /
// UoM Code / Quantity rows) is stacked one after another down the same
// sheet, separated by a blank row. UoM Code is always "Nos".
export function buildSoftCopyWorkbook(orders: any[], itemNumberById: Map<string, string | null>): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ASIA GHEE MILLS (Pvt.) Ltd.";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Soft Copy");
  sheet.columns = [{ width: 12 }, { width: 30 }, { width: 14 }, { width: 12 }];

  let row = 1;
  for (const order of orders) {
    sheet.mergeCells(row, 1, row, 2);
    const idCellA = sheet.getCell(row, 1);
    idCellA.value = `Order ID: ${order.order_number}`;
    idCellA.font = { bold: true, size: 11 };
    idCellA.alignment = { horizontal: "center" };

    sheet.mergeCells(row, 3, row, 4);
    const idCellB = sheet.getCell(row, 3);
    idCellB.value = `Order ID: ${order.order_number}`;
    idCellB.font = { bold: true, size: 11 };
    idCellB.alignment = { horizontal: "center" };
    row++;

    ["Item No.", "Item", "UoM Code", "Quantity"].forEach((h, i) => {
      const cell = sheet.getCell(row, i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 14 };
    });
    row++;

    for (const line of order.order_items as any[]) {
      sheet.getCell(row, 1).value = itemNumberById.get(line.item_id) || "-";
      sheet.getCell(row, 2).value = line.item_name;
      sheet.getCell(row, 3).value = "Nos";
      sheet.getCell(row, 4).value = line.qty;
      row++;
    }

    row++; // blank separator row between orders
  }

  return workbook;
}

// Shared fetch of the lookups both builders need alongside the orders
// themselves — catalog rows (for item_number/weight lookups) and
// per-town discounts.
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

  return { catalogItems: catalogItems ?? [], discountByTownId };
}