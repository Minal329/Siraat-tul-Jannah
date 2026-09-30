// Draws a certificate of completion as a PDF (A4 landscape) in the academy's
// brand: ivory paper, navy and gold, Amiri for headings, Work Sans for text.
// Built fresh on every download, so a corrected name or course title shows up
// without regenerating any files.
import { createRequire } from "node:module";
import PDFDocument from "pdfkit";

const require = createRequire(import.meta.url);
const FONTS = {
  amiriBold: require.resolve("@fontsource/amiri/files/amiri-latin-700-normal.woff"),
  amiri: require.resolve("@fontsource/amiri/files/amiri-latin-400-normal.woff"),
  sans: require.resolve("@fontsource/work-sans/files/work-sans-latin-400-normal.woff"),
  sansSemi: require.resolve("@fontsource/work-sans/files/work-sans-latin-600-normal.woff"),
};

const NAVY = "#0B2A4A";
const GOLD = "#B48B48";
const IVORY = "#F5F0E4";
const TEXT = "#14213A";

export type CertificateData = {
  studentName: string;
  courseTitle: string;
  certificateNumber: string;
  issuedAt: Date;
  verifyUrl: string;
};

// The academy's badge: an open book and pen inside a gold sunburst circle.
// (Swap for the real logo image once it's added to the project.)
function drawBadge(doc: PDFKit.PDFDocument, cx: number, cy: number) {
  doc.save().strokeColor(GOLD).lineWidth(1.2);
  for (let i = 0; i < 32; i++) {
    const angle = (i * Math.PI * 2) / 32;
    const inner = 30;
    const outer = i % 2 === 0 ? 42 : 37;
    doc
      .moveTo(cx + inner * Math.cos(angle), cy + inner * Math.sin(angle))
      .lineTo(cx + outer * Math.cos(angle), cy + outer * Math.sin(angle))
      .stroke();
  }
  doc.circle(cx, cy, 28).fillAndStroke(NAVY, GOLD);
  // open book
  doc.strokeColor(IVORY).lineWidth(1.4);
  doc.moveTo(cx - 15, cy + 2).bezierCurveTo(cx - 9, cy - 3, cx - 4, cy - 2, cx, cy + 3).stroke();
  doc.moveTo(cx + 15, cy + 2).bezierCurveTo(cx + 9, cy - 3, cx + 4, cy - 2, cx, cy + 3).stroke();
  doc.moveTo(cx - 15, cy + 8).bezierCurveTo(cx - 9, cy + 3, cx - 4, cy + 4, cx, cy + 9).stroke();
  doc.moveTo(cx + 15, cy + 8).bezierCurveTo(cx + 9, cy + 3, cx + 4, cy + 4, cx, cy + 9).stroke();
  doc.moveTo(cx, cy + 3).lineTo(cx, cy + 9).stroke();
  // pen
  doc.strokeColor(GOLD).lineWidth(1.6).moveTo(cx + 4, cy - 4).lineTo(cx + 12, cy - 16).stroke();
  doc.restore();
}

export function renderCertificatePdf(data: CertificateData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 0,
    info: { Title: `Certificate of Completion — ${data.studentName}`, Author: "Siraat tul Jannah" },
  });
  doc.registerFont("heading", FONTS.amiriBold);
  doc.registerFont("serif", FONTS.amiri);
  doc.registerFont("body", FONTS.sans);
  doc.registerFont("bodySemi", FONTS.sansSemi);

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const { width: W, height: H } = doc.page;
  const center = (text: string, y: number, font: string, size: number, color: string) =>
    doc.font(font).fontSize(size).fillColor(color).text(text, 60, y, { width: W - 120, align: "center" });

  // paper and double border
  doc.rect(0, 0, W, H).fill(IVORY);
  doc.lineWidth(6).strokeColor(NAVY).rect(24, 24, W - 48, H - 48).stroke();
  doc.lineWidth(1.2).strokeColor(GOLD).rect(36, 36, W - 72, H - 72).stroke();

  drawBadge(doc, W / 2, 104);
  center("Siraat tul Jannah", 152, "heading", 26, NAVY);
  center("CERTIFICATE OF COMPLETION", 190, "bodySemi", 13, GOLD);
  center("This certifies that", 232, "body", 13, TEXT);
  center(data.studentName, 254, "heading", 40, NAVY);
  doc.moveTo(W / 2 - 180, 312).lineTo(W / 2 + 180, 312).lineWidth(0.8).strokeColor(GOLD).stroke();
  center("has successfully completed the course", 326, "body", 13, TEXT);
  center(data.courseTitle, 348, "serif", 26, NAVY);

  // signature and date
  const issued = data.issuedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" });
  const colY = 440;
  doc.lineWidth(0.8).strokeColor(TEXT);
  doc.moveTo(150, colY).lineTo(330, colY).stroke();
  doc.moveTo(W - 330, colY).lineTo(W - 150, colY).stroke();
  doc.font("bodySemi").fontSize(12).fillColor(TEXT).text("Hafiza Aqsa Jamil", 150, colY + 8, { width: 180, align: "center" });
  doc.font("body").fontSize(10).fillColor(TEXT).text("Founder & Instructor", 150, colY + 24, { width: 180, align: "center" });
  doc.font("bodySemi").fontSize(12).fillColor(TEXT).text(issued, W - 330, colY + 8, { width: 180, align: "center" });
  doc.font("body").fontSize(10).fillColor(TEXT).text("Date issued", W - 330, colY + 24, { width: 180, align: "center" });

  center(`Certificate no. ${data.certificateNumber}  ·  Verify at ${data.verifyUrl}`, H - 70, "body", 9, "#5C6472");

  doc.end();
  return done;
}
