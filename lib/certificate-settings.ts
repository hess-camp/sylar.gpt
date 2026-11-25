import defaults from "@/config/certificate.json";
import { getSettings, upsertSettings } from "./db";

export const CERT_SETTING_KEYS = {
  meetingDate: "cert.meetingDate",
  meetingName: "cert.meetingName",
  time: "cert.time",
  issuer: "cert.issuer",
  organizer: "cert.organizer",
} as const;

export type CertificateInput = {
  meetingDate: string;
  meetingName: string;
  time: string;
  issuer: string;
  organizer: string;
};

const DATE_RE = /^(\d{4})[./-](\d{2})[./-](\d{2})$/;

export function taipeiDateDots(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}.${get("month")}.${get("day")}`;
}

export function normalizeMeetingDate(value: string) {
  const match = value.trim().match(DATE_RE);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return "";
  }
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function pick(stored: string | undefined, fallback: string) {
  const value = (stored ?? "").trim();
  return value || fallback.trim();
}

export function mergeCertificateSettings(stored: Partial<CertificateInput>, now = new Date()): CertificateInput {
  const storedDate = normalizeMeetingDate(stored.meetingDate ?? "");
  const configDate = normalizeMeetingDate(defaults.meetingDate ?? "");
  return {
    meetingDate: storedDate || configDate || taipeiDateDots(now),
    meetingName: pick(stored.meetingName, defaults.meetingName),
    time: pick(stored.time, defaults.time),
    issuer: pick(stored.issuer, defaults.issuer),
    organizer: pick(stored.organizer, defaults.organizer),
  };
}

export function certificateDefaults(): CertificateInput {
  return {
    meetingDate: normalizeMeetingDate(defaults.meetingDate ?? ""),
    meetingName: defaults.meetingName.trim(),
    time: defaults.time.trim(),
    issuer: defaults.issuer.trim(),
    organizer: defaults.organizer.trim(),
  };
}

function storedFromMap(map: Map<string, string>): CertificateInput {
  return {
    meetingDate: map.get(CERT_SETTING_KEYS.meetingDate) ?? "",
    meetingName: map.get(CERT_SETTING_KEYS.meetingName) ?? "",
    time: map.get(CERT_SETTING_KEYS.time) ?? "",
    issuer: map.get(CERT_SETTING_KEYS.issuer) ?? "",
    organizer: map.get(CERT_SETTING_KEYS.organizer) ?? "",
  };
}

export async function readCertificateSettings(now = new Date()) {
  const map = await getSettings(Object.values(CERT_SETTING_KEYS));
  const stored = storedFromMap(map);
  return {
    stored,
    defaults: certificateDefaults(),
    effective: mergeCertificateSettings(stored, now),
    today: taipeiDateDots(now),
  };
}

export async function writeCertificateSettings(stored: CertificateInput, now = new Date()) {
  await upsertSettings([
    { key: CERT_SETTING_KEYS.meetingDate, value: stored.meetingDate },
    { key: CERT_SETTING_KEYS.meetingName, value: stored.meetingName },
    { key: CERT_SETTING_KEYS.time, value: stored.time },
    { key: CERT_SETTING_KEYS.issuer, value: stored.issuer },
    { key: CERT_SETTING_KEYS.organizer, value: stored.organizer },
  ]);
  return {
    stored,
    defaults: certificateDefaults(),
    effective: mergeCertificateSettings(stored, now),
    today: taipeiDateDots(now),
  };
}
