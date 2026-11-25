import { NextResponse } from "next/server";
import { passwordsMatch, setAdminCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = String(body?.password ?? "");
  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "伺服器尚未設定 ADMIN_PASSWORD" }, { status: 500 });
  }
  if (!password || !passwordsMatch(password)) {
    return NextResponse.json({ error: "密碼不正確" }, { status: 401 });
  }
  await setAdminCookie();
  return NextResponse.json({ ok: true });
}
