import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { deleteSignin } from "@/lib/db";
import { deleteSignature } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }
  const { id } = await context.params;
  const removed = await deleteSignin(id);
  if (!removed) return NextResponse.json({ error: "找不到這筆簽到" }, { status: 404 });
  await deleteSignature(removed.signatureKey);
  return NextResponse.json({ ok: true });
}
