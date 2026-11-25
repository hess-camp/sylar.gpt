import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

const LOCAL_DIR = path.join(process.cwd(), "data", "signatures");

function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function saveSignature(id: string, bytes: Buffer) {
  if (blobEnabled()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`signatures/${id}.png`, bytes, {
      access: "public",
      contentType: "image/png",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
    });
    return blob.url;
  }
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_DIR, `${id}.png`), bytes);
  return `local:${id}`;
}

export async function readSignature(key: string) {
  if (key.startsWith("http://") || key.startsWith("https://")) {
    const response = await fetch(key);
    if (!response.ok) throw new Error("無法讀取簽名圖");
    return Buffer.from(await response.arrayBuffer());
  }
  const id = key.startsWith("local:") ? key.slice("local:".length) : key;
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("簽名路徑不正確");
  return readFile(path.join(LOCAL_DIR, `${id}.png`));
}

export function signatureUrl(id: string, key: string) {
  if (key.startsWith("http://") || key.startsWith("https://")) return key;
  return `/api/signatures/${id}`;
}

export async function deleteSignature(key: string) {
  try {
    if (key.startsWith("http://") || key.startsWith("https://")) {
      if (!blobEnabled()) return;
      const { del } = await import("@vercel/blob");
      await del(key, { token: process.env.BLOB_READ_WRITE_TOKEN });
      return;
    }
    const id = key.startsWith("local:") ? key.slice("local:".length) : key;
    if (!/^[a-zA-Z0-9-]+$/.test(id)) return;
    await unlink(path.join(LOCAL_DIR, `${id}.png`));
  } catch {
    // The record is already gone; a missing file should not block deletion.
  }
}
