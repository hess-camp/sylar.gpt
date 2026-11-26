import { Resend } from "resend";
import { buildCertificatePdf } from "./certificate-pdf";
import { readCertificateSettings } from "./certificate-settings";
import type { Signin } from "./db";
import { displayName } from "./meeting";

const SUBJECT = "HCT 美語教務主管會議 出席證明";
const FAILED_NOTE = "簽到已完成。信件這次沒有寄出，您仍可在此下載證明。";
const SENT_NOTE = "出席證明已寄到您的信箱。";

export function normalizeEmail(value: unknown) {
  return String(value ?? "").trim();
}

export function isOptionalEmail(value: string) {
  if (!value) return true;
  if (value.length > 120) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function fromAddress() {
  return process.env.EMAIL_FROM?.trim() || "onboarding@resend.dev";
}

export async function emailCertificate(signin: Signin): Promise<{ sent: boolean; note: string }> {
  if (!signin.email) return { sent: false, note: "" };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("certificate email skipped: RESEND_API_KEY is not set");
    return { sent: false, note: FAILED_NOTE };
  }
  try {
    const { effective } = await readCertificateSettings();
    const name = displayName(signin.nameZh, signin.nameEn);
    const pdf = await buildCertificatePdf({
      name,
      branch: signin.branch,
      region: signin.region,
      signedAt: signin.signedAt,
      settings: effective,
    });
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: signin.email,
      subject: SUBJECT,
      text: [
        `${name} 您好，`,
        "",
        "感謝您出席 HCT 美語教務主管會議。",
        "出席證明附在這封信裡，方便您留存或交給學校。",
        "",
        "歡迎您出席，祝您今日收穫滿滿。",
      ].join("\n"),
      attachments: [
        {
          filename: "出席證明.pdf",
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });
    if (error) {
      console.error("certificate email failed:", error.name, error.message);
      return { sent: false, note: FAILED_NOTE };
    }
    return { sent: true, note: SENT_NOTE };
  } catch (error) {
    console.error("certificate email failed:", error instanceof Error ? error.message : "unknown error");
    return { sent: false, note: FAILED_NOTE };
  }
}
