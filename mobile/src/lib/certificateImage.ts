// Certificate images: the size rules, choosing an image from the phone, and
// sending it to the API. The server checks every upload again (the file's real
// bytes and its shape); checking here first just gives a quicker, clearer answer.
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

// A4 landscape. Certificates are drawn and saved at this size.
export const CERTIFICATE_WIDTH = 1600;
export const CERTIFICATE_HEIGHT = 1131;
const RATIO = CERTIFICATE_WIDTH / CERTIFICATE_HEIGHT;
const RATIO_TOLERANCE = 0.01; // same as the server
const MIN_WIDTH = 800;
const MAX_BYTES = 5 * 1024 * 1024; // same limit as the server
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export const SIZE_HINT = `Use a landscape image of ${CERTIFICATE_WIDTH} × ${CERTIFICATE_HEIGHT} px (A4 landscape), or larger in the same shape.`;
export const SIZE_RULES = `${CERTIFICATE_WIDTH} × ${CERTIFICATE_HEIGHT} px (A4 landscape) · JPG, PNG or WebP · up to 5 MB`;

export type PickedImage = { uri: string; width: number; height: number; mimeType: string; fileName: string };

/** Returns what's wrong with an image, or null when it can be used as a certificate. */
export function certificateImageProblem(image: { width: number; height: number; mimeType?: string | null; fileSize?: number | null }): string | null {
  if (image.mimeType && !TYPES.includes(image.mimeType)) return "The certificate must be a JPG, PNG or WebP image.";
  if (image.fileSize && image.fileSize > MAX_BYTES) {
    return `This image is ${(image.fileSize / 1024 / 1024).toFixed(1)} MB; the limit is 5 MB. Export it as JPG (or a smaller PNG) and try again.`;
  }
  const { width, height } = image;
  if (!width || !height) return null; // size unknown here: the server will check it
  if (width < height) return `This image is portrait (${width} × ${height} px). ${SIZE_HINT}`;
  if (Math.abs(width / height - RATIO) / RATIO > RATIO_TOLERANCE) {
    return `This image is ${width} × ${height} px, which isn't the A4 landscape shape. ${SIZE_HINT}`;
  }
  if (width < MIN_WIDTH) return `This image is only ${width} × ${height} px and would look blurry. ${SIZE_HINT}`;
  return null;
}

/** Lets the admin choose an image. Null if they cancelled; throws with a clear message if it doesn't fit. */
export async function pickCertificateImage(): Promise<PickedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
    allowsEditing: false, // no cropping: the design must stay exactly as it was made
    // iPhones: hand over a JPEG/PNG rather than HEIC, which the server doesn't accept.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const image = {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType ?? "image/jpeg",
    fileName: asset.fileName ?? "certificate.jpg",
  };
  const problem = certificateImageProblem({ ...image, fileSize: asset.fileSize });
  if (problem) throw new Error(problem);
  return image;
}

/** The upload body: the image in a form field called "image". */
export async function certificateImageForm(image: PickedImage) {
  const form = new FormData();
  if (Platform.OS === "web") {
    form.append("image", await (await fetch(image.uri)).blob(), image.fileName);
  } else {
    // React Native's FormData accepts a file described by its uri.
    form.append("image", { uri: image.uri, name: image.fileName, type: image.mimeType } as unknown as Blob);
  }
  return form;
}
