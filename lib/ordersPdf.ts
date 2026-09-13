// Destination: lib/ordersPdf.ts
import PDFDocument from "pdfkit";

// Builds the "Order Book" PDF as a set of independent, self-contained
// slips arranged in a 2x2 grid per A4 landscape page — because the
// printed sheet gets physically cut into pieces afterward, every
// quadrant needs its OWN complete header (company name, Order #, Town,
// Date) and its OWN summary tables, scaled to that quadrant's width —
// nothing can span across a cut line.
//
// Per page: 2 orders, each contributing one row of 2 quadrants —
// left = customer/bill slip (Item / Qty / Rate / Amount / Type /
// Weight (Ton)), right = dispatch/loading slip (Item / Type / Qty /
// Dispatched). Dashed guide lines mark where to cut. Both quadrant
// columns are scaled to use the real page width (not a narrow strip
// with blank space beside it), and the number of order-rows per page
// is computed from actual content height, so a slip is never split
// across a page boundary.
//
// Under each slip, two summary tables (both column-divided — label
// above, thin rule, value below, vertical dividers, no merged cells):
//   Table 1 ("simple bill"): Weight (Ghee) / Weight (Oil) /
//     Total Weight (Ton) / Weight (RSO) / Weight (SOAP) /
//     G.Total Weight (Ton)
//   Table 2, headed "Provisional Order": Weight (Ghee) / Weight (Oil) /
//     RSO / Total (Total = Ghee + Oil + RSO)
function weightCategory(name: string, type: string): "ghee" | "oil" | "rso" | "soap" | "other" {
  const n = name.toLowerCase();
  if (n.includes("rso")) return "rso";
  if (n.includes("soap")) return "soap";
  if (type === "ghee") return "ghee";
  if (type === "oil") return "oil";
  return "other";
}

type CatalogItem = { id: string; name: string; weight_kg: number; type: string };

const ROW_H = 5.6;
const HEADER_H = 24;
const PANEL_HEADER_H = 7;
const TABLE_GAP = 3;
const STAT_BAR_H = 11;
const STAT_HEADING_H = 6;
const TOTALS_LINE_H = 7;
const BOTTOM_PADDING = 6;

export function buildOrderBookPdf(
  orders: any[],
  catalogItems: CatalogItem[],
  discountByTownId: Map<string, number>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 14 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const pageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
    const pageLeft = doc.page.margins.left;
    const pageTop = doc.page.margins.top;

    const colGap = 16;
    const quadrantWidth = (pageWidth - colGap) / 2;

    // Slip height is the same for every slip (fixed catalog row count),
    // so compute it once and derive how many order-rows fit per page.
    const itemRowsH = catalogItems.length * ROW_H;
    const slipHeight =
      HEADER_H +
      PANEL_HEADER_H +
      itemRowsH +
      TABLE_GAP +
      TOTALS_LINE_H +
      STAT_BAR_H +
      TABLE_GAP +
      STAT_HEADING_H +
      STAT_BAR_H +
      BOTTOM_PADDING;
    const rowGap = 10;
    const ordersPerPage = Math.max(1, Math.floor((pageHeight + rowGap) / (slipHeight + rowGap)));

    function drawStatBar(x: number, width: number, barTop: number, stats: { label: string; value: string }[]) {
      const cellW = width / stats.length;
      doc.rect(x, barTop, width, STAT_BAR_H).strokeColor("#0b2b5b").lineWidth(0.5).stroke();
      stats.forEach((s, i) => {
        const cx = x + i * cellW;
        if (i > 0) doc.moveTo(cx, barTop).lineTo(cx, barTop + STAT_BAR_H).strokeColor("#cfd6e4").lineWidth(0.5).stroke();
        doc.font("Helvetica-Bold").fontSize(4.4).fillColor("#666").text(s.label, cx + 2, barTop + 1.3, { width: cellW - 4, align: "center" });
        doc.font("Helvetica-Bold").fontSize(6).fillColor("#0b2b5b").text(s.value, cx + 2, barTop + 6.2, { width: cellW - 4, align: "center" });
      });
      doc.fillColor("#000");
    }

    // Draws one fully self-contained slip: own header, own single table
    // (either the customer/bill columns or the dispatch columns), own
    // two summary tables — everything scaled to `width`, nothing shared
    // with the slip beside it.
    function drawSlip(
      order: any,
      kind: "bill" | "dispatch",
      x: number,
      top: number,
      width: number,
      discount: number
    ) {
      let y = top;

      doc.font("Helvetica-Bold").fontSize(7.5).text("ASIA GHEE MILLS (Pvt.) Ltd.", x, y, { width, align: "center" });
      y += 9;
      doc.fontSize(7).fillColor("#0b2b5b").text(`Order #: ${order.order_number}`, x, y, { width, align: "center" });
      doc.fillColor("#000");
      y += 8;
      doc.font("Helvetica").fontSize(5.5).fillColor("#555").text(`Town: ${order.town ?? ""}    Date: ${order.order_date}`, x, y, { width, align: "center" });
      doc.fillColor("#000");
      y += 7;

      const isBill = kind === "bill";
      const colWeights = isBill ? [0.42, 0.1, 0.13, 0.15, 0.1, 0.1] : [0.5, 0.16, 0.14, 0.2];
      const headers = isBill ? ["Item", "Qty", "Rate", "Amount", "Type", "Wt (Ton)"] : ["Item", "Type", "Qty", "Dispatched"];
      const colW = colWeights.map((w) => w * width);
      const colX = [x];
      for (let i = 0; i < colW.length - 1; i++) colX.push(colX[i] + colW[i]);

      doc.font("Helvetica-Bold").fontSize(5.5);
      headers.forEach((h, i) => {
        doc.text(h, colX[i], y, { width: colW[i], align: i === 0 ? "left" : "center" });
      });
      y += 7;
      doc.moveTo(x, y).lineTo(x + width, y).strokeColor("#0b2b5b").lineWidth(0.75).stroke();
      y += 2;

      const lineByItemId = new Map<string, any>((order.order_items as any[]).map((l: any) => [l.item_id, l] as [string, any]));
      const lineByName = new Map<string, any>((order.order_items as any[]).map((l: any) => [l.item_name.trim().toLowerCase(), l] as [string, any]));

      let totalAmount = 0;
      let gheeTon = 0;
      let oilTon = 0;
      let rsoTon = 0;
      let soapTon = 0;

      doc.font("Helvetica").fontSize(5.2);
      for (const item of catalogItems) {
        const line = lineByItemId.get(item.id) ?? lineByName.get(item.name.trim().toLowerCase());
        const qty = line ? line.qty : 0;
        const rate = line ? line.rate : 0;
        const netRate = rate - (rate * discount) / 100;
        const amount = qty * netRate;
        const weightTon = (qty * item.weight_kg) / 1000;

        if (qty > 0) {
          totalAmount += amount;
          const category = weightCategory(item.name, item.type);
          if (category === "ghee") gheeTon += weightTon;
          else if (category === "oil") oilTon += weightTon;
          else if (category === "rso") rsoTon += weightTon;
          else if (category === "soap") soapTon += weightTon;
        }

        if (isBill) {
          doc.text(item.name, colX[0], y, { width: colW[0] });
          doc.text(qty ? String(qty) : "", colX[1], y, { width: colW[1], align: "center" });
          doc.text(qty ? String(rate) : "", colX[2], y, { width: colW[2], align: "center" });
          doc.text(qty ? Math.round(amount).toLocaleString() : "", colX[3], y, { width: colW[3], align: "center" });
          doc.text(item.type, colX[4], y, { width: colW[4], align: "center" });
          doc.text(qty ? weightTon.toFixed(3) : "", colX[5], y, { width: colW[5], align: "center" });
        } else {
          doc.text(item.name, colX[0], y, { width: colW[0] });
          doc.text(item.type, colX[1], y, { width: colW[1], align: "center" });
          doc.text(qty ? String(qty) : "", colX[2], y, { width: colW[2], align: "center" });
          // Dispatched intentionally left blank for manual check-off.
        }

        y += ROW_H;
      }

      const totalTon = gheeTon + oilTon;
      const grandTotalTon = totalTon + rsoTon + soapTon;
      const provisionalTotal = gheeTon + oilTon + rsoTon;

      y += 2;
      doc.font("Helvetica-Bold").fontSize(5.5);
      doc.text(`Weight (Ton): ${grandTotalTon.toFixed(3)}`, x, y, { width: width / 2 });
      doc.text(`Amount: ${Math.round(totalAmount).toLocaleString()}`, x + width / 2, y, { width: width / 2, align: "right" });
      y += TOTALS_LINE_H;

      drawStatBar(x, width, y, [
        { label: "Weight (Ghee)", value: gheeTon.toFixed(3) },
        { label: "Weight (Oil)", value: oilTon.toFixed(3) },
        { label: "Total Wt (Ton)", value: totalTon.toFixed(3) },
        { label: "Weight (RSO)", value: rsoTon.toFixed(3) },
        { label: "Weight (SOAP)", value: soapTon.toFixed(3) },
        { label: "G.Total Wt (Ton)", value: grandTotalTon.toFixed(3) },
      ]);
      y += STAT_BAR_H + TABLE_GAP;

      doc.font("Helvetica-Bold").fontSize(5.5).fillColor("#0b2b5b").text("Provisional Order", x, y, { width, align: "center" });
      doc.fillColor("#000");
      y += STAT_HEADING_H;
      drawStatBar(x, width, y, [
        { label: "Weight (Ghee)", value: gheeTon.toFixed(3) },
        { label: "Weight (Oil)", value: oilTon.toFixed(3) },
        { label: "RSO", value: rsoTon.toFixed(3) },
        { label: "Total", value: provisionalTotal.toFixed(3) },
      ]);
    }

    for (let i = 0; i < orders.length; i += ordersPerPage) {
      if (i > 0) doc.addPage();
      const pageOrders = orders.slice(i, i + ordersPerPage);

      // Vertical dashed cut-line down the middle of the page.
      doc.save();
      doc.dash(3, { space: 2 }).strokeColor("#999").lineWidth(0.5);
      doc.moveTo(pageLeft + quadrantWidth + colGap / 2, pageTop).lineTo(pageLeft + quadrantWidth + colGap / 2, pageTop + pageHeight).stroke();
      doc.undash();
      doc.restore();

      pageOrders.forEach((order, rowIdx) => {
        const rowTop = pageTop + rowIdx * (slipHeight + rowGap);
        const discount = discountByTownId.get(order.town_id ?? "") ?? 0;

        drawSlip(order, "bill", pageLeft, rowTop, quadrantWidth, discount);
        drawSlip(order, "dispatch", pageLeft + quadrantWidth + colGap, rowTop, quadrantWidth, discount);

        // Horizontal dashed cut-line under this order-row (skip after
        // the very last row on the page).
        if (rowIdx < pageOrders.length - 1) {
          const lineY = rowTop + slipHeight + rowGap / 2;
          doc.save();
          doc.dash(3, { space: 2 }).strokeColor("#999").lineWidth(0.5);
          doc.moveTo(pageLeft, lineY).lineTo(pageLeft + pageWidth, lineY).stroke();
          doc.undash();
          doc.restore();
        }
      });
    }

    doc.end();
  });
}