import { readFile } from "fs/promises";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { CertificateInput } from "./certificate-settings";
import { formatTaipeiDate } from "./meeting";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const NAVY = rgb(0.063, 0.165, 0.298);
const TEXT = rgb(0.09, 0.145, 0.24);
const LINE = rgb(0.75, 0.8, 0.86);
const RULE = rgb(0.72, 0.58, 0.28);

export const CERTIFICATE_TITLE = "出席證明";
export const CERTIFICATE_BODY =
  "茲證明貴校同仁因參與總處會議及相關教育訓練，需於指定時間至總處出席，故無法於學校進行打卡。特此證明，供相關單位查核。";

const LEFT = 78;
const RIGHT = PAGE_W - 78;
const VALUE_X = 214;

export type CertificatePdfInput = {
  name: string;
  branch: string;
  region: string;
  signedAt: Date;
  settings: CertificateInput;
};

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
  return lines.length ? lines : [""];
}

function wrapFlow(font: PDFFont, text: string, size: number, fullWidth: number, indent: number) {
  const lines: Array<{ text: string; indent: number; justify: boolean }> = [];
  let rest = text;
  let first = true;
  while (rest) {
    const maxWidth = first ? fullWidth - indent : fullWidth;
    let line = "";
    for (const char of rest) {
      if (line && font.widthOfTextAtSize(line + char, size) > maxWidth) break;
      line += char;
    }
    rest = rest.slice(line.length);
    lines.push({ text: line, indent: first ? indent : 0, justify: rest.length > 0 });
    first = false;
  }
  return lines;
}

function drawJustifiedLine(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  targetWidth: number,
  justify: boolean,
) {
  const natural = [...text].reduce((sum, char) => sum + font.widthOfTextAtSize(char, size), 0);
  const gap = text.length > 1 ? (targetWidth - natural) / (text.length - 1) : 0;
  const evenEdges = justify || (text.length > 1 && gap > 0 && gap <= size * 0.25);
  if (!evenEdges) {
    page.drawText(text, { x, y, size, font, color: TEXT });
    return;
  }
  let cursor = x;
  for (const char of text) {
    page.drawText(char, { x: cursor, y, size, font, color: TEXT });
    cursor += font.widthOfTextAtSize(char, size) + gap;
  }
}

function drawTracked(page: PDFPage, font: PDFFont, text: string, y: number, size: number, tracking: number) {
  const widths = [...text].map((char) => font.widthOfTextAtSize(char, size));
  const total = widths.reduce((sum, width) => sum + width, 0) + tracking * Math.max(text.length - 1, 0);
  let x = (PAGE_W - total) / 2;
  for (let index = 0; index < text.length; index += 1) {
    page.drawText(text[index], { x, y, size, font, color: NAVY });
    x += widths[index] + tracking;
  }
}

function drawField(page: PDFPage, font: PDFFont, y: number, label: string, value: string) {
  const size = 13;
  const lines = wrap(font, value, size, RIGHT - VALUE_X);
  const height = Math.max(40, 18 + lines.length * 20);
  page.drawText(`${label}：`, { x: LEFT, y: y - 18, size: 12, font, color: NAVY });
  let textY = y - 18;
  for (const line of lines) {
    page.drawText(line, { x: VALUE_X, y: textY, size, font, color: TEXT });
    textY -= 20;
  }
  page.drawLine({
    start: { x: LEFT, y: y - height + 8 },
    end: { x: RIGHT, y: y - height + 8 },
    thickness: 0.4,
    color: LINE,
  });
  return y - height;
}

export async function buildCertificatePdf(input: CertificatePdfInput) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(CERTIFICATE_TITLE);
  const fontBytes = await readFile(path.join(process.cwd(), "fonts", "NotoSansCJKtc-Regular.otf"));
  // subset:false keeps the CJK cmap intact. subset:true on Noto Sans TC drops glyphs in Chrome.
  const font = await doc.embedFont(fontBytes, { subset: false });
  const page = doc.addPage([PAGE_W, PAGE_H]);

  page.drawRectangle({
    x: 28,
    y: 28,
    width: PAGE_W - 56,
    height: PAGE_H - 56,
    borderColor: NAVY,
    borderWidth: 1.4,
  });
  page.drawRectangle({
    x: 34,
    y: 34,
    width: PAGE_W - 68,
    height: PAGE_H - 68,
    borderColor: NAVY,
    borderWidth: 0.4,
  });

  drawTracked(page, font, CERTIFICATE_TITLE, PAGE_H - 128, 28, 10);
  const ruleW = 148;
  page.drawLine({
    start: { x: (PAGE_W - ruleW) / 2, y: PAGE_H - 146 },
    end: { x: (PAGE_W + ruleW) / 2, y: PAGE_H - 146 },
    thickness: 1,
    color: RULE,
  });

  const meeting = `${input.settings.meetingDate} ${input.settings.meetingName}`.trim();
  const fields: Array<[string, string]> = [
    ["姓名", input.name],
    ["分校", `${input.branch}（區域：${input.region}）`],
    ["會議/訓練名稱", meeting],
    ["時間", input.settings.time],
    ["核發單位", input.settings.issuer],
    ["籌辦人", input.settings.organizer],
  ];

  let y = PAGE_H - 188;
  for (const [label, value] of fields) {
    y = drawField(page, font, y, label, value);
  }

  y -= 28;
  const bodySize = 14;
  const fullWidth = RIGHT - LEFT;
  const indent = font.widthOfTextAtSize("中中", bodySize);
  const lines = wrapFlow(font, CERTIFICATE_BODY, bodySize, fullWidth, indent);
  let bodyY = y;
  for (const line of lines) {
    drawJustifiedLine(
      page,
      font,
      line.text,
      LEFT + line.indent,
      bodyY,
      bodySize,
      fullWidth - line.indent,
      line.justify,
    );
    bodyY -= 28;
  }

  page.drawText(`簽到日期：${formatTaipeiDate(input.signedAt)}`, {
    x: LEFT,
    y: bodyY - 16,
    size: 12,
    font,
    color: TEXT,
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
