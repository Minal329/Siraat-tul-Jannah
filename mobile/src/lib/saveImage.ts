// Turns a view on screen into a PNG, then saves it to the phone's photos or opens
// the share sheet (WhatsApp, etc.). Used for certificates.
import type { RefObject } from "react";
import { Platform, type View } from "react-native";
import { captureRef } from "react-native-view-shot";

// 1080 px wide: sharp on any phone and when printed at A5.
const WIDTH = 1080;

async function capture(view: RefObject<View | null>) {
  if (!view.current) throw new Error("The certificate isn't ready yet. Please try again.");
  return captureRef(view, {
    format: "png",
    quality: 1,
    width: WIDTH,
    result: Platform.OS === "web" ? "data-uri" : "tmpfile",
  });
}

// In the browser preview, "saving" means downloading the file.
function download(dataUri: string, fileName: string) {
  const link = document.createElement("a");
  link.href = dataUri;
  link.download = fileName;
  link.click();
}

/** Saves the view as a PNG in the phone's photos. Returns a message to show. */
export async function saveViewAsImage(view: RefObject<View | null>, fileName: string): Promise<string> {
  const uri = await capture(view);
  if (Platform.OS === "web") {
    download(uri, fileName);
    return "Image downloaded.";
  }
  // Loaded only here, on a phone: the photo library module doesn't exist in the browser preview.
  const MediaLibrary: typeof import("expo-media-library") = require("expo-media-library");
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) {
    throw new Error("Please allow access to your photos so the certificate can be saved.");
  }
  await MediaLibrary.Asset.create(uri);
  return "Saved to your photos ✓";
}

/** Opens the share sheet with the view as a PNG (e.g. to send on WhatsApp). */
export async function shareViewAsImage(view: RefObject<View | null>, fileName: string): Promise<void> {
  const uri = await capture(view);
  if (Platform.OS === "web") {
    download(uri, fileName);
    return;
  }
  const Sharing: typeof import("expo-sharing") = require("expo-sharing");
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this phone.");
  await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your certificate", UTI: "public.png" });
}
