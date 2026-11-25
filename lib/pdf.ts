import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { MEALS, PDF_TITLE, displayName, formatTaipei, type Meal } from "./meeting";
import { readSignature } from "./storage";

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN_X = 22;
const MARGIN_TOP = 18;
const MARGIN_BOTTOM = 22;
const COLS = [100, 150, 200, 260];
const ROW_H = 80;
const NAVY = rgb(0.075, 0.157, 0.29);
const BAND = rgb(0.9, 0.933, 0.965);
const STATS = rgb(0.945, 0.957, 0.973);
const LINE = rgb(0.8, 0.843, 0.89);
const TEXT = rgb(0.09, 0.145, 0.24);
const MUTED = rgb(0.85, 0.9, 0.95);

export type PdfRow = {
  region: string;
  regionOrder: number;
  branch: string;
  nameZh: string;
  nameEn: string;
  isWalkIn: boolean;
  meal: Meal;
  signatureKey: string;
};

type Group = { region: string; rows: PdfRow[] };

function contentWidth() {
  return PAGE_W - MARGIN_X * 2;
}

function colWidths() {
  const rest = contentWidth() - COLS.reduce((sum, width) => sum + width, 0);
  return [...COLS, rest];
}

function fitSize(font: PDFFont, text: string, size: number, maxWidth: number) {
  let next = size;
  while (next > 7 && font.widthOfTextAtSize(text, next) > maxWidth) next -= 0.25;
  return next;
}

function drawFitted(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  maxWidth: number,
  color = TEXT,
) {
  const used = fitSize(font, text, size, maxWidth);
  page.drawText(text, { x, y, size: used, font, color });
  return used;
}

export async function buildSigninPdf(rows: PdfRow[], exportedAt = new Date()) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = await readFile(path.join(process.cwd(), "fonts", "NotoSansCJKtc-Regular.otf"));
  // subset:false keeps the CJK cmap intact. subset:true on Noto Sans TC drops glyphs in Chrome.
  const font = await doc.embedFont(fontBytes, { subset: false });

  const widths = colWidths();
  const groups = new Map<string, Group>();
  const order: string[] = [];
  for (const row of rows) {
    if (!groups.has(row.region)) {
      groups.set(row.region, { region: row.region, rows: [] });
      order.push(row.region);
    }
    groups.get(row.region)!.rows.push(row);
  }

  const meat = rows.filter((row) => row.meal === "meat").length;
  const veg = rows.filter((row) => row.meal === "veg").length;
  const none = rows.filter((row) => row.meal === "none").length;
  const walkIns = rows.filter((row) => row.isWalkIn).length;
  const when = formatTaipei(exportedAt);

  const images = new Map<string, PDFImage>();
  for (const row of rows) {
    if (images.has(row.signatureKey)) continue;
    try {
      const bytes = await readSignature(row.signatureKey);
      images.set(row.signatureKey, await doc.embedPng(bytes));
    } catch {
      // Leave the cell empty if the file is missing rather than failing the whole export.
    }
  }

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let pageNo = 1;
  let y = drawPageHeader(page, font, when, rows.length, walkIns, meat, veg, none);

  const ensure = (needed: number) => {
    if (y - needed < MARGIN_BOTTOM) {
      drawFooter(page, font, pageNo);
      pageNo += 1;
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = drawPageHeader(page, font, when, rows.length, walkIns, meat, veg, none);
    }
  };

  if (order.length === 0) {
    ensure(40);
    page.drawText("尚無簽到記錄", { x: MARGIN_X + 8, y: y - 28, size: 12, font, color: TEXT });
  }

  for (const region of order) {
    const group = groups.get(region)!;
    ensure(22 + ROW_H);
    y = drawRegionBand(page, font, y, `${region} (${group.rows.length} 人)`);
    for (const row of group.rows) {
      ensure(ROW_H);
      y = drawDataRow(page, font, y, widths, row, images.get(row.signatureKey));
    }
  }

  drawFooter(page, font, pageNo);
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function drawPageHeader(
  page: PDFPage,
  font: PDFFont,
  when: string,
  total: number,
  walkIns: number,
  meat: number,
  veg: number,
  none: number,
) {
  const width = contentWidth();
  let top = PAGE_H - MARGIN_TOP;
  page.drawRectangle({ x: MARGIN_X, y: top - 50, width, height: 50, color: NAVY });
  page.drawText(PDF_TITLE, {
    x: MARGIN_X + 12,
    y: top - 22,
    size: 16,
    font,
    color: rgb(1, 1, 1),
  });
  const subtitle = `匯出時間：${when}（台灣時間）｜總簽到：${total} 人（當場報名 ${walkIns} 人）`;
  drawFitted(page, font, subtitle, MARGIN_X + 12, top - 40, 9, width - 24, MUTED);

  top -= 50;
  page.drawRectangle({ x: MARGIN_X, y: top - 22, width, height: 22, color: STATS });
  page.drawText(`便當統計：葷 ${meat} 份 ／ 素 ${veg} 份 ／ 不用餐 ${none} 人`, {
    x: MARGIN_X + 12,
    y: top - 15,
    size: 9,
    font,
    color: TEXT,
  });
  top -= 22;

  const headers = ["區域", "分校", "姓名", "簽名", "便當"];
  const widths = colWidths();
  page.drawRectangle({ x: MARGIN_X, y: top - 22, width, height: 22, color: NAVY });
  let x = MARGIN_X;
  headers.forEach((label, index) => {
    page.drawText(label, {
      x: x + 8,
      y: top - 15,
      size: 10,
      font,
      color: rgb(1, 1, 1),
    });
    x += widths[index];
  });
  return top - 22;
}

function drawRegionBand(page: PDFPage, font: PDFFont, y: number, label: string) {
  const height = 22;
  page.drawRectangle({
    x: MARGIN_X,
    y: y - height,
    width: contentWidth(),
    height,
    color: BAND,
  });
  page.drawRectangle({
    x: MARGIN_X,
    y: y - height,
    width: contentWidth(),
    height,
    borderColor: LINE,
    borderWidth: 0.4,
  });
  page.drawText(label, { x: MARGIN_X + 8, y: y - 15, size: 10, font, color: TEXT });
  return y - height;
}

function drawDataRow(
  page: PDFPage,
  font: PDFFont,
  y: number,
  widths: number[],
  row: PdfRow,
  image?: PDFImage,
) {
  const bottom = y - ROW_H;
  page.drawRectangle({
    x: MARGIN_X,
    y: bottom,
    width: contentWidth(),
    height: ROW_H,
    borderColor: LINE,
    borderWidth: 0.6,
    color: rgb(1, 1, 1),
  });
  let x = MARGIN_X;
  for (const width of widths) {
    page.drawLine({
      start: { x, y: bottom },
      end: { x, y },
      thickness: 0.4,
      color: LINE,
    });
    x += width;
  }
  page.drawLine({
    start: { x: MARGIN_X + contentWidth(), y: bottom },
    end: { x: MARGIN_X + contentWidth(), y },
    thickness: 0.4,
    color: LINE,
  });

  const name = `${displayName(row.nameZh, row.nameEn)}${row.isWalkIn ? " (當場報名)" : ""}`;
  const cells = [row.region, row.branch, name, "", MEALS[row.meal]];
  x = MARGIN_X;
  cells.forEach((text, index) => {
    if (index === 3) {
      if (image) {
        const maxW = widths[index] - 16;
        const maxH = ROW_H - 16;
        const scale = Math.min(maxW / image.width, maxH / image.height);
        const w = image.width * scale;
        const h = image.height * scale;
        page.drawImage(image, {
          x: x + (widths[index] - w) / 2,
          y: bottom + (ROW_H - h) / 2,
          width: w,
          height: h,
        });
      }
    } else if (index === 4) {
      const size = 12;
      const textWidth = font.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: x + (widths[index] - textWidth) / 2,
        y: bottom + ROW_H / 2 - 4,
        size,
        font,
        color: TEXT,
      });
    } else {
      const maxWidth = widths[index] - 12;
      const size = fitSize(font, text, index === 2 ? 10 : 10, maxWidth);
      const textWidth = font.widthOfTextAtSize(text, size);
      const lines = textWidth > maxWidth ? wrap(font, text, size, maxWidth) : [text];
      const lineH = size + 3;
      const block = lines.length * lineH;
      let textY = bottom + (ROW_H + block) / 2 - size;
      for (const line of lines.slice(0, 3)) {
        page.drawText(line, { x: x + 6, y: textY, size, font, color: TEXT });
        textY -= lineH;
      }
    }
    x += widths[index];
  });
  return bottom;
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number) {
  const lines: string[] = [];
  let current = "";
  for (const char of text) {
    const next = current + char;
    if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
      lines.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawFooter(page: PDFPage, font: PDFFont, pageNo: number) {
  const label = `第 ${pageNo} 頁`;
  const width = font.widthOfTextAtSize(label, 8);
  page.drawText(label, {
    x: PAGE_W - MARGIN_X - width,
    y: 10,
    size: 8,
    font,
    color: rgb(0.4, 0.47, 0.55),
  });
}
