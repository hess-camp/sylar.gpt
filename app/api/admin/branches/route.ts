import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { splitCsv, stripBom } from "@/lib/csv";
import { replaceBranches } from "@/lib/db";

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
  const records = splitCsv(stripBom(await file.text())).filter((row) => row.some((cell) => cell.trim()));
  if (records.length === 0) {
    return NextResponse.json({ error: "CSV 沒有可匯入的資料列" }, { status: 400 });
  }
  const header = records[0].map((cell) => cell.trim());
  const hasHeader = header.includes("區域") && header.includes("分校");
  const data = hasHeader ? records.slice(1) : records;
  const regionIndex = hasHeader ? header.indexOf("區域") : 0;
  const branchIndex = hasHeader ? header.indexOf("分校") : 1;
  const rows = data
    .map((row) => ({
      region: row[regionIndex] ?? "",
      branch: row[branchIndex] ?? "",
    }))
    .filter((row) => row.region.trim() && row.branch.trim());
  if (rows.length === 0) {
    return NextResponse.json({ error: "CSV 需要區域與分校" }, { status: 400 });
  }
  const count = await replaceBranches(rows);
  return NextResponse.json({ count });
}
