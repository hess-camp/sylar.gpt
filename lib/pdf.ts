import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { MEALS, PDF_TITLE, displayName, formatTaipei, type Meal } from "./meeting";
import { readSignature } from "./storage";

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN_X = 22;
const MARGIN_TOP = 14;
const CONTENT_BOTTOM = 20;
const ROWS_PER_PAGE = 10;
const TITLE_H = 34;
const STATS_H = 16;
const REGION_H = 20;
const HEADER_ROW_H = 16;
// Remaining height after the title, meal stats, region heading, and column labels,
// split so a full page holds exactly 10 people.
const ROW_H =
  (PAGE_H - MARGIN_TOP - CONTENT_BOTTOM - TITLE_H - STATS_H - REGION_H - HEADER_ROW_H) /
  ROWS_PER_PAGE;
const COLS = [100, 150, 200, 260];
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
  email: string;
};

type Group = { region: string; rows: PdfRow[] };
type PageChunk = { region: string; rows: PdfRow[]; continued: boolean; total: number };

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

function fitLines(font: PDFFont, text: string, size: number, maxWidth: number, maxLines: number) {
  let next = size;
  let lines = wrap(font, text, next, maxWidth);
  while (lines.length > maxLines && next > 7) {
    next -= 0.5;
    lines = wrap(font, text, next, maxWidth);
  }
  return { size: next, lines: lines.slice(0, maxLines) };
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
  const summary = { when, total: rows.length, walkIns, meat, veg, none };

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

  const chunks: PageChunk[] = [];
  for (const region of order) {
    const group = groups.get(region)!;
    for (let index = 0; index < group.rows.length; index += ROWS_PER_PAGE) {
      chunks.push({
        region,
        rows: group.rows.slice(index, index + ROWS_PER_PAGE),
        continued: index > 0,
        total: group.rows.length,
      });
    }
  }

  if (chunks.length === 0) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const y = drawTitleBlock(page, font, summary);
    page.drawText("尚無簽到記錄", { x: MARGIN_X + 8, y: y - 28, size: 12, font, color: TEXT });
    drawFooter(page, font, 1);
  } else {
    chunks.forEach((chunk, index) => {
      const page = doc.addPage([PAGE_W, PAGE_H]);
      const label = `${chunk.region} (${chunk.total} 人${chunk.continued ? "，續" : ""})`;
      let y = drawPageChrome(page, font, summary, label);
      for (const row of chunk.rows) {
        y = drawDataRow(page, font, y, widths, row, images.get(row.signatureKey));
      }
      drawFooter(page, font, index + 1);
    });
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

type Summary = {
  when: string;
  total: number;
  walkIns: number;
  meat: number;
  veg: number;
  none: number;
};

function drawTitleBlock(page: PDFPage, font: PDFFont, summary: Summary) {
  const width = contentWidth();
  let top = PAGE_H - MARGIN_TOP;
  page.drawRectangle({ x: MARGIN_X, y: top - TITLE_H, width, height: TITLE_H, color: NAVY });
  page.drawText(PDF_TITLE, {
    x: MARGIN_X + 12,
    y: top - 15,
    size: 13,
    font,
    color: rgb(1, 1, 1),
  });
  const subtitle = `匯出時間：${summary.when}（台灣時間）｜總簽到：${summary.total} 人（當場報名 ${summary.walkIns} 人）`;
  drawFitted(page, font, subtitle, MARGIN_X + 12, top - 28, 8, width - 24, MUTED);
  top -= TITLE_H;

  page.drawRectangle({ x: MARGIN_X, y: top - STATS_H, width, height: STATS_H, color: STATS });
  page.drawText(`便當統計：葷 ${summary.meat} 份 ／ 素 ${summary.veg} 份 ／ 不用餐 ${summary.none} 人`, {
    x: MARGIN_X + 12,
    y: top - 11,
    size: 8,
    font,
    color: TEXT,
  });
  return top - STATS_H;
}

function drawPageChrome(page: PDFPage, font: PDFFont, summary: Summary, regionLabel: string) {
  const top = drawTitleBlock(page, font, summary);
  const width = contentWidth();
  page.drawRectangle({
    x: MARGIN_X,
    y: top - REGION_H,
    width,
    height: REGION_H,
    color: BAND,
  });
  page.drawRectangle({
    x: MARGIN_X,
    y: top - REGION_H,
    width,
    height: REGION_H,
    borderColor: LINE,
    borderWidth: 0.4,
  });
  page.drawText(regionLabel, { x: MARGIN_X + 8, y: top - 14, size: 11, font, color: TEXT });

  const headerTop = top - REGION_H;
  const headers = ["區域", "分校", "姓名", "簽名", "便當"];
  const widths = colWidths();
  page.drawRectangle({
    x: MARGIN_X,
    y: headerTop - HEADER_ROW_H,
    width,
    height: HEADER_ROW_H,
    color: NAVY,
  });
  let x = MARGIN_X;
  headers.forEach((label, index) => {
    page.drawText(label, {
      x: x + 8,
      y: headerTop - 12,
      size: 9,
      font,
      color: rgb(1, 1, 1),
    });
    x += widths[index];
  });
  return headerTop - HEADER_ROW_H;
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
        const maxW = widths[index] - 12;
        const maxH = ROW_H - 6;
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
      const size = 11;
      const textWidth = font.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: x + (widths[index] - textWidth) / 2,
        y: bottom + (ROW_H - size) / 2,
        size,
        font,
        color: TEXT,
      });
    } else if (index === 2 && row.email) {
      const maxWidth = widths[index] - 12;
      const fitted = fitLines(font, text, 9, maxWidth, 1);
      const emailSize = 7;
      const emailLine = fitLines(font, row.email, emailSize, maxWidth, 1).lines[0] ?? "";
      page.drawText(fitted.lines[0] ?? "", {
        x: x + 6,
        y: bottom + ROW_H / 2 + 3,
        size: fitted.size,
        font,
        color: TEXT,
      });
      page.drawText(emailLine, {
        x: x + 6,
        y: bottom + 8,
        size: emailSize,
        font,
        color: rgb(0.35, 0.42, 0.52),
      });
    } else {
      const maxWidth = widths[index] - 12;
      const fitted = fitLines(font, text, 9, maxWidth, 2);
      const lineH = fitted.size + 2;
      let textY = bottom + ROW_H / 2 - fitted.size / 2 + ((fitted.lines.length - 1) * lineH) / 2;
      for (const line of fitted.lines) {
        page.drawText(line, { x: x + 6, y: textY, size: fitted.size, font, color: TEXT });
        textY -= lineH;
      }
    }
    x += widths[index];
  });
  return bottom;
}

function drawFooter(page: PDFPage, font: PDFFont, pageNo: number) {
  const label = `第 ${pageNo} 頁`;
  const width = font.widthOfTextAtSize(label, 8);
  page.drawText(label, {
    x: PAGE_W - MARGIN_X - width,
    y: 8,
    size: 8,
    font,
    color: rgb(0.4, 0.47, 0.55),
  });
}
