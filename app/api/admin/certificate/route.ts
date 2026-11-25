import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import {
  normalizeMeetingDate,
  readCertificateSettings,
  writeCertificateSettings,
  type CertificateInput,
} from "@/lib/certificate-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }
  return NextResponse.json(await readCertificateSettings());
}

export async function PUT(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "資料格式不正確" }, { status: 400 });
  }
  const meetingDateRaw = clean((body as { meetingDate?: unknown }).meetingDate);
  const meetingDate = meetingDateRaw ? normalizeMeetingDate(meetingDateRaw) : "";
  if (meetingDateRaw && !meetingDate) {
    return NextResponse.json({ error: "會議日期請用 YYYY.MM.DD" }, { status: 400 });
  }
  const stored: CertificateInput = {
    meetingDate,
    meetingName: clean((body as { meetingName?: unknown }).meetingName),
    time: clean((body as { time?: unknown }).time),
    issuer: clean((body as { issuer?: unknown }).issuer),
    organizer: clean((body as { organizer?: unknown }).organizer),
  };
  if (Object.values(stored).some((value) => value.length > 80)) {
    return NextResponse.json({ error: "欄位請在 80 字以內" }, { status: 400 });
  }
  return NextResponse.json(await writeCertificateSettings(stored));
}
