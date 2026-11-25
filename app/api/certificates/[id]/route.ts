import { NextResponse } from "next/server";
import { buildCertificatePdf } from "@/lib/certificate-pdf";
import { readCertificateSettings } from "@/lib/certificate-settings";
import { getSignin } from "@/lib/db";
import { displayName } from "@/lib/meeting";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const signin = await getSignin(id);
  if (!signin) {
    return NextResponse.json({ error: "尚未簽到，無法下載出席證明" }, { status: 404 });
  }
  const { effective } = await readCertificateSettings();
  const name = displayName(signin.nameZh, signin.nameEn);
  const pdf = await buildCertificatePdf({
    name,
    branch: signin.branch,
    region: signin.region,
    signedAt: signin.signedAt,
    settings: effective,
  });
  const filename = encodeURIComponent(`出席證明_${name}.pdf`);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
