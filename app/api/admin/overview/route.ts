import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { listAttendees, listSignins } from "@/lib/db";
import { MEALS, displayName, formatTaipei } from "@/lib/meeting";
import { signatureUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }
  const [attendees, signins] = await Promise.all([listAttendees(), listSignins()]);
  const signedIds = new Set(signins.map((item) => item.attendeeId).filter(Boolean));

  const regionMap = new Map<
    string,
    {
      name: string;
      order: number;
      signins: Array<Record<string, unknown>>;
      unsigned: Array<{ branch: string; displayName: string }>;
    }
  >();

  const ensure = (name: string, order: number) => {
    if (!regionMap.has(name)) {
      regionMap.set(name, { name, order, signins: [], unsigned: [] });
    }
    return regionMap.get(name)!;
  };

  for (const person of attendees) {
    const region = ensure(person.region, person.regionOrder);
    if (!signedIds.has(person.id)) {
      region.unsigned.push({
        branch: person.branch,
        displayName: displayName(person.nameZh, person.nameEn),
      });
    }
  }

  for (const item of signins) {
    const region = ensure(item.region, item.regionOrder);
    region.signins.push({
      id: item.id,
      branch: item.branch,
      displayName: displayName(item.nameZh, item.nameEn),
      isWalkIn: item.isWalkIn,
      meal: item.meal,
      mealLabel: MEALS[item.meal],
      signedAt: formatTaipei(item.signedAt),
      signatureUrl: signatureUrl(item.id, item.signatureKey),
    });
  }

  const regions = [...regionMap.values()].sort((a, b) => a.order - b.order);
  return NextResponse.json({
    counts: {
      meat: signins.filter((item) => item.meal === "meat").length,
      veg: signins.filter((item) => item.meal === "veg").length,
      none: signins.filter((item) => item.meal === "none").length,
      signed: signins.length,
      walkIn: signins.filter((item) => item.isWalkIn).length,
      unsigned: attendees.filter((item) => !signedIds.has(item.id)).length,
      registered: attendees.length,
    },
    regions,
  });
}
