// Money and dates, formatted the same way on every screen.

export function formatPkr(amount: number) {
  return amount === 0 ? "Free" : `PKR ${amount.toLocaleString("en-PK")}`;
}

// Shown in the viewer's own timezone (a student abroad sees their local time).
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDuration(seconds: number | null) {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

export function initials(name: string) {
  return name
    .replace(/\[.*?\]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export const METHOD_LABELS = { EASYPAISA: "Easypaisa", JAZZCASH: "JazzCash", BANK_TRANSFER: "Bank transfer" } as const;

// <input type="datetime-local"> gives local time without a zone; the API wants one.
export function localInputToIso(value: string) {
  return new Date(value).toISOString();
}

const HONORIFICS = new Set(["ustadha", "ustadh", "hafiza", "hafiz", "qari", "qaria", "sheikh", "shaykh", "maulana", "mufti", "dr", "dr."]);

// "Assalamu Alaikum, Ayesha" / "…, Ustadha Maryam" — first name (kept with its title),
// without the [SAMPLE] marker.
export function greetingName(fullName: string | undefined) {
  const words = (fullName ?? "").replace(/\[.*?\]/g, "").trim().split(/\s+/).filter(Boolean);
  if (words.length > 1 && HONORIFICS.has(words[0].toLowerCase())) return `${words[0]} ${words[1]}`;
  return words[0] ?? "";
}
