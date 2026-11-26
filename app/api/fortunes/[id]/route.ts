import { NextResponse } from "next/server";
import { claimFortune, readFortuneIndex } from "@/lib/db";
import { FORTUNES, fortuneAt } from "@/lib/fortunes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function payload(index: number) {
  const fortune = fortuneAt(index);
  if (!fortune) return null;
  return { drawn: true, index, ...fortune };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const stored = await readFortuneIndex(id);
  if (stored === undefined) return NextResponse.json({ error: "找不到這筆簽到" }, { status: 404 });
  if (stored === null) return NextResponse.json({ drawn: false });
  return NextResponse.json(payload(stored));
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const preferred = Number(body?.index);
  const index = fortuneAt(preferred) ? preferred : Math.floor(Math.random() * FORTUNES.length);
  const stored = await claimFortune(id, index);
  if (stored === null) return NextResponse.json({ error: "找不到這筆簽到" }, { status: 404 });
  return NextResponse.json(payload(stored));
}
