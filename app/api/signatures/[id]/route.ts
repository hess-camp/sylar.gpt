import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { listSignins } from "@/lib/db";
import { readSignature } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }
  const { id } = await context.params;
  const signins = await listSignins();
  const signin = signins.find((item) => item.id === id);
  if (!signin) return NextResponse.json({ error: "找不到簽名" }, { status: 404 });
  const bytes = await readSignature(signin.signatureKey);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=60",
    },
  });
}
