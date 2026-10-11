import { describe, expect, it } from "@jest/globals";
import { certificateImageProblem } from "../certificateImage.ts";

describe("certificate image rules (the server checks the same)", () => {
  it("accepts A4 landscape images: 1600 × 1131 and the usual A4 exports", () => {
    for (const [width, height] of [[1600, 1131], [3508, 2480], [1754, 1240], [842, 595]]) {
      expect(certificateImageProblem({ width, height, mimeType: "image/png" })).toBeNull();
    }
  });

  it("rejects other shapes, naming the required size", () => {
    expect(certificateImageProblem({ width: 1920, height: 1080 })).toMatch(/1920 × 1080 px, which isn't the A4 landscape shape.*1600 × 1131 px/);
    expect(certificateImageProblem({ width: 1131, height: 1600 })).toMatch(/portrait/);
    expect(certificateImageProblem({ width: 400, height: 283 })).toMatch(/blurry/);
  });

  it("rejects images over the 5 MB upload limit before uploading", () => {
    expect(certificateImageProblem({ width: 1600, height: 1131, fileSize: 6 * 1024 * 1024 })).toMatch(/6\.0 MB; the limit is 5 MB/);
    expect(certificateImageProblem({ width: 1600, height: 1131, fileSize: 4 * 1024 * 1024 })).toBeNull();
  });

  it("rejects files that aren't JPG, PNG or WebP", () => {
    expect(certificateImageProblem({ width: 1600, height: 1131, mimeType: "image/gif" })).toBe("The certificate must be a JPG, PNG or WebP image.");
    expect(certificateImageProblem({ width: 1600, height: 1131, mimeType: "image/heic" })).not.toBeNull();
  });
});
