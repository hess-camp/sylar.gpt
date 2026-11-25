import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE = "hct_admin";
const MAX_AGE_SEC = 60 * 60 * 12;

function password() {
  const value = process.env.ADMIN_PASSWORD;
  if (!value) throw new Error("缺少環境變數 ADMIN_PASSWORD");
  return value;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function passwordsMatch(input: string) {
  const a = digest(input);
  const b = digest(password());
  return timingSafeEqual(a, b);
}

function sign(exp: number) {
  const payload = String(exp);
  const mac = createHmac("sha256", password()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export async function setAdminCookie() {
  const exp = Date.now() + MAX_AGE_SEC * 1000;
  const store = await cookies();
  store.set(COOKIE, sign(exp), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function clearAdminCookie() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function isAdmin() {
  try {
    const store = await cookies();
    const token = store.get(COOKIE)?.value;
    if (!token) return false;
    const [payload, mac] = token.split(".");
    if (!payload || !mac) return false;
    const exp = Number(payload);
    if (!Number.isFinite(exp) || exp < Date.now()) return false;
    const expected = createHmac("sha256", password()).update(payload).digest("base64url");
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function requireAdmin() {
  if (!(await isAdmin())) {
    const error = new Error("UNAUTHORIZED");
    throw error;
  }
}
