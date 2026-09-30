// Accepts one image upload (a payment screenshot) in a form field.
//
// Files are held in memory, not written to disk, until the route has checked
// that the student is allowed to upload. Then we check the file's actual bytes:
// the browser-supplied type and file name are easy to fake, the bytes are not.
import multer from "multer";
import type { StoredFileType } from "../lib/storage.ts";
import { AppError } from "../utils/AppError.ts";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB is plenty for a phone screenshot

export function imageUpload(fieldName: string) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 10 },
  }).single(fieldName);
}

// Recognises JPEG, PNG and WebP from their first bytes ("magic numbers").
export function detectImageType(data: Buffer): StoredFileType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

export function requireImage(file: Express.Multer.File | undefined) {
  if (!file) {
    throw new AppError(400, "FILE_REQUIRED", "Please attach a screenshot of your payment.");
  }
  const type = detectImageType(file.buffer);
  if (!type) {
    throw new AppError(400, "INVALID_FILE", "The screenshot must be a JPG, PNG or WebP image.");
  }
  return { data: file.buffer, type };
}
