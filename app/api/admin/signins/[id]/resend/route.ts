import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getSignin } from "@/lib/db";
import { emailCertificate } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }
  const { id } = await context.params;
  const signin = await getSignin(id);
  if (!signin) return NextResponse.json({ error: "找不到這筆簽到" }, { status: 404 });
  if (!signin.email) {
    return NextResponse.json({ error: "這筆簽到沒有 Email" }, { status: 400 });
  }
  const result = await emailCertificate(signin);
  return NextResponse.json(result);
}
