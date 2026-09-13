// Destination: lib/ordersPdf.ts
import PDFDocument from "pdfkit";

// Builds the "Order Book" PDF — one page per order, the full bill layout
// (Item / Qty / Rate / Amount / Weight (Ton)) with Weight (per-unit),
// Net Rate, and Type columns removed from display. The discount is
// still applied to Rate internally when computing Amount (it's real
// business logic, not just a display column) — it just isn't shown as
// its own "Net Rate" column anymore.
//
// Only lists items the order actually has (order_items only ever
// contains qty > 0 lines — enforced at booking time), not the full
// catalog with blank rows.
//
// The summary block (Total Amount, Weight (Ghee/Oil/RSO/SOAP), Total
// Weight (Ton), G.Total Weight (Ton)) is computed here and printed with
// real numbers.
function weightCategory(name: string, type: string): "ghee" | "oil" | "rso" | "soap" | "other" {
  const n = name.toLowerCase();
  if (n.includes("rso")) return "rso";
  if (n.includes("soap")) return "soap";
  if (type === "ghee") return "ghee";
  if (type === "oil") return "oil";
  return "other";
}

export function buildOrderBookPdf(orders: any[], catalogWeightById: Map<string, number>, discountByTownId: Map<string, number>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    // Item | Qty | Rate | Amount | Weight (Ton)
    const colWidths = [usableWidth - 60 - 70 - 90 - 90, 60, 70, 90, 90];
    const colX = [
      left,
      left + colWidths[0],
      left + colWidths[0] + colWidths[1],
      left + colWidths[0] + colWidths[1] + colWidths[2],
      left + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3],
    ];

    orders.forEach((order, orderIdx) => {
      if (orderIdx > 0) doc.addPage();

      doc.font("Helvetica-Bold").fontSize(14).text("ASIA GHEE MILLS (Pvt.) Ltd.", left, doc.y, { width: usableWidth, align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(12).fillColor("#0b2b5b").text(`Order #: ${order.order_number}`, left, doc.y, { width: usableWidth, align: "center" });
      doc.fillColor("#000");
      doc.moveDown(0.4);
      doc.fontSize(9).font("Helvetica").fillColor("#555").text(`Town: ${order.town ?? ""}    Date: ${order.order_date}`, left, doc.y, { width: usableWidth, align: "center" });
      doc.fillColor("#000");
      doc.moveDown(1);

      const discount = discountByTownId.get(order.town_id ?? "") ?? 0;

      let y = doc.y;
      doc.font("Helvetica-Bold").fontSize(10);
      ["Item", "Qty", "Rate", "Amount", "Weight (Ton)"].forEach((h, i) => {
        doc.text(h, colX[i], y, { width: colWidths[i], align: i === 0 ? "left" : "right" });
      });
      y += 16;
      doc.moveTo(left, y).lineTo(left + usableWidth, y).strokeColor("#0b2b5b").lineWidth(1).stroke();
      y += 8;

      let totalAmount = 0;
      let gheeTon = 0;
      let oilTon = 0;
      let rsoTon = 0;
      let soapTon = 0;

      doc.font("Helvetica").fontSize(10);
      for (const line of order.order_items as any[]) {
        const netRate = line.rate - (line.rate * discount) / 100;
        const amount = line.qty * netRate;
        const perUnitWeight = catalogWeightById.get(line.item_id) ?? line.weight_kg ?? 0;
        const weightTon = (line.qty * perUnitWeight) / 1000;

        totalAmount += amount;
        const category = weightCategory(line.item_name, line.item_type);
        if (category === "ghee") gheeTon += weightTon;
        else if (category === "oil") oilTon += weightTon;
        else if (category === "rso") rsoTon += weightTon;
        else if (category === "soap") soapTon += weightTon;

        doc.text(line.item_name, colX[0], y, { width: colWidths[0] });
        doc.text(String(line.qty), colX[1], y, { width: colWidths[1], align: "right" });
        doc.text(line.rate.toLocaleString(), colX[2], y, { width: colWidths[2], align: "right" });
        doc.text(Math.round(amount).toLocaleString(), colX[3], y, { width: colWidths[3], align: "right" });
        doc.text(weightTon.toFixed(3), colX[4], y, { width: colWidths[4], align: "right" });
        y += 18;
        doc.moveTo(left, y - 4).lineTo(left + usableWidth, y - 4).strokeColor("#ccc").lineWidth(0.5).stroke();
      }

      const totalTon = gheeTon + oilTon;
      const grandTotalTon = totalTon + rsoTon + soapTon;

      y += 10;
      doc.font("Helvetica-Bold").fontSize(10);
      const summaryLine = (label: string, value: string) => {
        doc.text(label, left, y, { width: usableWidth - 100 });
        doc.text(value, left + usableWidth - 100, y, { width: 100, align: "right" });
        y += 16;
      };
      summaryLine("Total Amount", Math.round(totalAmount).toLocaleString());
      summaryLine("Weight (Ghee)", gheeTon.toFixed(3));
      summaryLine("Weight (Oil)", oilTon.toFixed(3));
      summaryLine("Total Weight (Ton)", totalTon.toFixed(3));
      summaryLine("Weight (RSO)", rsoTon.toFixed(3));
      summaryLine("Weight (SOAP)", soapTon.toFixed(3));
      summaryLine("G.Total Weight (Ton)", grandTotalTon.toFixed(3));

      if (order.notes) {
        doc.moveDown(1);
        doc.font("Helvetica-Oblique").fontSize(9).fillColor("#666").text(`Notes: ${order.notes}`, left, doc.y, { width: usableWidth });
        doc.fillColor("#000");
      }
    });

    doc.end();
  });
}