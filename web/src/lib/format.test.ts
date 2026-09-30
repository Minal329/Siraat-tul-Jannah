import { describe, expect, it } from "vitest";
import { formatDuration, formatPkr, greetingName, initials } from "./format.ts";

describe("format", () => {
  it("shows fees as PKR, or Free", () => {
    expect(formatPkr(0)).toBe("Free");
    expect(formatPkr(2500)).toBe("PKR 2,500");
  });

  it("shows durations in hours and minutes", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(45 * 60)).toBe("45 min");
    expect(formatDuration(90 * 60)).toBe("1 h 30 min");
  });

  it("makes initials without the [SAMPLE] marker", () => {
    expect(initials("Ayesha Siddiqui [SAMPLE]")).toBe("AS");
    expect(initials("Hafiza Aqsa Jamil")).toBe("HA");
  });

  it("greets by first name, keeping a title like Ustadha or Hafiza with it", () => {
    expect(greetingName("Ayesha Siddiqui [SAMPLE]")).toBe("Ayesha");
    expect(greetingName("Ustadha Maryam [SAMPLE]")).toBe("Ustadha Maryam");
    expect(greetingName("Hafiza Aqsa Jamil")).toBe("Hafiza Aqsa");
    expect(greetingName(undefined)).toBe("");
  });
});
