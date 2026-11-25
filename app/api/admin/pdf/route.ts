import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { listAttendees, listSignins } from "@/lib/db";
import { buildSigninPdf } from "@/lib/pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }
  const [signins, attendees] = await Promise.all([listSignins(), listAttendees()]);
  const branchRank = new Map<string, number>();
  for (const person of attendees) {
    const key = `${person.region}\0${person.branch}`;
    if (!branchRank.has(key)) branchRank.set(key, person.seq);
  }
  const ordered = [...signins].sort((a, b) => {
    const region = a.regionOrder - b.regionOrder;
    if (region) return region;
    const branch =
      (branchRank.get(`${a.region}\0${a.branch}`) ?? 9999) -
      (branchRank.get(`${b.region}\0${b.branch}`) ?? 9999);
    if (branch) return branch;
    return a.signedAt.getTime() - b.signedAt.getTime();
  });
  const pdf = await buildSigninPdf(
    ordered.map((item) => ({
      region: item.region,
      regionOrder: item.regionOrder,
      branch: item.branch,
      nameZh: item.nameZh,
      nameEn: item.nameEn,
      isWalkIn: item.isWalkIn,
      meal: item.meal,
      signatureKey: item.signatureKey,
    })),
  );
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename*=UTF-8''HCT_%E7%B0%BD%E5%88%B0%E8%A8%98%E9%8C%84_A4%E6%A9%AB%E5%BC%8F.pdf",
      "Cache-Control": "no-store",
    },
  });
}
