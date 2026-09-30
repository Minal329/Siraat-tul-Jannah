import { describe, expect, it } from "@jest/globals";
import { formatDuration, formatPkr, greetingName, parseLocalDateTime } from "../format.ts";

describe("format helpers", () => {
  it("shows whole rupees", () => {
    expect(formatPkr(8000)).toContain("8,000");
  });

  it("shows lecture lengths", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(1500)).toBe("25 min");
  });

  it("keeps honorifics with the first name", () => {
    expect(greetingName("Ustadha Maryam Siddiqui")).toBe("Ustadha Maryam");
    expect(greetingName("Ayesha Khan")).toBe("Ayesha");
  });
});

describe("parseLocalDateTime", () => {
  it("reads a date and 24-hour time in the phone's time zone", () => {
    const d = parseLocalDateTime(" 2026-10-05 ", "17:30")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 5, 17, 30]);
  });

  it("rejects badly typed or impossible dates and times", () => {
    for (const [date, time] of [["05/10/2026", "17:30"], ["2026-02-30", "10:00"], ["2026-10-05", "25:00"], ["2026-10-05", "5pm"], ["", ""]]) {
      expect(parseLocalDateTime(date, time)).toBeNull();
    }
  });
});
