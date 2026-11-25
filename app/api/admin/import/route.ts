import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { ensureDb, replaceAttendees } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "請選擇 CSV 檔" }, { status: 400 });
  }
  const text = stripBom(await file.text());
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return NextResponse.json({ error: "CSV 沒有可匯入的資料列" }, { status: 400 });
  }
  await ensureDb();
  const count = await replaceAttendees(rows);
  return NextResponse.json({ count });
}

function stripBom(text: string) {
  return text.replace(/^\uFEFF/, "");
}

function parseCsv(text: string) {
  const records = splitCsv(text).filter((row) => row.some((cell) => cell.trim()));
  if (records.length === 0) return [];
  const header = records[0].map((cell) => cell.trim());
  const index = (names: string[]) => header.findIndex((cell) => names.includes(cell));
  const hasHeader = ["區域", "分校"].every((name) => header.includes(name));
  const data = hasHeader ? records.slice(1) : records;
  const col = hasHeader
    ? {
        seq: index(["編號", "序號"]),
        region: index(["區域"]),
        branch: index(["分校"]),
        nameZh: index(["中文姓名", "中文名", "姓名"]),
        nameEn: index(["英文名", "英文姓名"]),
      }
    : { seq: 0, region: 1, branch: 2, nameZh: 3, nameEn: 4 };

  return data
    .map((row) => ({
      seq: Number(row[col.seq] ?? ""),
      region: row[col.region] ?? "",
      branch: row[col.branch] ?? "",
      nameZh: row[col.nameZh] ?? "",
      nameEn: row[col.nameEn] ?? "",
    }))
    .filter((row) => row.region.trim() && row.branch.trim());
}

function splitCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
