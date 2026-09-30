// Creates Zoom meetings through Zoom's API, using a "Server-to-Server OAuth" app
// in the academy's own Zoom account (no teacher has to log in to anything).
//
// Optional: when ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET aren't set,
// admins paste meeting IDs by hand as before.
import { env } from "../config/env.ts";
import { AppError } from "../utils/AppError.ts";

const TOKEN_URL = "https://zoom.us/oauth/token";
const API_URL = "https://api.zoom.us/v2";

// The link students tap to join: the one Zoom gave us when the meeting was created
// through the API, or else built from a meeting ID typed by hand
// ("123 456 7890" → https://zoom.us/j/1234567890, which opens the Zoom app or browser).
export function zoomJoinLink(group: { zoomJoinUrl: string | null; zoomMeetingId: string | null }) {
  if (group.zoomJoinUrl) return group.zoomJoinUrl;
  const digits = group.zoomMeetingId?.replace(/\D/g, "");
  return digits ? `https://zoom.us/j/${digits}` : null;
}

export function zoomConfigured() {
  return Boolean(env.ZOOM_ACCOUNT_ID && env.ZOOM_CLIENT_ID && env.ZOOM_CLIENT_SECRET);
}

const zoomFailed = () => new AppError(502, "ZOOM_ERROR", "Zoom didn't accept the request. Please try again, or paste a meeting ID by hand.");

// Zoom's access tokens last an hour; reuse one until shortly before it expires.
let cached: { token: string; expiresAt: number } | null = null;

export function clearZoomTokenCache() {
  cached = null;
}

async function accessToken() {
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const credentials = Buffer.from(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`).toString("base64");
  const url = `${TOKEN_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(env.ZOOM_ACCOUNT_ID!)}`;
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Basic ${credentials}` } }).catch(() => null);
  if (!res?.ok) throw zoomFailed();
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
  return cached.token;
}

export type ZoomMeeting = { meetingId: string; passcode: string | null; joinUrl: string };

// A "recurring meeting with no fixed time": one link a class group reuses for
// every class. (Zoom expires these if unused for 365 days.)
export async function createRecurringMeeting(topic: string): Promise<ZoomMeeting> {
  if (!zoomConfigured()) {
    throw new AppError(503, "ZOOM_NOT_CONFIGURED", "Zoom isn't connected yet. Paste a meeting ID by hand, or ask the developer to add the Zoom settings.");
  }
  const res = await fetch(`${API_URL}/users/me/meetings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: topic.slice(0, 200),
      type: 3,
      settings: { waiting_room: true, join_before_host: false, mute_upon_entry: true },
    }),
  }).catch(() => null);
  if (!res?.ok) throw zoomFailed();
  const meeting = (await res.json()) as { id: number | string; password?: string; join_url: string };
  return { meetingId: String(meeting.id), passcode: meeting.password || null, joinUrl: meeting.join_url };
}
