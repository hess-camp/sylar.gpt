import { NextResponse } from "next/server";
import { listAttendees, listSignins } from "@/lib/db";
import { MEETING_TITLE, SOURCE_TITLE, displayName, formatTaipei } from "@/lib/meeting";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const [attendees, signins] = await Promise.all([listAttendees(), listSignins()]);
  const signedByAttendee = new Map(
    signins.filter((item) => item.attendeeId).map((item) => [item.attendeeId!, item]),
  );
  const regions: Array<{
    name: string;
    order: number;
    branches: Array<{
      name: string;
      people: Array<{
        id: string;
        displayName: string;
        nameZh: string;
        nameEn: string;
        signed: boolean;
        signedAt: string | null;
      }>;
    }>;
  }> = [];

  for (const person of attendees) {
    let region = regions.find((item) => item.name === person.region);
    if (!region) {
      region = { name: person.region, order: person.regionOrder, branches: [] };
      regions.push(region);
    }
    let branch = region.branches.find((item) => item.name === person.branch);
    if (!branch) {
      branch = { name: person.branch, people: [] };
      region.branches.push(branch);
    }
    const existing = signedByAttendee.get(person.id);
    branch.people.push({
      id: person.id,
      displayName: displayName(person.nameZh, person.nameEn),
      nameZh: person.nameZh,
      nameEn: person.nameEn,
      signed: Boolean(existing),
      signedAt: existing ? formatTaipei(existing.signedAt) : null,
    });
  }

  return NextResponse.json({
    meetingTitle: MEETING_TITLE,
    sourceTitle: SOURCE_TITLE,
    regions,
  });
}
