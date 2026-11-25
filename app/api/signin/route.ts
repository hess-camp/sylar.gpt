import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  createSignin,
  findSigninByAttendee,
  getAttendee,
  listAttendees,
} from "@/lib/db";
import { displayName, formatTaipei, isMeal, MEALS } from "@/lib/meeting";
import { saveSignature } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "資料格式不正確" }, { status: 400 });
  }
  const meal = String(body.meal ?? "");
  const signature = String(body.signature ?? "");
  if (!isMeal(meal)) {
    return NextResponse.json({ error: "請選擇便當" }, { status: 400 });
  }
  const png = decodePng(signature);
  if (!png) {
    return NextResponse.json({ error: "請先簽名" }, { status: 400 });
  }

  let region = "";
  let branch = "";
  let regionOrder = 0;
  let nameZh = "";
  let nameEn = "";
  let attendeeId: string | null = null;
  let isWalkIn = false;

  if (body.attendeeId) {
    const attendee = await getAttendee(String(body.attendeeId));
    if (!attendee) return NextResponse.json({ error: "找不到這位報名者" }, { status: 404 });
    const existing = await findSigninByAttendee(attendee.id);
    if (existing) {
      return NextResponse.json(
        { error: `已於 ${formatTaipei(existing.signedAt)} 簽到` },
        { status: 409 },
      );
    }
    region = attendee.region;
    branch = attendee.branch;
    regionOrder = attendee.regionOrder;
    nameZh = attendee.nameZh;
    nameEn = attendee.nameEn;
    attendeeId = attendee.id;
  } else {
    isWalkIn = true;
    region = String(body.region ?? "").trim();
    branch = String(body.branch ?? "").trim();
    nameZh = String(body.nameZh ?? "").trim();
    nameEn = String(body.nameEn ?? "").trim();
    if (!region || !branch) {
      return NextResponse.json({ error: "請先選擇區域與分校" }, { status: 400 });
    }
    if (!nameZh && !nameEn) {
      return NextResponse.json({ error: "請填寫中文姓名或英文名" }, { status: 400 });
    }
    const attendees = await listAttendees();
    const known = attendees.find((item) => item.region === region);
    regionOrder = known?.regionOrder ?? 999;
  }

  const id = randomUUID();
  const signatureKey = await saveSignature(id, png);
  const signin = await createSignin({
    id,
    attendeeId,
    region,
    regionOrder,
    branch,
    nameZh,
    nameEn,
    isWalkIn,
    meal,
    signatureKey,
  });

  return NextResponse.json({
    id: signin.id,
    displayName: displayName(signin.nameZh, signin.nameEn),
    mealLabel: MEALS[signin.meal],
    signedAt: formatTaipei(signin.signedAt),
    isWalkIn: signin.isWalkIn,
    region: signin.region,
    branch: signin.branch,
  });
}

function decodePng(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length < 800 || bytes.length > 2_500_000) return null;
  return bytes;
}
