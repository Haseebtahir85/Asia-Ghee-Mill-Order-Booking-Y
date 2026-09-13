// Destination: lib/ordersWorkbook.ts
import ExcelJS from "exceljs";

// Builds the "Soft copy" workbook — one sheet per order, matching your
// Soft_copy.xlsx sample: a paired "Order ID" header (two merged cells,
// same value, side by side) then a lean item table — Item No. / Item /
// UoM Code / Quantity — listing only the items actually ordered.
//
// ASSUMPTION carried over from before: "UoM Code" isn't a field your
// data model stores anywhere, so it's derived from the item name
// ("LTR" if the name contains "Ltr", "KG" otherwise). Tell me the real
// mapping if this is wrong.
function sanitizeSheetName(name: string): string {
  return name.replace(/[\[\]:*?/\\]/g, "-").slice(0, 31);
}

function uomFor(name: string): string {
  return name.toLowerCase().includes("ltr") ? "LTR" : "KG";
}

export function buildSoftCopyWorkbook(orders: any[], itemNumberById: Map<string, string | null>): ExcelJS.Workbook {
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

    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = [{ width: 12 }, { width: 30 }, { width: 14 }, { width: 12 }];

    sheet.mergeCells("A1:B1");
    sheet.getCell("A1").value = `Order ID: ${order.order_number}`;
    sheet.getCell("A1").font = { bold: true, size: 11 };
    sheet.getCell("A1").alignment = { horizontal: "center" };

    sheet.mergeCells("C1:D1");
    sheet.getCell("C1").value = `Order ID: ${order.order_number}`;
    sheet.getCell("C1").font = { bold: true, size: 11 };
    sheet.getCell("C1").alignment = { horizontal: "center" };

    ["Item No.", "Item", "UoM Code", "Quantity"].forEach((h, i) => {
      const cell = sheet.getCell(2, i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 14 };
    });

    (order.order_items as any[]).forEach((line, idx) => {
      const row = sheet.getRow(3 + idx);
      row.getCell(1).value = itemNumberById.get(line.item_id) || "-";
      row.getCell(2).value = line.item_name;
      row.getCell(3).value = uomFor(line.item_name);
      row.getCell(4).value = line.qty;
    });
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