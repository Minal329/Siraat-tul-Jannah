// Accepts one uploaded file in a form field: payment screenshots (images) and
// teacher voice notes (audio).
//
// Files are held in memory, not written to disk, until the route has checked
// that the person is allowed to upload. Then we check the file's actual bytes:
// the browser-supplied type and file name are easy to fake, the bytes are not.
import multer from "multer";
import type { AudioFileType, ImageFileType } from "../lib/storage.ts";
import { AppError } from "../utils/AppError.ts";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB is plenty for a phone screenshot
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // ~10 minutes of compressed voice

export function singleFileUpload(fieldName: string, maxBytes: number) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 10 },
  }).single(fieldName);
}

export const imageUpload = (fieldName: string) => singleFileUpload(fieldName, MAX_IMAGE_BYTES);
export const audioUpload = (fieldName: string) => singleFileUpload(fieldName, MAX_AUDIO_BYTES);

const startsWith = (data: Buffer, bytes: number[], offset = 0) =>
  data.length >= offset + bytes.length && bytes.every((byte, i) => data[offset + i] === byte);
const ascii = (data: Buffer, start: number, end: number) =>
  data.length >= end ? data.toString("ascii", start, end) : "";

// Recognises JPEG, PNG and WebP from their first bytes ("magic numbers").
export function detectImageType(data: Buffer): ImageFileType | null {
  if (startsWith(data, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 12) === "WEBP") return "webp";
  return null;
}

// Recognises the formats phones and browsers record voice notes in:
// WebM (Chrome/Android web), Ogg (WhatsApp-style Opus), MP3, M4A (iPhone) and WAV.
export function detectAudioType(data: Buffer): AudioFileType | null {
  if (startsWith(data, [0x1a, 0x45, 0xdf, 0xa3])) return "webm";
  if (ascii(data, 0, 4) === "OggS") return "ogg";
  if (ascii(data, 0, 3) === "ID3" || startsWith(data, [0xff, 0xfb]) || startsWith(data, [0xff, 0xf3]) || startsWith(data, [0xff, 0xf2])) {
    return "mp3";
  }
  if (ascii(data, 4, 8) === "ftyp") return "m4a";
  if (ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 12) === "WAVE") return "wav";
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

export function requireAudio(file: Express.Multer.File) {
  const type = detectAudioType(file.buffer);
  if (!type) {
    throw new AppError(400, "INVALID_FILE", "The voice note must be a WebM, Ogg, MP3, M4A or WAV recording.");
  }
  return { data: file.buffer, type };
}
