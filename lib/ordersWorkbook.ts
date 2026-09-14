// Destination: lib/ordersWorkbook.ts
import ExcelJS from "exceljs";

// Builds the "Soft copy" workbook — ONE sheet total, not one per order.
// Every order's block (Order ID / Town / Date header, then its Item
// No. / Item / UoM Code / Quantity rows) is stacked down the same
// sheet with a small gap between blocks, packing as many bills onto
// one printed page as actually fit — a page break is only inserted
// when the NEXT block wouldn't fully fit in the remaining space on the
// current page, so that block starts fresh at the top of a new page
// instead of being cut in half across the page boundary.
//
// Row-per-page is an estimate based on an explicit A4 portrait page
// setup with default row height — accurate for standard printing, but
// can't account for every possible printer/margin/zoom combination.
// UoM Code is always "Nos".
const GAP_ROWS_BETWEEN_ORDERS = 2;
const DEFAULT_ROW_HEIGHT_PT = 15;
const PAGE_MARGIN_IN = 0.7;
const A4_HEIGHT_PT = 841.89;

export function buildSoftCopyWorkbook(orders: any[], itemNumberById: Map<string, string | null>): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ASIA GHEE MILLS (Pvt.) Ltd.";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Soft Copy");
  sheet.columns = [{ width: 12 }, { width: 30 }, { width: 14 }, { width: 12 }];
  sheet.pageSetup = {
    paperSize: 9, // A4
    orientation: "portrait",
    margins: { top: PAGE_MARGIN_IN, bottom: PAGE_MARGIN_IN, left: 0.5, right: 0.5, header: 0.3, footer: 0.3 },
    fitToPage: false,
  };

  const usablePagePt = A4_HEIGHT_PT - 2 * PAGE_MARGIN_IN * 72;
  const rowsPerPage = Math.max(10, Math.floor(usablePagePt / DEFAULT_ROW_HEIGHT_PT));

  let row = 1;
  let rowsUsedOnPage = 0;
  let lastRowOfPreviousBlock = 0;

  for (const order of orders) {
    const blockRows = 3 + order.order_items.length; // Order ID + Town/Date + column header + items

    if (rowsUsedOnPage > 0 && rowsUsedOnPage + blockRows > rowsPerPage) {
      // This block won't fully fit in what's left of the current page —
      // break now so it starts fresh at the top of the next page instead
      // of being split across the boundary.
      sheet.getRow(lastRowOfPreviousBlock).addPageBreak();
      rowsUsedOnPage = 0;
    }

    sheet.mergeCells(row, 1, row, 4);
    const idCell = sheet.getCell(row, 1);
    idCell.value = `Order ID: ${order.order_number}`;
    idCell.font = { bold: true, size: 12 };
    idCell.alignment = { horizontal: "center" };
    row++;

    sheet.mergeCells(row, 1, row, 4);
    const townDateCell = sheet.getCell(row, 1);
    townDateCell.value = {
      richText: [
        { font: { bold: true, size: 10 }, text: `Town: ${order.town ?? ""}` },
        { font: { italic: true, size: 10 }, text: `    Date: ${order.order_date}` },
      ],
    };
    townDateCell.alignment = { horizontal: "center" };
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

    lastRowOfPreviousBlock = row - 1;
    rowsUsedOnPage += blockRows;

    for (let i = 0; i < GAP_ROWS_BETWEEN_ORDERS; i++) row++;
    rowsUsedOnPage += GAP_ROWS_BETWEEN_ORDERS;
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