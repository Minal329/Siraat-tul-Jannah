import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { saveViewAsImage, shareViewAsImage } from "../saveImage.ts";

const mockCapture = jest.fn(async () => "file:///tmp/certificate.png");
const mockRequest = jest.fn(async () => ({ granted: true }));
const mockCreate = jest.fn(async () => ({}));
const mockShare = jest.fn(async () => undefined);
jest.mock("react-native-view-shot", () => ({ captureRef: (...args: unknown[]) => mockCapture(...(args as [])) }));
jest.mock("expo-media-library", () => ({
  requestPermissionsAsync: (...args: unknown[]) => mockRequest(...(args as [])),
  Asset: { create: (...args: unknown[]) => mockCreate(...(args as [])) },
}));
jest.mock("expo-sharing", () => ({ isAvailableAsync: async () => true, shareAsync: (...args: unknown[]) => mockShare(...(args as [])) }));

const view = { current: {} } as never;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("saving the certificate as an image", () => {
  it("captures a sharp PNG and saves it to the photos", async () => {
    await expect(saveViewAsImage(view, "certificate.png")).resolves.toBe("Saved to your photos ✓");
    expect(mockCapture).toHaveBeenCalledWith(view, expect.objectContaining({ format: "png", width: 1080, result: "tmpfile" }));
    expect(mockRequest).toHaveBeenCalledWith(true); // write-only: the app never reads the photos
    expect(mockCreate).toHaveBeenCalledWith("file:///tmp/certificate.png");
  });

  it("explains what to do when photo access is refused", async () => {
    mockRequest.mockResolvedValueOnce({ granted: false });
    await expect(saveViewAsImage(view, "certificate.png")).rejects.toThrow("Please allow access to your photos");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("shares the PNG through the phone's share sheet", async () => {
    await shareViewAsImage(view, "certificate.png");
    expect(mockShare).toHaveBeenCalledWith("file:///tmp/certificate.png", expect.objectContaining({ mimeType: "image/png" }));
  });
});
