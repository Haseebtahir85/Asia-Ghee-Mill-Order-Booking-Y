// Destination: lib/ordersPdf.ts
import PDFDocument from "pdfkit";

// Builds one PDF with one page per order, matching Soft_copy.xlsx's
// lean layout: an "Order ID" header, then a plain table of only the
// items actually ordered (Item No. / Item / UoM Code / Quantity).
// order_items rows only ever exist for lines with qty > 0 — the
// public /api/orders route filters that at booking time — so no
// additional "only items with quantity" filtering is needed here.
//
// ASSUMPTION: "UoM Code" isn't a field your data model stores anywhere,
// so this derives it from the item name — "LTR" for anything with
// "Ltr"/"Ltr." in the name, "KG" otherwise. Tell me the real mapping
// if this guess is wrong (e.g. if it should come from item_number,
// or a fixed per-item code you track elsewhere).
export function buildOrdersPdf(orders: any[], itemNumberById: Map<string, string | null>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidths = [70, usableWidth - 70 - 90 - 90, 90, 90];
    const colX = [left, left + colWidths[0], left + colWidths[0] + colWidths[1], left + colWidths[0] + colWidths[1] + colWidths[2]];

    function uomFor(name: string): string {
      return name.toLowerCase().includes("ltr") ? "LTR" : "KG";
    }

    orders.forEach((order, idx) => {
      if (idx > 0) doc.addPage();

      doc.font("Helvetica-Bold").fontSize(14).text("ASIA GHEE MILLS (Pvt.) Ltd.", left, doc.y, { width: usableWidth, align: "center" });
      doc.moveDown(0.6);

      // Two "Order ID" panels side by side, echoing the sample's paired
      // A1:B1 / C1:D1 header cells.
      const half = usableWidth / 2;
      const orderIdY = doc.y;
      doc.fontSize(11).text(`Order ID: ${order.order_number}`, left, orderIdY, { width: half, align: "center" });
      doc.text(`Order ID: ${order.order_number}`, left + half, orderIdY, { width: half, align: "center" });
      doc.moveDown(1.2);

      doc.fontSize(9).font("Helvetica").fillColor("#555").text(`Town: ${order.town ?? ""}    Date: ${order.order_date}`, left, doc.y, { width: usableWidth, align: "center" });
      doc.fillColor("#000");
      doc.moveDown(1);

      let y = doc.y;
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text("Item No.", colX[0], y, { width: colWidths[0] });
      doc.text("Item", colX[1], y, { width: colWidths[1] });
      doc.text("UoM Code", colX[2], y, { width: colWidths[2] });
      doc.text("Quantity", colX[3], y, { width: colWidths[3] });
      y += 16;
      doc.moveTo(left, y).lineTo(left + usableWidth, y).strokeColor("#0b2b5b").lineWidth(1).stroke();
      y += 8;

      doc.font("Helvetica").fontSize(10).strokeColor("#ccc");
      for (const line of order.order_items as any[]) {
        const itemNo = itemNumberById.get(line.item_id) || "-";
        doc.text(itemNo, colX[0], y, { width: colWidths[0] });
        doc.text(line.item_name, colX[1], y, { width: colWidths[1] });
        doc.text(uomFor(line.item_name), colX[2], y, { width: colWidths[2] });
        doc.text(String(line.qty), colX[3], y, { width: colWidths[3] });
        y += 18;
        doc.moveTo(left, y - 4).lineTo(left + usableWidth, y - 4).lineWidth(0.5).stroke();
      }
    });

    doc.end();
  });
}
