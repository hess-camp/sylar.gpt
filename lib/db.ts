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
          signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          email TEXT NOT NULL DEFAULT '',
          fortune_index INTEGER
        );
        ALTER TABLE signins ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
        ALTER TABLE signins ADD COLUMN IF NOT EXISTS fortune_index INTEGER;
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS branches (
          region TEXT NOT NULL,
          region_order INTEGER NOT NULL,
          branch TEXT NOT NULL,
          seq INTEGER NOT NULL,
          PRIMARY KEY (region, branch)
        );
      `);
      const count = await query<{ n: string }>("SELECT COUNT(*)::text AS n FROM attendees");
      if (Number(count[0]?.n ?? 0) === 0) {
        await seedFromFile();
      }
      const branchCount = await query<{ n: string }>("SELECT COUNT(*)::text AS n FROM branches");
      if (Number(branchCount[0]?.n ?? 0) === 0) {
        await seedBranchesFromAttendees();
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

async function seedBranchesFromAttendees() {
  const people = await query<{ region: string; region_order: number; branch: string }>(
    "SELECT region, region_order, branch FROM attendees ORDER BY region_order, seq, id",
  );
  const seen = new Set<string>();
  const seqByRegion = new Map<string, number>();
  for (const person of people) {
    const key = `${person.region}\0${person.branch}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const seq = (seqByRegion.get(person.region) ?? 0) + 1;
    seqByRegion.set(person.region, seq);
    await getPool().query(
      `INSERT INTO branches (region, region_order, branch, seq) VALUES ($1,$2,$3,$4)
       ON CONFLICT (region, branch) DO NOTHING`,
      [person.region, person.region_order, person.branch, seq],
    );
  }
}

export type BranchRow = {
  region: string;
  regionOrder: number;
  branch: string;
  seq: number;
};

export async function listBranchRows() {
  await ensureDb();
  const rows = await query(
    `SELECT region, region_order, branch, seq FROM branches ORDER BY region_order, seq, branch`,
  );
  return rows.map(
    (row): BranchRow => ({
      region: row.region,
      regionOrder: row.region_order,
      branch: row.branch,
      seq: row.seq,
    }),
  );
}

export async function replaceBranches(rows: Array<{ region: string; branch: string }>) {
  await ensureDb();
  const regionOrder = new Map<string, number>();
  const seqByRegion = new Map<string, number>();
  const cleaned: Array<{ region: string; regionOrder: number; branch: string; seq: number }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const region = row.region.trim();
    const branch = row.branch.trim();
    if (!region || !branch) continue;
    const key = `${region}\0${branch}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!regionOrder.has(region)) regionOrder.set(region, regionOrder.size);
    const seq = (seqByRegion.get(region) ?? 0) + 1;
    seqByRegion.set(region, seq);
    cleaned.push({ region, regionOrder: regionOrder.get(region)!, branch, seq });
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM branches");
    for (const row of cleaned) {
      await client.query(
        `INSERT INTO branches (region, region_order, branch, seq) VALUES ($1,$2,$3,$4)`,
        [row.region, row.regionOrder, row.branch, row.seq],
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

export async function getSignin(id: string) {
  await ensureDb();
  const rows = await query(`SELECT * FROM signins WHERE id = $1`, [id]);
  return rows[0] ? mapSignin(rows[0]) : null;
}

export async function getSettings(keys: string[]) {
  await ensureDb();
  if (keys.length === 0) return new Map<string, string>();
  const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
  const rows = await query<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN (${placeholders})`,
    keys,
  );
  return new Map(rows.map((row) => [row.key, row.value]));
}

export async function upsertSettings(entries: Array<{ key: string; value: string }>) {
  await ensureDb();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const entry of entries) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [entry.key, entry.value],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

export async function readFortuneIndex(id: string) {
  await ensureDb();
  const rows = await query<{ fortune_index: number | null }>(
    `SELECT fortune_index FROM signins WHERE id = $1`,
    [id],
  );
  if (!rows[0]) return undefined;
  return rows[0].fortune_index;
}

export async function claimFortune(id: string, index: number) {
  await ensureDb();
  const rows = await query<{ fortune_index: number }>(
    `UPDATE signins
     SET fortune_index = COALESCE(fortune_index, $2)
     WHERE id = $1
     RETURNING fortune_index`,
    [id, index],
  );
  return rows[0]?.fortune_index ?? null;
}

export async function deleteSignin(id: string) {
  await ensureDb();
  const rows = await query(`DELETE FROM signins WHERE id = $1 RETURNING *`, [id]);
  return rows[0] ? mapSignin(rows[0]) : null;
}

export function attendeeLabel(row: { nameZh: string; nameEn: string }) {
  return displayName(row.nameZh, row.nameEn);
}
