// Where uploaded files (payment screenshots, later voice notes and videos) live.
// For now: a folder on the server's disk (UPLOAD_DIR). Everything else in the app
// only uses these functions, so moving to cloud storage (S3, R2, Cloudinary)
// later means changing this one file.
//
// Files are saved under random names like "payments/2f1c…e9.png" (a "key") and are
// never served directly: routes check who is asking, then stream the file.
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "../config/env.ts";

export type StoredFileType = "jpg" | "png" | "webp";

export const CONTENT_TYPES: Record<StoredFileType, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// Only keys we generate ourselves are accepted, so a crafted key like
// "../../.env" can never reach outside the uploads folder.
const KEY_PATTERN = /^[a-z-]+\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

function root() {
  return path.resolve(env.UPLOAD_DIR);
}

export async function saveFile(folder: string, data: Buffer, type: StoredFileType) {
  const key = `${folder}/${randomUUID()}.${type}`;
  const fullPath = path.join(root(), key);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, data);
  return key;
}

// Returns the absolute path and content type of a stored file, or null if the
// key is invalid or the file is missing.
export function locateFile(key: string) {
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  const fullPath = path.join(root(), key);
  if (!existsSync(fullPath)) return null;
  return { fullPath, contentType: CONTENT_TYPES[match[1] as StoredFileType] };
}
