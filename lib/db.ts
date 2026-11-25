import { Pool, type QueryResultRow } from "pg";
import { readFile } from "fs/promises";
import path from "path";
import { displayName } from "./meeting";

export type Attendee = {
  id: string;
  seq: number;
  region: string;
  regionOrder: number;
  branch: string;
  nameZh: string;
  nameEn: string;
};

export type Signin = {
  id: string;
  attendeeId: string | null;
  region: string;
  regionOrder: number;
  branch: string;
  nameZh: string;
  nameEn: string;
  isWalkIn: boolean;
  meal: "meat" | "veg" | "none";
  signatureKey: string;
  signedAt: Date;
};

const globalForPg = globalThis as unknown as { pool?: Pool; ready?: Promise<void> };

export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

export function getPool() {
  const url = databaseUrl();
  if (!url) {
    throw new Error("缺少 DATABASE_URL（或 POSTGRES_URL）。請設定 Postgres 連線字串。");
  }
  if (!globalForPg.pool) {
    const local = /localhost|127\.0\.0\.1/.test(url);
    globalForPg.pool = new Pool({
      connectionString: url,
      max: 5,
      ssl: local ? undefined : { rejectUnauthorized: false },
    });
  }
  return globalForPg.pool;
}

async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

export async function ensureDb() {
  if (!globalForPg.ready) {
    globalForPg.ready = (async () => {
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS attendees (
          id TEXT PRIMARY KEY,
          seq INTEGER NOT NULL,
          region TEXT NOT NULL,
          region_order INTEGER NOT NULL,
          branch TEXT NOT NULL,
          name_zh TEXT NOT NULL DEFAULT '',
          name_en TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS signins (
          id TEXT PRIMARY KEY,
          attendee_id TEXT,
          region TEXT NOT NULL,
          region_order INTEGER NOT NULL,
          branch TEXT NOT NULL,
          name_zh TEXT NOT NULL DEFAULT '',
          name_en TEXT NOT NULL DEFAULT '',
          is_walk_in BOOLEAN NOT NULL DEFAULT FALSE,
          meal TEXT NOT NULL,
          signature_key TEXT NOT NULL,
          signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      const count = await query<{ n: string }>("SELECT COUNT(*)::text AS n FROM attendees");
      if (Number(count[0]?.n ?? 0) === 0) {
        await seedFromFile();
      }
    })();
  }
  await globalForPg.ready;
}

type SeedFile = {
  attendees: Array<{
    seq: number;
    region: string;
    branch: string;
    nameZh: string;
    nameEn: string;
  }>;
};

export async function seedFromFile() {
  const file = path.join(process.cwd(), "data", "attendees.json");
  const raw = await readFile(file, "utf8");
  const data = JSON.parse(raw) as SeedFile;
  await replaceAttendees(data.attendees);
}

export async function replaceAttendees(
  rows: Array<{ seq?: number; region: string; branch: string; nameZh: string; nameEn: string }>,
) {
  const regionOrder = new Map<string, number>();
  const cleaned = rows
    .map((row, index) => {
      const region = row.region.trim();
      const branch = row.branch.trim();
      const nameZh = (row.nameZh ?? "").trim();
      const nameEn = (row.nameEn ?? "").trim();
      if (!region || !branch || (!nameZh && !nameEn)) return null;
      if (!regionOrder.has(region)) regionOrder.set(region, regionOrder.size);
      return {
        seq: row.seq && row.seq > 0 ? row.seq : index + 1,
        region,
        regionOrder: regionOrder.get(region)!,
        branch,
        nameZh,
        nameEn,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM attendees");
    for (const [index, row] of cleaned.entries()) {
      await client.query(
        `INSERT INTO attendees (id, seq, region, region_order, branch, name_zh, name_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [`a-${index + 1}`, index + 1, row.region, row.regionOrder, row.branch, row.nameZh, row.nameEn],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return cleaned.length;
}

function mapAttendee(row: QueryResultRow): Attendee {
  return {
    id: row.id,
    seq: row.seq,
    region: row.region,
    regionOrder: row.region_order,
    branch: row.branch,
    nameZh: row.name_zh,
    nameEn: row.name_en,
  };
}

function mapSignin(row: QueryResultRow): Signin {
  return {
    id: row.id,
    attendeeId: row.attendee_id,
    region: row.region,
    regionOrder: row.region_order,
    branch: row.branch,
    nameZh: row.name_zh,
    nameEn: row.name_en,
    isWalkIn: row.is_walk_in,
    meal: row.meal,
    signatureKey: row.signature_key,
    signedAt: new Date(row.signed_at),
  };
}

export async function listAttendees() {
  await ensureDb();
  const rows = await query(`SELECT * FROM attendees ORDER BY region_order, seq, id`);
  return rows.map(mapAttendee);
}

export async function getAttendee(id: string) {
  await ensureDb();
  const rows = await query(`SELECT * FROM attendees WHERE id = $1`, [id]);
  return rows[0] ? mapAttendee(rows[0]) : null;
}

export async function listSignins() {
  await ensureDb();
  const rows = await query(`SELECT * FROM signins ORDER BY region_order, signed_at`);
  return rows.map(mapSignin);
}

export async function findSigninByAttendee(attendeeId: string) {
  await ensureDb();
  const rows = await query(
    `SELECT * FROM signins WHERE attendee_id = $1 ORDER BY signed_at DESC LIMIT 1`,
    [attendeeId],
  );
  return rows[0] ? mapSignin(rows[0]) : null;
}

export async function createSignin(input: {
  id: string;
  attendeeId: string | null;
  region: string;
  regionOrder: number;
  branch: string;
  nameZh: string;
  nameEn: string;
  isWalkIn: boolean;
  meal: "meat" | "veg" | "none";
  signatureKey: string;
}) {
  await ensureDb();
  const rows = await query(
    `INSERT INTO signins
      (id, attendee_id, region, region_order, branch, name_zh, name_en, is_walk_in, meal, signature_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      input.id,
      input.attendeeId,
      input.region,
      input.regionOrder,
      input.branch,
      input.nameZh,
      input.nameEn,
      input.isWalkIn,
      input.meal,
      input.signatureKey,
    ],
  );
  return mapSignin(rows[0]);
}

export async function deleteSignin(id: string) {
  await ensureDb();
  const rows = await query(`DELETE FROM signins WHERE id = $1 RETURNING *`, [id]);
  return rows[0] ? mapSignin(rows[0]) : null;
}

export function attendeeLabel(row: { nameZh: string; nameEn: string }) {
  return displayName(row.nameZh, row.nameEn);
}
