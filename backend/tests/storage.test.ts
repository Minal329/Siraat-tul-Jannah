import { rm } from "node:fs/promises";
import { afterAll, describe, expect, it } from "vitest";
import { locateFile, saveFile } from "../src/lib/storage.ts";

afterAll(async () => {
  await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
});

describe("storage", () => {
  it("saves a file and finds it again by its key", async () => {
    const key = await saveFile("payments", Buffer.from("image bytes"), "png");

    expect(key).toMatch(/^payments\/[0-9a-f-]{36}\.png$/);
    expect(locateFile(key)).toMatchObject({ contentType: "image/png" });
  });

  it("refuses keys that try to escape the uploads folder or weren't made by us", () => {
    for (const key of ["../../.env", "payments/../../../etc/passwd", "/etc/passwd", "payments/x.png", "payments/.env"]) {
      expect(locateFile(key)).toBeNull();
    }
  });

  it("returns null for a valid-looking key whose file is missing", () => {
    expect(locateFile("payments/00000000-0000-4000-8000-000000000000.png")).toBeNull();
  });
});
